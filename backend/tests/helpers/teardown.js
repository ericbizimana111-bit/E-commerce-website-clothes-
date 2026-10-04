/**
 * Jest global teardown: suites delete the orders/users they create, but the
 * staff notification feed has no foreign key to orders (notifications must
 * outlive deleted records in production). Remove the feed entries that
 * point at orders/bookings the tests already cleaned up.
 */
module.exports = async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM admin_notifications
        WHERE (order_id IS NOT NULL AND order_id NOT IN (SELECT id FROM orders))
           OR (type IN ('NEW_MESSAGE') AND (metadata->>'conversationId') IS NOT NULL
               AND (metadata->>'conversationId')::uuid NOT IN (SELECT id FROM conversations))
           OR (type IN ('NEW_SERVICE_REQUEST','SERVICE_REQUEST_CANCELLED')
               AND link_url IS NOT NULL
               AND substring(link_url from '[0-9a-f-]{36}$')::uuid NOT IN (SELECT id FROM service_requests))`
    );
  } finally {
    await prisma.$disconnect();
  }
};
