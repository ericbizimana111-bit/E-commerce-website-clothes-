const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { normalizeLanguage, resolveTranslation } = require('../utils/translation');
const { formatLocalizedCategory } = require('./category.service');
const { logAudit } = require('./audit.service');
const imageService = require('./image.service');

/**
 * Format product entity for public responses with localized translation and structured availability
 */
function formatLocalizedProduct(product, requestedLang) {
  const localized = resolveTranslation(
    product.translations,
    requestedLang,
    product.nameEn || '',
    product.descriptionEn || ''
  );

  const localizedCategory = product.category
    ? formatLocalizedCategory(product.category, requestedLang)
    : null;

  const images = (product.images || [])
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.sortOrder - b.sortOrder)
    .map((img) => ({
      id: img.id,
      imageUrl: img.imageUrl,
      altText: img.altText || localized.name,
      isPrimary: img.isPrimary,
      sortOrder: img.sortOrder,
    }));

  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku || null,
    name: localized.name,
    description: localized.description || null,
    price: product.priceUgx,
    currency: 'UGX',
    unit: product.unit,
    language: localized.language,
    availability: {
      inStock: product.stockQuantity > 0,
      stockQuantity: product.stockQuantity,
    },
    category: localizedCategory
      ? {
          id: localizedCategory.id,
          slug: localizedCategory.slug,
          name: localizedCategory.name,
        }
      : null,
    images,
  };
}

/**
 * Public: List products with search, category filtering, price filtering, in-stock filtering, and pagination
 */
