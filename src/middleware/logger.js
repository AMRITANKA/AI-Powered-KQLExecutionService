/**
 * Logger Middleware
 * Winston-based logging for requests and responses
 */

const winston = require('winston');
const config = require('../config');
const { request } = require('express');

const logger = winston.createLogger({
  level: config.get('logging.level', 'info'),
  format: config.get('logging.format') === 'json'
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, ...metadata }) => {
          let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
          if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
          }
          return msg;
        })
      ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      requestId: req.requestId
    });
  });

  next();
}

/**
 * Error logging middleware
 */
function errorLogger(err, req, res, next) {
  logger.error('Request Error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    requestId: req.requestId,
  });
  next(err);
}

module.exports = { logger, requestLogger, errorLogger };