const inventoryService = require('../services/inventory.service');

async function restock(req, res, next) {
  try {
    const result = await inventoryService.restock({
      productId: parseInt(req.params.id, 10),
      quantity: req.body.quantity,
      reason: req.body.reason,
      referenceId: req.body.referenceId,
      adminId: req.admin?.id,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Inventory restocked successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function adjustStock(req, res, next) {
  try {
    const result = await inventoryService.adjustStock({
      productId: parseInt(req.params.id, 10),
      quantityChange: req.body.quantityChange,
      reason: req.body.reason,
      referenceId: req.body.referenceId,
      adminId: req.admin?.id,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: 'Inventory adjusted successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getHistory(req, res, next) {
  try {
    const result = await inventoryService.getInventoryHistory(parseInt(req.params.id, 10), req.query);
    res.json({
      success: true,
      data: result.items,
      product: result.product,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

async function checkStock(req, res, next) {
  try {
    const quantity = parseInt(req.query.quantity, 10) || 1;
    const result = await inventoryService.checkAvailableStock(parseInt(req.params.id, 10), quantity);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  restock,
  adjustStock,
  getHistory,
  checkStock,
};
