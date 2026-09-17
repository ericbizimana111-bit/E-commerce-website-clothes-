const productService = require('../services/product.service');

// Public endpoints
async function listPublicProducts(req, res, next) {
  try {
    const result = await productService.listPublicProducts(req.query);
    res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

async function getPublicProductBySlug(req, res, next) {
  try {
    const product = await productService.getPublicProductBySlug(req.params.slug, req.query.lang);
    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

async function getPublicProductById(req, res, next) {
  try {
    const product = await productService.getPublicProductById(req.params.id, req.query.lang);
    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

// Admin endpoints
async function listAdminProducts(req, res, next) {
  try {
    const result = await productService.listAdminProducts(req.query);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    const product = await productService.createProduct(req.body, req.admin?.id, req.ip);
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

async function updateProduct(req, res, next) {
  try {
    const product = await productService.updateProduct(req.params.id, req.body, req.admin?.id, req.ip);
    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

async function toggleProductActive(req, res, next) {
  try {
    const product = await productService.toggleProductActive(
      req.params.id,
      req.body.isActive,
      req.admin?.id,
      req.ip
    );
    res.json({
      success: true,
      message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

async function setProductImages(req, res, next) {
  try {
    const product = await productService.setProductImages(
      req.params.id,
      req.body.images,
      req.admin?.id,
      req.ip
    );
    res.json({
      success: true,
      message: 'Product images updated successfully',
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listPublicProducts,
  getPublicProductBySlug,
  getPublicProductById,
  listAdminProducts,
  createProduct,
  updateProduct,
  toggleProductActive,
  setProductImages,
};
