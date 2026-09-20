const productService = require('../services/product.service');

/**
 * POST /api/admin/catalog/products/:id/images
 * Multipart upload (field "image"). Validation, storage, DB reference and
 * audit all live in product.service (single place for image invariants).
 */
async function uploadProductImage(req, res, next) {
  try {
    const image = await productService.uploadProductImage(
      req.params.id,
      req.file,
      {
        altText: req.body?.altText,
        isPrimary: req.body?.isPrimary,
      },
      req.admin?.id,
      req.ip
    );

    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: image,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/catalog/products/:id/images/:imageId
 * Removes the ProductImage row; the backing file is deleted only when it is
 * provably unreferenced by any other product/category row.
 */
async function deleteProductImage(req, res, next) {
  try {
    const removed = await productService.deleteProductImage(
      req.params.id,
      req.params.imageId,
      req.admin?.id,
      req.ip
    );

    res.json({
      success: true,
      message: 'Image removed successfully',
      data: removed,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  uploadProductImage,
  deleteProductImage,
};
