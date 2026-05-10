/**
 * Express Server Setup
 * Configures Express with all middleware and routes
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const { requestLogger, errorLogger, logger } = require('./middleware/logger');
const { authenticate, optionalAuth } = require('./middleware/auth');
const { createRateLimiter, queryRateLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { optionalAuth: optionalAuthMiddleware } = require('./middleware/auth');

// Import routes
const queryRoutes = require('./routes/query');
const schemaRoutes = require('./routes/schema');
const healthRoutes = require('./routes/health');

/**
 * Create and configure Express application
 */
function createApp() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
  }));

  // Parse JSON bodies
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(requestLogger);

  // Rate limiting (global)
  app.use(createRateLimiter());

  // Health check (no auth required)
  app.use('/health', optionalAuthMiddleware, healthRoutes);

  // API routes (authentication required)
  app.use('/api/v1/query', authenticate, queryRateLimiter, queryRoutes);
  app.use('/api/v1/schema', authenticate, schemaRoutes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorLogger);
  app.use(errorHandler);

  return app;
}

/**
 * Start the server
 */
function startServer(app) {
  const host = config.get('app.host', '0.0.0.0');
  const port = config.get('app.port', 3000);

  app.listen(port, host, () => {
    logger.info(`Server started on ${host}:${port}`, {
      host,
      port,
      env: process.env.NODE_ENV || 'development'
    });
  });
}

module.exports = { createApp, startServer };