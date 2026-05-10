/**
 * Health Check Routes
 * Service health and status endpoints
 */

const express = require('express');
const { llmService } = require('../services/llm');
const { appInsightsService } = require('../services/appInsights');
const { schemaManager } = require('../services/schemaManager');
const config = require('../config');
const { logger } = require('../middleware/logger');

const router = express.Router();

/**
 * GET /health
 * Basic health check
 */
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: config.get('app.name', 'NL2KQL'),
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health/ready
 * Readiness check - verifies external dependencies
 */
router.get('/ready', async (req, res) => {
  const checks = {
    appInsights: false,
    llm: false,
    schemaCache: false
  };

  try {
    // Check App Insights
    checks.appInsights = await appInsightsService.healthCheck();
  } catch (error) {
    logger.error('App Insights health check failed', { error: error.message });
  }

  try {
    // Check LLM
    checks.llm = await llmService.healthCheck();
  } catch (error) {
    logger.error('LLM health check failed', { error: error.message });
  }

  // Schema cache is always "healthy" if enabled
  checks.schemaCache = config.get('features.schemaCache.enabled', true);

  const allHealthy = Object.values(checks).every(v => v === true);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not ready',
    checks: checks,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health/live
 * Liveness check - service is running
 */
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health/config
 * Show safe configuration (without secrets)
 */
router.get('/config', (req, res) => {
  const fullConfig = config.getAll();

  // Remove sensitive data
  const safeConfig = {
    app: fullConfig.app,
    llm: {
      provider: fullConfig.llm.provider,
      model: fullConfig.llm.model
    },
    features: fullConfig.features,
    security: {
      rateLimit: fullConfig.security.rateLimit,
      hasApiKeys: fullConfig.security.apiKeys?.length > 0
    }
  };

  res.json({
    config: safeConfig
  });
});

module.exports = router;