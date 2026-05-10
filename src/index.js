/**
 * NL2KQL - Natural Language to KQL Query Execution Service
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
startServer(app);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = { app };