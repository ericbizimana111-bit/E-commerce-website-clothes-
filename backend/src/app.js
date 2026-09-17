const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const env = require('./config/env');
const prisma = require('./config/db');
const corsMiddleware = require('./middleware/cors');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const { errorHandler, AppError } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const adminAuthRoutes = require('./routes/adminAuth.routes');
const categoryRoutes = require('./routes/category.routes');
const productRoutes = require('./routes/product.routes');
const adminCatalogRoutes = require('./routes/adminCatalog.routes');
const cartRoutes = require('./routes/cart.routes');
const checkoutRoutes = require('./routes/checkout.routes');
const orderRoutes = require('./routes/order.routes');
const adminOrderRoutes = require('./routes/adminOrder.routes');

const app = express();

// 1. Security Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// 2. CORS
app.use(corsMiddleware);

// 3. Rate Limiting
app.use('/api', apiLimiter);

// 4. Request Logging (skip in test environment)
if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// 5. Body Parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// 6. Static Upload Directory
const uploadsDir = path.resolve(__dirname, '../uploads/images');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/images', express.static(uploadsDir));

// 7. Health Check Endpoint
app.get('/api/health', async (req, res, next) => {
  try {
    // Ping database
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      status: 'UP',
      service: 'Uganda Food Marketplace API',
      version: '1.0.0',
      database: 'connected',
      currency: 'UGX',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(new AppError('Database connection check failed', 503));
  }
});

// 8. Authentication Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin/auth', authLimiter, adminAuthRoutes);

// 9. Public & Admin Catalog Routes
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin/catalog', adminCatalogRoutes);

// 10. Customer Cart & Checkout Preparation Routes (customer JWT required)
app.use('/api/cart', cartRoutes);
app.use('/api/checkout', checkoutRoutes);

// 10b. Customer Orders (customer JWT) & Admin Order Management (admin JWT + RBAC)
app.use('/api/orders', orderRoutes);
app.use('/api/admin/orders', adminOrderRoutes);

// 11. 404 Handler for undefined routes
app.use((req, res, next) => {
  next(new AppError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404));
});

// 12. Centralized Error Handler
app.use(errorHandler);

module.exports = app;