async function listPublicProducts({
  page = 1,
  limit = 20,
  categoryId = null,
  categorySlug = null,
  inStock = null,
  minPrice = null,
  maxPrice = null,
  search = null,
  lang = 'EN',
} = {}) {
  const normLang = normalizeLanguage(lang);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  // Query condition: Product MUST be active AND Category MUST be active
  const where = {
    isActive: true,
    category: {
      isActive: true,
    },
  };

  // Category filter
  if (categoryId) {
    where.categoryId = parseInt(categoryId, 10);
  } else if (categorySlug) {
    where.category = {
      ...where.category,
      slug: categorySlug.trim().toLowerCase(),
    };
  }

  // Stock filter
  if (inStock === true || inStock === 'true') {
    where.stockQuantity = { gt: 0 };
  }

  // Price range filters
  if (minPrice !== null && minPrice !== undefined && !isNaN(minPrice)) {
    where.priceUgx = { ...where.priceUgx, gte: parseInt(minPrice, 10) };
  }
  if (maxPrice !== null && maxPrice !== undefined && !isNaN(maxPrice)) {
    where.priceUgx = { ...where.priceUgx, lte: parseInt(maxPrice, 10) };
  }

  // Parameterized search across translations, sku, slug
  if (search && typeof search === 'string' && search.trim().length > 0) {
    const q = search.trim();
    where.OR = [
      { slug: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
      {
        translations: {
          some: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ id: 'desc' }],
      skip,
      take: limitNum,
      include: {
        category: {
          include: { translations: true },
        },
        translations: true,
        images: true,
      },
    }),
  ]);

  return {
    items: products.map((p) => formatLocalizedProduct(p, normLang)),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

/**
 * Public: Get active product by slug
 */
async function getPublicProductBySlug(slug, lang = 'EN') {
  const normLang = normalizeLanguage(lang);

  const product = await prisma.product.findFirst({
    where: {
      slug,
      isActive: true,
      category: { isActive: true },
    },
    include: {
      category: {
        include: { translations: true },
      },
      translations: true,
      images: true,
    },
  });

  if (!product) {
    throw new AppError(`Product '${slug}' not found or is currently unavailable`, 404);
  }

  return formatLocalizedProduct(product, normLang);
}

/**
 * Public: Get active product by ID
 */
async function getPublicProductById(id, lang = 'EN') {
  const normLang = normalizeLanguage(lang);

  const product = await prisma.product.findFirst({
    where: {
      id: parseInt(id, 10),
      isActive: true,
      category: { isActive: true },
    },
    include: {
      category: {
        include: { translations: true },
      },
      translations: true,
      images: true,
    },
  });

  if (!product) {
    throw new AppError(`Product with ID ${id} not found or is currently unavailable`, 404);
  }

  return formatLocalizedProduct(product, normLang);
}

/**
 * Admin: List products with pagination, search, category, and status filters
 */
async function listAdminProducts({
  page = 1,
  limit = 50,
  categoryId = null,
  isActive = null,
  inStock = null,
  search = null,
  lang = 'EN',
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const where = {};
  if (categoryId) {
    where.categoryId = parseInt(categoryId, 10);
  }
  if (isActive !== null && isActive !== undefined) {
    where.isActive = isActive === true || isActive === 'true';
  }
  if (inStock === true || inStock === 'true') {
    where.stockQuantity = { gt: 0 };
  } else if (inStock === false || inStock === 'false') {
    where.stockQuantity = { lte: 0 };
  }

  if (search && typeof search === 'string' && search.trim().length > 0) {
    const q = search.trim();
    where.OR = [
      { slug: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
      {
        translations: {
          some: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ id: 'desc' }],
      skip,
      take: limitNum,
      include: {
        category: {
          include: { translations: true },
        },
        translations: true,
        images: true,
      },
    }),
  ]);

  return {
    items: products,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

/**
 * Admin: Create a new product with translations, initial inventory transaction, and images
 */
async function createProduct(data, adminId = null, ipAddress = null) {
  const {
    categoryId,
    slug,
    sku = null,
    priceUgx,
    stockQuantity = 0,
    unit = 'piece',
    isActive = true,
    translations = [],
    images = [],
  } = data;

  if (priceUgx < 0) {
    throw new AppError('Product price cannot be negative', 400);
  }
  if (stockQuantity < 0) {
    throw new AppError('Initial stock cannot be negative', 400);
  }

  // Validate category exists
  const category = await prisma.category.findUnique({ where: { id: parseInt(categoryId, 10) } });
  if (!category) {
    throw new AppError(`Category with ID ${categoryId} does not exist`, 400);
  }

  // Validate unique slug
  const existingSlug = await prisma.product.findUnique({ where: { slug } });
  if (existingSlug) {
    throw new AppError(`A product with slug '${slug}' already exists`, 409);
  }

  // Validate unique SKU if provided
  if (sku) {
    const existingSku = await prisma.product.findUnique({ where: { sku } });
    if (existingSku) {
      throw new AppError(`A product with SKU '${sku}' already exists`, 409);
    }
  }

  const product = await prisma.$transaction(async (tx) => {
    const enTrans = translations.find((t) => normalizeLanguage(t.language) === 'EN');

    const created = await tx.product.create({
      data: {
        categoryId: parseInt(categoryId, 10),
        slug: slug.trim().toLowerCase(),
        sku: sku ? sku.trim().toUpperCase() : null,
        priceUgx: parseInt(priceUgx, 10),
        stockQuantity: parseInt(stockQuantity, 10) || 0,
        unit: unit ? unit.trim() : 'piece',
        isActive: isActive !== false,
        nameEn: enTrans ? enTrans.name : null,
        imageUrl: images && images.length > 0 ? images[0].imageUrl : null,
      },
    });

    // Create translations
    if (Array.isArray(translations) && translations.length > 0) {
      for (const t of translations) {
        await tx.productTranslation.create({
          data: {
            productId: created.id,
            language: normalizeLanguage(t.language),
            name: t.name.trim(),
            description: t.description ? t.description.trim() : null,
          },
        });
      }
    }

    // Create images
    if (Array.isArray(images) && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        await tx.productImage.create({
          data: {
            productId: created.id,
            imageUrl: img.imageUrl,
            altText: img.altText || null,
            sortOrder: img.sortOrder ?? i,
            isPrimary: img.isPrimary === true || i === 0,
          },
        });
      }
    }

    // Record initial inventory transaction if stock > 0
    if (stockQuantity > 0) {
      await tx.inventoryTransaction.create({
        data: {
          productId: created.id,
          quantityChange: stockQuantity,
          previousQuantity: 0,
          newQuantity: stockQuantity,
          type: 'INITIAL_STOCK',
          reason: 'Initial stock on product creation',
          createdBy: adminId || null,
        },
      });
    }

    return await tx.product.findUnique({
      where: { id: created.id },
      include: {
        category: true,
        translations: true,
        images: true,
      },
    });
  });

  await logAudit({
    adminId,
    action: 'PRODUCT_CREATE',
    entityName: 'Product',
    entityId: product.id,
    details: { slug: product.slug, priceUgx: product.priceUgx },
    ipAddress,
  });

  return product;
}

/**
 * Admin: Update product details and upsert translations
 */
async function updateProduct(id, data, adminId = null, ipAddress = null) {
  const productId = parseInt(id, 10);
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing) {
    throw new AppError(`Product with ID ${id} not found`, 404);
  }

  if (data.priceUgx !== undefined && data.priceUgx < 0) {
    throw new AppError('Product price cannot be negative', 400);
  }

  if (data.categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: parseInt(data.categoryId, 10) } });
    if (!cat) {
      throw new AppError(`Category with ID ${data.categoryId} does not exist`, 400);
    }
  }

  if (data.slug && data.slug !== existing.slug) {
    const slugExists = await prisma.product.findUnique({ where: { slug: data.slug } });
    if (slugExists) {
      throw new AppError(`A product with slug '${data.slug}' already exists`, 409);
    }
  }

  if (data.sku && data.sku !== existing.sku) {
    const skuExists = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (skuExists) {
      throw new AppError(`A product with SKU '${data.sku}' already exists`, 409);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatePayload = {};
    if (data.categoryId) updatePayload.categoryId = parseInt(data.categoryId, 10);
    if (data.slug) updatePayload.slug = data.slug.trim().toLowerCase();
    if (data.sku !== undefined) updatePayload.sku = data.sku ? data.sku.trim().toUpperCase() : null;
    if (data.priceUgx !== undefined) updatePayload.priceUgx = parseInt(data.priceUgx, 10);
    if (data.unit) updatePayload.unit = data.unit.trim();
    if (data.isActive !== undefined) updatePayload.isActive = data.isActive;

    if (Array.isArray(data.translations) && data.translations.length > 0) {
      let enName = null;
      let enDescription = null;
      for (const t of data.translations) {
        const lang = normalizeLanguage(t.language);
        if (lang === 'EN') {
          enName = t.name.trim();
          enDescription = t.description ? t.description.trim() : null;
        }
        await tx.productTranslation.upsert({
          where: {
            productId_language: {
              productId,
              language: lang,
            },
          },
          update: {
            name: t.name.trim(),
            description: t.description ? t.description.trim() : null,
          },
          create: {
            productId,
            language: lang,
            name: t.name.trim(),
            description: t.description ? t.description.trim() : null,
          },
        });
      }
      // Keep legacy fallback columns in sync with the English translation
      if (enName) updatePayload.nameEn = enName;
      if (enDescription !== undefined) updatePayload.descriptionEn = enDescription;
    }

    return await tx.product.update({
      where: { id: productId },
      data: updatePayload,
      include: {
        category: true,
        translations: true,
        images: true,
      },
    });
  });

  await logAudit({
    adminId,
    action: 'PRODUCT_UPDATE',
    entityName: 'Product',
    entityId: productId,
    details: data,
    ipAddress,
  });

  return updated;
}

