const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { resolveTranslation, normalizeLanguage } = require('../utils/translation');
const { calculateSubtotal } = require('../utils/currency');

const MAX_QUANTITY_PER_ITEM = 1000;

// ============================================================
// Concurrency-safe cart get-or-create
// Uses the DB-level unique constraint on carts.user_id:
// two simultaneous requests can never create duplicate carts.
// ============================================================
async function getOrCreateCart(userId) {
  const existing = await prisma.cart.findUnique({ where: { userId } });
  if (existing) return existing;

  try {
    return await prisma.cart.create({ data: { userId } });
  } catch (error) {
    // P2002: lost a create race -> the winner's cart exists, re-read it
    if (error.code === 'P2002') {
      const cart = await prisma.cart.findUnique({ where: { userId } });
      if (cart) return cart;
    }
    throw error;
  }
}

// ============================================================
// Localized product summary for cart lines (reuses Phase 3 architecture)
// ============================================================
function formatCartProduct(product, lang) {
  const localized = resolveTranslation(product.translations || [], lang, product.nameEn || '', product.descriptionEn || '');
  const primaryImage = (product.images || []).find((img) => img.isPrimary) || (product.images || [])[0] || null;

  return {
    id: product.id,
    slug: product.slug,
    name: localized.name,
    unit: product.unit,
    priceUgx: product.priceUgx,
    isActive: product.isActive,
    stockQuantity: product.stockQuantity,
    image: primaryImage ? primaryImage.imageUrl : product.imageUrl || null,
  };
}

// ============================================================
// Authoritative product read with purchasability validation
// ============================================================
async function getAuthoritativeProduct(productId) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { translations: true, images: true },
  });

  if (!product) {
    throw new AppError(`Product with ID ${productId} does not exist`, 404);
  }
  if (!product.isActive) {
    throw new AppError(`Product '${product.slug}' is currently unavailable`, 400);
  }
  return product;
}

function validateStock(product, requestedQuantity) {
  if (product.stockQuantity < requestedQuantity) {
    throw new AppError(
      `Insufficient stock for '${product.slug}'. Available: ${product.stockQuantity}, requested: ${requestedQuantity}`,
      409
    );
  }
}

// ============================================================
// Format a full cart response (server-calculated totals only)
// ============================================================
async function formatCartResponse(cart, lang = 'EN') {
  const normLang = normalizeLanguage(lang);

  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    orderBy: { createdAt: 'asc' },
    include: {
      product: {
        include: { translations: true, images: true },
      },
    },
  });

  const formattedItems = items.map((item) => {
    // Current DB price is ALWAYS authoritative for display and totals.
    // The stored snapshot is exposed for stale-price detection only.
    const currentProductPrice = item.product.priceUgx;
    const snapshot = item.unitPriceUgx;
    const isStale = snapshot !== null && snapshot !== undefined && snapshot !== currentProductPrice;

    const qty = Math.trunc(Number(item.quantity));
    const unitPrice = Math.trunc(Number(currentProductPrice));
    const subtotal = Math.trunc(qty * unitPrice);

    const product = item.product;
    const availability = {
      inStock: product.stockQuantity > 0,
      sufficientStock: product.stockQuantity >= qty,
      stockQuantity: product.stockQuantity,
      isActive: product.isActive,
      purchasable: product.isActive && product.stockQuantity >= qty,
    };

    return {
      id: item.id,
      productId: item.productId,
      quantity: qty,
      unitPriceUgx: unitPrice,
      cartPriceUgx: snapshot ?? unitPrice,
      subtotalUgx: subtotal,
      priceIsStale: isStale,
      availability,
      product: formatCartProduct(product, normLang),
    };
  });

  const subtotalUgx = formattedItems.reduce((sum, item) => sum + item.subtotalUgx, 0);

  return {
    cart: {
      id: cart.id,
      itemCount: formattedItems.reduce((sum, item) => sum + item.quantity, 0),
      lineCount: formattedItems.length,
      items: formattedItems,
      subtotalUgx,
      totalUgx: subtotalUgx,
      currency: 'UGX',
    },
  };
}

// ============================================================
// GET current cart
// ============================================================
async function getCart(userId, lang = 'EN') {
  const cart = await getOrCreateCart(userId);
  return formatCartResponse(cart, lang);
}

