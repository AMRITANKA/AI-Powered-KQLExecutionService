/**
 * Error Handler Middleware
 * Centralized error handling for the application
 */

const { HTTP_STATUS } = require('../constants');
const { logger } = require('./logger');

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Not found handler for unmatched routes
 */
function notFoundHandler(req, res) {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`
  });
}

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  // Log the error
  logger.error('Error handler caught', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });

  // Handle known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: err.message,
      details: err.details
    });
  }

  // Handle Axios errors (App Insights, LLM)
  if (err.response) {
    return res.status(err.response.status || HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: err.response.data?.error?.message || 'External service error',
      service: err.response.config?.url?.includes('applicationinsights') ? 'Application Insights' : 'LLM'
    });
  }

  // Handle timeout errors
  if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      error: 'Request timeout'
    });
  }

  // Default to 500 Internal Server Error
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    error: 'Internal server error'
  });
}

module.exports = { AppError, notFoundHandler, errorHandler };