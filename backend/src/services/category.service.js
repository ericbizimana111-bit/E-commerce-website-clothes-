const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { normalizeLanguage, resolveTranslation } = require('../utils/translation');
const { logAudit } = require('./audit.service');

/**
 * Format category entity for public responses with localized translation
 */
function formatLocalizedCategory(category, requestedLang) {
  const localized = resolveTranslation(
    category.translations,
    requestedLang,
    category.nameEn || '',
    ''
  );

  return {
    id: category.id,
    slug: category.slug,
    name: localized.name,
    description: localized.description || null,
    imageUrl: category.imageUrl,
    displayOrder: category.displayOrder,
    language: localized.language,
    productCount: category._count?.products ?? 0,
  };
}

/**
 * Public: List all active categories
 */
async function listPublicCategories(lang = 'EN') {
  const normLang = normalizeLanguage(lang);

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    include: {
      translations: true,
      _count: {
        select: {
          products: {
            where: { isActive: true },
          },
        },
      },
    },
  });

  return categories.map((cat) => formatLocalizedCategory(cat, normLang));
}

/**
 * Public: Get single active category by slug
 */
async function getPublicCategoryBySlug(slug, lang = 'EN') {
  const normLang = normalizeLanguage(lang);

  const category = await prisma.category.findFirst({
    where: { slug, isActive: true },
    include: {
      translations: true,
      _count: {
        select: {
          products: {
            where: { isActive: true },
          },
        },
      },
    },
  });

  if (!category) {
    throw new AppError(`Category '${slug}' not found`, 404);
  }

  return formatLocalizedCategory(category, normLang);
}

/**
 * Public: Get single active category by ID
 */
async function getPublicCategoryById(id, lang = 'EN') {
  const normLang = normalizeLanguage(lang);

  const category = await prisma.category.findFirst({
    where: { id: parseInt(id, 10), isActive: true },
    include: {
      translations: true,
      _count: {
        select: {
          products: {
            where: { isActive: true },
          },
        },
      },
    },
  });

  if (!category) {
    throw new AppError(`Category with ID ${id} not found`, 404);
  }

  return formatLocalizedCategory(category, normLang);
}

/**
 * Admin: List categories with pagination, search, and status filter
 */
async function listAdminCategories({ page = 1, limit = 50, search = null, isActive = null } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const where = {};
  if (isActive !== null && isActive !== undefined) {
    where.isActive = isActive === true || isActive === 'true';
  }

  if (search && typeof search === 'string' && search.trim().length > 0) {
    const q = search.trim();
    where.OR = [
      { slug: { contains: q, mode: 'insensitive' } },
      {
        translations: {
          some: {
            name: { contains: q, mode: 'insensitive' },
          },
        },
      },
    ];
  }

  const [total, categories] = await Promise.all([
    prisma.category.count({ where }),
    prisma.category.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      skip,
      take: limitNum,
      include: {
        translations: true,
        _count: {
          select: { products: true },
        },
      },
    }),
  ]);

  return {
    items: categories,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  };
}

/**
 * Admin: Create a new category with translations
 */
async function createCategory(data, adminId = null, ipAddress = null) {
  const { slug, displayOrder = 0, imageUrl = null, isActive = true, translations = [] } = data;

  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) {
    throw new AppError(`A category with slug '${slug}' already exists`, 409);
  }

  const category = await prisma.$transaction(async (tx) => {
    // English name for fallback column
    const enTrans = translations.find((t) => normalizeLanguage(t.language) === 'EN');

    const created = await tx.category.create({
      data: {
        slug: slug.trim().toLowerCase(),
        displayOrder: displayOrder || 0,
        imageUrl: imageUrl || null,
        isActive: isActive !== false,
        nameEn: enTrans ? enTrans.name : null,
      },
    });

    if (Array.isArray(translations) && translations.length > 0) {
      for (const t of translations) {
        await tx.categoryTranslation.create({
          data: {
            categoryId: created.id,
            language: normalizeLanguage(t.language),
            name: t.name.trim(),
            description: t.description ? t.description.trim() : null,
          },
        });
      }
    }

    return await tx.category.findUnique({
      where: { id: created.id },
      include: { translations: true },
    });
  });

  await logAudit({
    adminId,
    action: 'CATEGORY_CREATE',
    entityName: 'Category',
    entityId: category.id,
    details: { slug: category.slug },
    ipAddress,
  });

  return category;
}

/**
 * Admin: Update category and upsert translations
 */
async function updateCategory(id, data, adminId = null, ipAddress = null) {
  const categoryId = parseInt(id, 10);
  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing) {
    throw new AppError(`Category with ID ${id} not found`, 404);
  }

  if (data.slug && data.slug !== existing.slug) {
    const slugExists = await prisma.category.findUnique({ where: { slug: data.slug } });
    if (slugExists) {
      throw new AppError(`A category with slug '${data.slug}' already exists`, 409);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatePayload = {};
    if (data.slug) updatePayload.slug = data.slug.trim().toLowerCase();
    if (data.displayOrder !== undefined) updatePayload.displayOrder = data.displayOrder;
    if (data.imageUrl !== undefined) updatePayload.imageUrl = data.imageUrl;
    if (data.isActive !== undefined) updatePayload.isActive = data.isActive;

    if (Array.isArray(data.translations) && data.translations.length > 0) {
      let enName = null;
      for (const t of data.translations) {
        const lang = normalizeLanguage(t.language);
        if (lang === 'EN') enName = t.name.trim();
        await tx.categoryTranslation.upsert({
          where: {
            categoryId_language: {
              categoryId,
              language: lang,
            },
          },
          update: {
            name: t.name.trim(),
            description: t.description ? t.description.trim() : null,
          },
          create: {
            categoryId,
            language: lang,
            name: t.name.trim(),
            description: t.description ? t.description.trim() : null,
          },
        });
      }
      // Keep legacy fallback column in sync with the English translation
      if (enName) updatePayload.nameEn = enName;
    }

    return await tx.category.update({
      where: { id: categoryId },
      data: updatePayload,
      include: { translations: true },
    });
  });

  await logAudit({
    adminId,
    action: 'CATEGORY_UPDATE',
    entityName: 'Category',
    entityId: categoryId,
    details: data,
    ipAddress,
  });

  return updated;
}

/**
 * Admin: Activate or deactivate a category (soft-disable)
 */
async function toggleCategoryActive(id, isActive, adminId = null, ipAddress = null) {
  const categoryId = parseInt(id, 10);
  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing) {
    throw new AppError(`Category with ID ${id} not found`, 404);
  }

  const updated = await prisma.category.update({
    where: { id: categoryId },
    data: { isActive },
    include: { translations: true },
  });

  await logAudit({
    adminId,
    action: isActive ? 'CATEGORY_ACTIVATE' : 'CATEGORY_DEACTIVATE',
    entityName: 'Category',
    entityId: categoryId,
    details: { isActive },
    ipAddress,
  });

  return updated;
}

module.exports = {
  formatLocalizedCategory,
  listPublicCategories,
  getPublicCategoryBySlug,
  getPublicCategoryById,
  listAdminCategories,
  createCategory,
  updateCategory,
  toggleCategoryActive,
};
