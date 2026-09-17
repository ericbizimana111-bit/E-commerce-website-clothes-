const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { logAudit } = require('./audit.service');

/**
 * Concurrency-Safe Inventory Service
 * Protects stock invariant (stockQuantity >= 0) using PostgreSQL row-level locks (FOR UPDATE)
 * within atomic Prisma transactions.
 */

async function applyStockChange({ productId, quantityChange, type, reason = null, referenceId = null, adminId = null, ipAddress = null }) {
  if (typeof quantityChange !== 'number' || isNaN(quantityChange)) {
    throw new AppError('quantityChange must be a valid integer', 400);
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Acquire exclusive row-level lock using PostgreSQL FOR UPDATE
    const rows = await tx.$queryRaw`
      SELECT id, stock_quantity AS "stockQuantity", name_en AS "nameEn", is_active AS "isActive"
      FROM products
      WHERE id = ${productId}
      FOR UPDATE
    `;

    if (!rows || rows.length === 0) {
      throw new AppError(`Product with ID ${productId} not found`, 404);
    }

    const currentProduct = rows[0];
    const previousQuantity = currentProduct.stockQuantity;
    const newQuantity = previousQuantity + quantityChange;

    // 2. Enforce invariant: Stock cannot be negative
    if (newQuantity < 0) {
      throw new AppError(
        `Insufficient stock for product ID ${productId}. Available: ${previousQuantity}, attempted change: ${quantityChange}`,
        400
      );
    }

    // 3. Update product stock
    const updatedProduct = await tx.product.update({
      where: { id: productId },
      data: { stockQuantity: newQuantity },
      select: {
        id: true,
        slug: true,
        sku: true,
        stockQuantity: true,
        isActive: true,
      },
    });

    // 4. Record immutable inventory transaction
    const transaction = await tx.inventoryTransaction.create({
      data: {
        productId,
        quantityChange,
        previousQuantity,
        newQuantity,
        type,
        reason: reason || `Inventory change: ${type}`,
        referenceId: referenceId || null,
        createdBy: adminId || null,
      },
    });

    // 5. Record audit log
    if (adminId) {
      await logAudit({
        adminId,
        action: `INVENTORY_${type}`,
        entityName: 'Product',
        entityId: productId,
        details: {
          quantityChange,
          previousQuantity,
          newQuantity,
          reason,
          referenceId,
        },
        ipAddress,
      });
    }

    return {
      product: updatedProduct,
      transaction,
    };
  });
}

/**
 * Restock inventory (increases stock by positive integer)
 */
async function restock({ productId, quantity, reason = 'Administrative restock', referenceId = null, adminId = null, ipAddress = null }) {
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new AppError('Restock quantity must be a positive integer', 400);
  }
  return await applyStockChange({
    productId,
    quantityChange: quantity,
    type: 'RESTOCK',
    reason,
    referenceId,
    adminId,
    ipAddress,
  });
}

/**
 * Adjust inventory (can be positive or negative integer, e.g. for damage or count correction)
 */
async function adjustStock({ productId, quantityChange, reason = 'Administrative adjustment', referenceId = null, adminId = null, ipAddress = null }) {
  if (quantityChange === 0 || !Number.isInteger(quantityChange)) {
    throw new AppError('Adjustment quantity must be a non-zero integer', 400);
  }
  return await applyStockChange({
    productId,
    quantityChange,
    type: 'ADJUSTMENT',
    reason,
    referenceId,
    adminId,
    ipAddress,
  });
}

/**
 * Check if a product has sufficient stock without mutating
 */
async function checkAvailableStock(productId, requestedQuantity = 1) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      stockQuantity: true,
      isActive: true,
    },
  });

  if (!product) {
    throw new AppError(`Product with ID ${productId} not found`, 404);
  }

  const isAvailable = product.isActive && product.stockQuantity >= requestedQuantity;
  return {
    productId: product.id,
    stockQuantity: product.stockQuantity,
    requestedQuantity,
    isAvailable,
    inStock: product.stockQuantity > 0,
  };
}

/**
 * Get inventory transaction history for a product with pagination
 */
async function getInventoryHistory(productId, { page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const productExists = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, sku: true },
  });

  if (!productExists) {
    throw new AppError(`Product with ID ${productId} not found`, 404);
  }

  const [total, transactions] = await Promise.all([
    prisma.inventoryTransaction.count({ where: { productId } }),
    prisma.inventoryTransaction.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
      include: {
        admin: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    }),
  ]);

  return {
    product: productExists,
    items: transactions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

module.exports = {
  applyStockChange,
  restock,
  adjustStock,
  checkAvailableStock,
  getInventoryHistory,
};
