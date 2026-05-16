/**
 * AI-Powered KQL Query Execution Service
 * Main entry point
 */

require('dotenv').config();

// Load configuration
const config = require('./config');
const { logger } = require('./middleware/logger');
const { createApp, startServer } = require('./server');

// Initialize configuration
try {
  config.load();
  logger.info('Configuration loaded successfully');
} catch (error) {
  console.error('Failed to load configuration:', error.message);
  process.exit(1);
}

// Create and start server
const app = createApp();
const server = startServer(app);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

// Graceful shutdown with connection draining
function gracefulShutdown(signal){
  logger.info(`Received ${signal}, draining connections...`);
  server.close(() => {
    logger.info('Forced shutdown after timeout');
    process.exit(0);
  });
  // Force-exit after 30 seconds if connection do not drain
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 30000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Non-blocking schema cache warm-up
const { schemaManager } = require('./services/schemaManager');
schemaManager.warmUp().catch((error) => {
  logger.warn ('Schema cache warm-up failed', { error: error.message });
});

module.exports = { app };