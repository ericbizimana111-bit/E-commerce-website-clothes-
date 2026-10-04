const express = require('express');
const router = express.Router();
const prisma = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { verifyAdminToken, verifyCustomerToken } = require('../services/token.service');
const realtime = require('../services/realtime.service');

/**
 * POST /api/realtime/ticket   (Authorization: Bearer <customer or admin JWT>)
 *   -> { ticket, expiresIn }  short-lived ticket for the SSE stream
 * GET  /api/realtime/stream?ticket=...
 *   -> text/event-stream: "notification", "chat:message", "chat:read",
 *      "order:update", "service:update" events
 */

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

router.post('/ticket', async (req, res, next) => {
  try {
    const token = bearer(req);
    if (!token) throw new AppError('Authentication token required', 401);

    // Try admin first, then customer: secrets are distinct so only one can verify.
    let identity = null;
    try {
      const decoded = verifyAdminToken(token);
      const admin = await prisma.admin.findUnique({ where: { id: decoded.sub }, select: { id: true, isActive: true } });
      if (admin && admin.isActive) identity = { kind: 'ADMIN', id: admin.id };
    } catch {
      /* not an admin token */
    }
    if (!identity) {
      const decoded = verifyCustomerToken(token); // throws 401 when invalid
      const user = await prisma.user.findUnique({ where: { id: decoded.sub }, select: { id: true, isActive: true } });
      if (!user || !user.isActive) throw new AppError('User not found or account is inactive', 401);
      identity = { kind: 'CUSTOMER', id: user.id };
    }

    res.json({
      success: true,
      data: { ticket: realtime.issueTicket(identity), expiresIn: realtime.TICKET_TTL_SECONDS },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stream', (req, res, next) => {
  try {
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
    let claims;
    try {
      claims = realtime.verifyTicket(ticket);
    } catch {
      throw new AppError('Invalid or expired stream ticket', 401);
    }
    const channels = claims.kind === 'ADMIN' ? ['admins', `admin:${claims.sub}`] : [`user:${claims.sub}`];
    realtime.subscribe(req, res, channels);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
