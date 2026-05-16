/**
 * Authentication Middleware
 * API key based authentication
 */

const crypto = require('crypto');
const config = require('../config');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');
const { logger } = require('./logger');

/**
 * Timing-safe API key comparison to prevent timing attacks
 */
function isValidApiKey(providedKey, validKeys) {
  for (const key of validKeys) {
    try {
      const a = Buffer.from(providedKey);
      const b = Buffer.from(key);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    } catch (error) {
      logger.error('Error occurred while comparing API keys', { error: error.message });
    }
  }
  return false;
}

/**
 * API Key authentication middleware
 */
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    logger.warn('Missing API key', { ip: req.ip, url: req.url });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: ERROR_MESSAGES.MISSING_API_KEY
    });
  }

  const validKeys = config.get('security.apiKeys', []);
  if (!isValidApiKey(apiKey, validKeys)) {
    logger.warn('Invalid API key', { ip: req.ip, url: req.url, providedKey: apiKey.substring(0, 8) + '...' });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: ERROR_MESSAGES.INVALID_API_KEY
    });
  }

  req.apiKey = apiKey;
  next();
}

/**
 * Skip authentication for health check
 */
function optionalAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return next();
  }

  const validKeys = config.get('security.apiKeys', []);
  if (validKeys.includes(apiKey)) {
    req.apiKey = apiKey;
  }

  next();
}

module.exports = { authenticate, optionalAuth };