/**
 * Admin: Get a single product with full detail (category, translations, images).
 * Backs GET /api/admin/catalog/products/:id so the admin edit form can load
 * reliably by ID (the list search endpoint only matches text fields).
 */
async function getProductByIdForAdmin(id) {
  const productId = parseInt(id, 10);
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      category: {
        include: { translations: true },
      },
      translations: true,
      images: {
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      },
    },
  });

  if (!product) {
    throw new AppError(`Product with ID ${id} not found`, 404);
  }

  return product;
}

/**
 * Admin: Upload and attach an image file to a product.
 * Validates the buffer (MIME allowlist + magic bytes), stores it under a
 * server-generated safe filename, and persists the ProductImage reference.
 */
async function uploadProductImage(id, file, { altText = null, isPrimary = false } = {}, adminId = null, ipAddress = null) {
  const productId = parseInt(id, 10);
  const product = await prisma.product.findUnique({ where: { id: productId }, include: { images: true } });
  if (!product) {
    throw new AppError(`Product with ID ${id} not found`, 404);
  }

  if (!file || !file.buffer || file.size === 0) {
    throw new AppError('No image file received. Send multipart/form-data with an "image" field', 400);
  }

  // Validates MIME allowlist, 5 MB limit, and real file signature; generates a
  // safe random filename. Throws 400 AppError on any violation.
  const publicUrl = imageService.saveImageFile(file.buffer, file.mimetype);

  const existingImages = product.images;
  const makePrimary = isPrimary === true || isPrimary === 'true' || existingImages.length === 0;
  const replacedPrimary = existingImages.find((img) => img.isPrimary);

  const created = await prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.productImage.updateMany({
        where: { productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const row = await tx.productImage.create({
      data: {
        productId,
        imageUrl: publicUrl,
        altText: altText && String(altText).trim() ? String(altText).trim().slice(0, 255) : null,
        sortOrder: existingImages.length,
        isPrimary: makePrimary,
      },
    });

    // Product.imageUrl is the denormalized primary-image reference used by
    // legacy consumers; keep it in sync with the primary ProductImage.
    if (makePrimary) {
      await tx.product.update({ where: { id: productId }, data: { imageUrl: publicUrl } });
    }

    return row;
  });

  await logAudit({
    adminId,
    action: 'PRODUCT_IMAGE_UPLOAD',
    entityName: 'Product',
    entityId: productId,
    details: { imageUrl: publicUrl, isPrimary: makePrimary },
    ipAddress,
  });

  // Reference-counted best-effort cleanup of a replaced primary file.
  if (makePrimary && replacedPrimary && replacedPrimary.imageUrl !== publicUrl) {
    await imageService.cleanupOrphanedImageFile(replacedPrimary.imageUrl);
  }

  return created;
}

/**
 * Admin: Remove a product image. Deletes the DB row; the backing file is only
 * unlinked when no other product/category references it.
 */
async function deleteProductImage(id, imageId, adminId = null, ipAddress = null) {
  const productId = parseInt(id, 10);
  const imgId = parseInt(imageId, 10);

  const image = await prisma.productImage.findUnique({ where: { id: imgId } });
  if (!image || image.productId !== productId) {
    throw new AppError(`Image with ID ${imageId} not found for product ${id}`, 404);
  }

  const removed = await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imgId } });

    // If we removed the primary image, promote the first remaining image so
    // the product always has a deterministic primary, and keep the denormalized
    // Product.imageUrl reference in sync.
    if (image.isPrimary) {
      const nextPrimary = await tx.productImage.findFirst({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      if (nextPrimary) {
        await tx.productImage.update({ where: { id: nextPrimary.id }, data: { isPrimary: true } });
        await tx.product.update({ where: { id: productId }, data: { imageUrl: nextPrimary.imageUrl } });
      } else {
        await tx.product.update({ where: { id: productId }, data: { imageUrl: null } });
      }
    }

    return image;
  });

  await logAudit({
    adminId,
    action: 'PRODUCT_IMAGE_DELETE',
    entityName: 'Product',
    entityId: productId,
    details: { imageId: imgId, imageUrl: image.imageUrl },
    ipAddress,
  });

  // Best-effort cleanup: only deletes provably orphaned local files.
  await imageService.cleanupOrphanedImageFile(image.imageUrl);

  return removed;
}

