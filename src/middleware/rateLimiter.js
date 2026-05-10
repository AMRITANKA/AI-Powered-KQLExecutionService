/**
 * Rate Limiting Middleware
 * Request rate limiting using express-rate-limit
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');
const { HTTP_STATUS } = require('../constants');

/**
 * Create rate limiter
 */
const createRateLimiter = () => {
  const rateLimitConfig = config.get('security.rateLimit', {});

  return rateLimit({
    windowMs: rateLimitConfig.windowMs || 60000,
    max: rateLimitConfig.maxRequests || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: 'Too many requests, please try again later',
      retryAfter: Math.ceil((rateLimitConfig.windowMs || 60000) / 1000)
    },
    keyGenerator: (req) => {
      return req.apiKey || req.ip;
    }
  });
};

/**
 * Query-specific rate limiter (stricter for expensive operations)
 */
const queryRateLimiter = rateLimit({
  windowMs: 60000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many query requests, please try again later',
    retryAfter: 60
  },
  keyGenerator: (req) => {
    return req.apiKey || req.ip;
  }
});

module.exports = { createRateLimiter, queryRateLimiter };