// ============================================================
// ADD item (create or increment atomically)
// ============================================================
async function addItem(userId, { productId, quantity }, lang = 'EN') {
  const cart = await getOrCreateCart(userId);

  const result = await prisma.$transaction(async (tx) => {
    // Lock the product row so concurrent adds read a consistent stock level
    const rows = await tx.$queryRaw`
      SELECT id FROM products WHERE id = ${productId} FOR UPDATE
    `;
    if (!rows || rows.length === 0) {
      throw new AppError(`Product with ID ${productId} does not exist`, 404);
    }

    const product = await tx.product.findUnique({
      where: { id: productId },
      include: { translations: true, images: true },
    });
    if (!product) {
      throw new AppError(`Product with ID ${productId} does not exist`, 404);
    }
    if (!product.isActive) {
      throw new AppError(`Product '${product.slug}' is currently unavailable`, 400);
    }

    const existingItem = await tx.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
    });

    const existingQty = existingItem ? Math.trunc(Number(existingItem.quantity)) : 0;
    const newQuantity = existingQty + quantity;

    if (newQuantity > MAX_QUANTITY_PER_ITEM) {
      throw new AppError(`Quantity cannot exceed ${MAX_QUANTITY_PER_ITEM} per item`, 400);
    }

    // Whole-operation rejection: no partial adds
    validateStock(product, newQuantity);

    if (existingItem) {
      return await tx.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQuantity,
          unitPriceUgx: product.priceUgx, // refresh snapshot to authoritative price
        },
      });
    }

    return await tx.cartItem.create({
      data: {
        cartId: cart.id,
        productId,
        quantity: newQuantity,
        unitPriceUgx: product.priceUgx, // server-side snapshot; client price never trusted
      },
    });
  });

  return formatCartResponse(cart, lang);
}

// ============================================================
// UPDATE item quantity (ownership-scoped, atomic)
// ============================================================
async function updateItem(userId, itemId, { quantity }, lang = 'EN') {
  const cart = await getOrCreateCart(userId);

  const result = await prisma.$transaction(async (tx) => {
    // Ownership-scoped read: another customer's item simply does not exist here
    const item = await tx.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) {
      throw new AppError('Cart item not found in your cart', 404);
    }

    const product = await tx.product.findUnique({
      where: { id: item.productId },
      include: { translations: true, images: true },
    });
    if (!product) {
      throw new AppError('Product for this cart item no longer exists', 410);
    }
    if (!product.isActive) {
      throw new AppError(`Product '${product.slug}' is currently unavailable`, 400);
    }

    validateStock(product, quantity);

    return await tx.cartItem.update({
      where: { id: item.id },
      data: {
        quantity,
        unitPriceUgx: product.priceUgx,
      },
    });
  });

  return formatCartResponse(cart, lang);
}

// ============================================================
// REMOVE item (ownership-scoped)
// ============================================================
async function removeItem(userId, itemId, lang = 'EN') {
  const cart = await getOrCreateCart(userId);

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
  });
  if (!item) {
    throw new AppError('Cart item not found in your cart', 404);
  }

  await prisma.cartItem.delete({ where: { id: item.id } });
  return formatCartResponse(cart, lang);
}

// ============================================================
// CLEAR cart (removes items, preserves the cart record)
// ============================================================
async function clearCart(userId, lang = 'EN') {
  const cart = await getOrCreateCart(userId);

  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  return formatCartResponse(cart, lang);
}

// ============================================================
// Cart validation for checkout preparation (read-only)
// Returns authoritative item states; does NOT mutate anything.
// ============================================================
async function validateCartForCheckout(userId) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            include: { translations: true },
          },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    throw new AppError('Your cart is empty', 400);
  }

  const issues = [];
  const items = cart.items.map((item) => {
    const qty = Math.trunc(Number(item.quantity));
    const product = item.product;
    const currentPrice = product.priceUgx;
    const snapshot = item.unitPriceUgx;
    const stale = snapshot !== null && snapshot !== undefined && snapshot !== currentPrice;
    const effectivePrice = currentPrice; // current DB price is always authoritative for checkout

    const lineSubtotal = Math.trunc(qty * effectivePrice);

    if (!product.isActive) {
      issues.push({
        cartItemId: item.id,
        productId: product.id,
        slug: product.slug,
        issue: 'PRODUCT_INACTIVE',
        message: `Product '${product.slug}' is no longer available`,
      });
    }
    if (product.stockQuantity < qty) {
      issues.push({
        cartItemId: item.id,
        productId: product.id,
        slug: product.slug,
        issue: 'INSUFFICIENT_STOCK',
        message: `Insufficient stock for '${product.slug}'. Available: ${product.stockQuantity}, in cart: ${qty}`,
      });
    }
    if (stale) {
      issues.push({
        cartItemId: item.id,
        productId: product.id,
        slug: product.slug,
        issue: 'STALE_PRICE',
        message: `Price for '${product.slug}' changed. Cart snapshot: ${snapshot}, current price: ${currentPrice}`,
      });
    }

    return {
      cartItemId: item.id,
      productId: product.id,
      slug: product.slug,
      quantity: qty,
      cartUnitPriceUgx: snapshot,
      currentUnitPriceUgx: currentPrice,
      priceIsStale: stale,
      lineSubtotalUgx: lineSubtotal,
    };
  });

  const subtotalUgx = items.reduce((sum, item) => sum + item.lineSubtotalUgx, 0);

  return { cart, items, issues, subtotalUgx };
}

module.exports = {
  MAX_QUANTITY_PER_ITEM,
  getOrCreateCart,
  formatCartResponse,
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  validateCartForCheckout,
};