/**
 * Admin: Toggle product active status
 */
async function toggleProductActive(id, isActive, adminId = null, ipAddress = null) {
  const productId = parseInt(id, 10);
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing) {
    throw new AppError(`Product with ID ${id} not found`, 404);
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { isActive },
    include: { translations: true },
  });

  await logAudit({
    adminId,
    action: isActive ? 'PRODUCT_ACTIVATE' : 'PRODUCT_DEACTIVATE',
    entityName: 'Product',
    entityId: productId,
    details: { isActive },
    ipAddress,
  });

  return updated;
}

/**
 * Admin: Manage product images (add, update primary, delete)
 */
async function setProductImages(id, images = [], adminId = null, ipAddress = null) {
  const productId = parseInt(id, 10);
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing) {
    throw new AppError(`Product with ID ${id} not found`, 404);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Delete existing images and replace with new set
    await tx.productImage.deleteMany({ where: { productId } });

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      await tx.productImage.create({
        data: {
          productId,
          imageUrl: img.imageUrl,
          altText: img.altText || null,
          sortOrder: img.sortOrder ?? i,
          isPrimary: img.isPrimary === true || (i === 0 && !images.some((x) => x.isPrimary)),
        },
      });
    }

    const firstImage = images.length > 0 ? images[0].imageUrl : null;
    return await tx.product.update({
      where: { id: productId },
      data: { imageUrl: firstImage },
      include: { images: true, translations: true },
    });
  });

  await logAudit({
    adminId,
    action: 'PRODUCT_IMAGES_UPDATE',
    entityName: 'Product',
    entityId: productId,
    details: { imageCount: images.length },
    ipAddress,
  });

  return updated;
}

module.exports = {
  formatLocalizedProduct,
  listPublicProducts,
  getPublicProductBySlug,
  getPublicProductById,
  listAdminProducts,
  getProductByIdForAdmin,
  createProduct,
  updateProduct,
  toggleProductActive,
  setProductImages,
  uploadProductImage,
  deleteProductImage,
};
