const prisma = require('../config/db');
const logger = require('../utils/logger');

/**
 * Audit Logging Service
 * Records administrative catalog, inventory, and system mutations.
 */
async function logAudit({ adminId = null, action, entityName, entityId, details = null, ipAddress = null }) {
  try {
    const record = await prisma.auditLog.create({
      data: {
        adminId: adminId || null,
        action,
        entityName,
        entityId: String(entityId),
        details: details || {},
        ipAddress: ipAddress || null,
      },
    });
    return record;
  } catch (error) {
    // Audit logging should not crash business transactions, but should log error
    logger.error('Failed to write audit log:', error.message);
    return null;
  }
}

module.exports = {
  logAudit,
};
