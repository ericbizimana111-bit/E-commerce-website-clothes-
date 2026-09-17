const categoryService = require('../services/category.service');

// Public endpoints
async function listPublicCategories(req, res, next) {
  try {
    const categories = await categoryService.listPublicCategories(req.query.lang);
    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
}

async function getPublicCategoryBySlug(req, res, next) {
  try {
    const category = await categoryService.getPublicCategoryBySlug(req.params.slug, req.query.lang);
    res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    next(error);
  }
}

async function getPublicCategoryById(req, res, next) {
  try {
    const category = await categoryService.getPublicCategoryById(req.params.id, req.query.lang);
    res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    next(error);
  }
}

// Admin endpoints
async function listAdminCategories(req, res, next) {
  try {
    const result = await categoryService.listAdminCategories(req.query);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

async function createCategory(req, res, next) {
  try {
    const category = await categoryService.createCategory(req.body, req.admin?.id, req.ip);
    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category,
    });
  } catch (error) {
    next(error);
  }
}

async function updateCategory(req, res, next) {
  try {
    const category = await categoryService.updateCategory(req.params.id, req.body, req.admin?.id, req.ip);
    res.json({
      success: true,
      message: 'Category updated successfully',
      data: category,
    });
  } catch (error) {
    next(error);
  }
}

async function toggleCategoryActive(req, res, next) {
  try {
    const category = await categoryService.toggleCategoryActive(
      req.params.id,
      req.body.isActive,
      req.admin?.id,
      req.ip
    );
    res.json({
      success: true,
      message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
      data: category,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listPublicCategories,
  getPublicCategoryBySlug,
  getPublicCategoryById,
  listAdminCategories,
  createCategory,
  updateCategory,
  toggleCategoryActive,
};
