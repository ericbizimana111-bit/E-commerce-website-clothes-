const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { normalizeLanguage, resolveTranslation } = require('../utils/translation');
const { formatLocalizedCategory } = require('./category.service');
const { logAudit } = require('./audit.service');
const imageService = require('./image.service');
const translator = require('./translator.service');
const { uniqueSlug, mergeEnglish } = require('../utils/slug');

/** Normalize stored specifications to [{label, value}] (drops junk). */
function normalizeSpecs(specs) {
  if (!Array.isArray(specs)) return [];
  return specs
    .filter((s) => s && typeof s.label === 'string' && typeof s.value === 'string' && s.label.trim() && s.value.trim())
    .map((s) => ({ label: s.label.trim().slice(0, 60), value: s.value.trim().slice(0, 200) }))
    .slice(0, 30);
}

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

  const compareAt =
    product.compareAtPriceUgx && product.compareAtPriceUgx > product.priceUgx ? product.compareAtPriceUgx : null;

  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku || null,
    name: localized.name,
    description: localized.description || null,
    price: product.priceUgx,
    compareAtPrice: compareAt,
    discountPercent: compareAt ? Math.round(((compareAt - product.priceUgx) / compareAt) * 100) : 0,
    brand: product.brand || null,
    specifications: normalizeSpecs(product.specifications),
    isFeatured: Boolean(product.isFeatured),
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
  brand = null,
  featured = null,
  sort = 'newest',
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

  if (brand && typeof brand === 'string' && brand.trim()) {
    where.brand = { equals: brand.trim(), mode: 'insensitive' };
  }
  if (featured === true || featured === 'true') {
    where.isFeatured = true;
  }

  // Parameterized search across translations, sku, slug, brand
  if (search && typeof search === 'string' && search.trim().length > 0) {
    const q = search.trim();
    where.OR = [
      { slug: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
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

  const ORDER_BY = {
    newest: [{ id: 'desc' }],
    price_asc: [{ priceUgx: 'asc' }, { id: 'desc' }],
    price_desc: [{ priceUgx: 'desc' }, { id: 'desc' }],
    name: [{ nameEn: 'asc' }, { id: 'desc' }],
  };

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: ORDER_BY[sort] || ORDER_BY.newest,
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

  translator.backfillMissing('product', products, normLang);

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

  translator.backfillMissing('product', [product], normLang);
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

  translator.backfillMissing('product', [product], normLang);
  return formatLocalizedProduct(product, normLang);
}

/**
 * Public: filter facets for the catalogue sidebar (brands + price range),
 * scoped to a category when given.
 */
async function getPublicFacets({ categorySlug = null } = {}) {
  const where = { isActive: true, category: { isActive: true } };
  if (categorySlug) where.category = { isActive: true, slug: String(categorySlug).trim().toLowerCase() };

  const [brands, price] = await Promise.all([
    prisma.product.groupBy({
      by: ['brand'],
      where: { ...where, brand: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { brand: 'desc' } },
      take: 30,
    }),
    prisma.product.aggregate({ where, _min: { priceUgx: true }, _max: { priceUgx: true } }),
  ]);

  return {
    brands: brands.filter((b) => b.brand && b.brand.trim()).map((b) => ({ name: b.brand, count: b._count._all })),
    priceRange: { min: price._min.priceUgx ?? 0, max: price._max.priceUgx ?? 0 },
  };
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
    sku = null,
    priceUgx,
    stockQuantity = 0,
    unit = 'piece',
    isActive = true,
    images = [],
    brand = null,
    specifications = null,
    compareAtPriceUgx = null,
    isFeatured = false,
  } = data;
  const translations = mergeEnglish(data.translations, data.name, data.description);
  const englishName = (translations.find((t) => t.language === 'EN') || translations[0] || {}).name;
  const slug = data.slug || (await uniqueSlug(englishName, async (s) => Boolean(await prisma.product.findUnique({ where: { slug: s } }))));

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
        descriptionEn: enTrans && enTrans.description ? enTrans.description : null,
        imageUrl: images && images.length > 0 ? images[0].imageUrl : null,
        brand: brand ? String(brand).trim() : null,
        specifications: normalizeSpecs(specifications).length ? normalizeSpecs(specifications) : undefined,
        compareAtPriceUgx: compareAtPriceUgx ? parseInt(compareAtPriceUgx, 10) : null,
        isFeatured: Boolean(isFeatured),
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

  // Machine-translate the English content into the other languages.
  translator.scheduleProduct(product.id, { force: false });

  return product;
}

/**
 * Admin: Update product details and upsert translations
 */
async function updateProduct(id, input, adminId = null, ipAddress = null) {
  const productId = parseInt(id, 10);
  const data = { ...input, translations: mergeEnglish(input.translations, input.name, input.description) };
  const existing = await prisma.product.findUnique({ where: { id: productId }, include: { translations: true } });
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
    if (data.brand !== undefined) updatePayload.brand = data.brand ? String(data.brand).trim() : null;
    if (data.specifications !== undefined) {
      const specs = normalizeSpecs(data.specifications);
      updatePayload.specifications = specs.length ? specs : require('@prisma/client').Prisma.DbNull;
    }
    if (data.compareAtPriceUgx !== undefined) {
      updatePayload.compareAtPriceUgx = data.compareAtPriceUgx ? parseInt(data.compareAtPriceUgx, 10) : null;
    }
    if (data.isFeatured !== undefined) updatePayload.isFeatured = Boolean(data.isFeatured);

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
            isAuto: false,
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
    details: input,
    ipAddress,
  });

  // English is the source of truth: when it changed, regenerate every other
  // language; otherwise just fill any language still missing.
  const prevEn = existing.translations.find((t) => t.language === 'EN');
  const nextEn = updated.translations.find((t) => t.language === 'EN');
  const englishChanged =
    Boolean(nextEn) && (!prevEn || prevEn.name !== nextEn.name || (prevEn.description || '') !== (nextEn.description || ''));
  const manualOther = (data.translations || []).some((t) => t.language !== 'EN');
  translator.scheduleProduct(productId, { force: englishChanged && !manualOther });

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

/**
 * Admin: regenerate machine translations now (e.g. after fixing wording).
 * Runs synchronously so the admin sees the result.
 */
async function retranslateProduct(id) {
  const productId = parseInt(id, 10);
  const exists = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!exists) throw new AppError(`Product with ID ${id} not found`, 404);
  if (!translator.isEnabled()) {
    throw new AppError('Automatic translation is disabled (TRANSLATION_PROVIDER=NONE)', 409);
  }
  await translator.syncProductTranslations(productId, { force: true });
  return getProductByIdForAdmin(productId);
}

module.exports = {
  getPublicFacets,
  retranslateProduct,
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
