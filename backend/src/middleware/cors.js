const cors = require('cors');
const env = require('../config/env');

const normalizeOrigin = (origin) => origin.trim().replace(/\/+$/, '');

const allowedOrigins = env.CORS_ORIGIN.split(',').map(normalizeOrigin);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (such as mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    // CRA's dev proxy sends Origin with a trailing slash (e.g. http://localhost:4000/)
    if (allowedOrigins.includes(normalizeOrigin(origin)) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS origin ${origin} not permitted`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'auth-token', 'X-Requested-With'],
};

module.exports = cors(corsOptions);
