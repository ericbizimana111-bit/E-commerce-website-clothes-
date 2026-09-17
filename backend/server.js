const app = require('./src/app');
const env = require('./src/config/env');
const prisma = require('./src/config/db');
const logger = require('./src/utils/logger');

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Uganda Food Marketplace API running on port ${env.PORT} [${env.NODE_ENV}]`);
  logger.info(`📍 Connected to PostgreSQL via Prisma`);
});

// Graceful Shutdown Handling
const shutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    await prisma.$disconnect();
    logger.info('Database connection closed.');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
