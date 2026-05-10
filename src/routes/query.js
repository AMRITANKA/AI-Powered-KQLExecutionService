/**
 * Query Routes
 * Main API endpoints for executing queries
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { llmService } = require('../services/llm');
const { appInsightsService } = require('../services/appInsights');
const { schemaManager } = require('../services/schemaManager');
const { validator } = require('../services/validator');
const { formatOutput } = require('../utils/formatters');
const { logger } = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS, ERROR_MESSAGES, QUERY_TYPES, OUTPUT_FORMATS, DEFAULTS } = require('../constants');

const router = express.Router();

/**
 * POST /api/v1/query
 * Execute natural language or KQL query
 */
router.post(
  '/',
  [
    body('query').notEmpty().withMessage('Query is required'),
    body('type').optional().isIn([QUERY_TYPES.NATURAL, QUERY_TYPES.KQL]).withMessage('Query type must be "natural" or "kql"'),
    body('output').optional().isIn([OUTPUT_FORMATS.JSON, OUTPUT_FORMATS.CSV, OUTPUT_FORMATS.TABLE]).withMessage('Output format must be "json", "csv", or "table"'),
    body('options').optional().isObject()
  ],
  async (req, res, next) => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, HTTP_STATUS.BAD_REQUEST);
      }

      const { query, type = QUERY_TYPES.NATURAL, output = OUTPUT_FORMATS.JSON, options = {} } = req.body;
      const { limit = DEFAULTS.DEFAULT_LIMIT, timeout = DEFAULTS.QUERY_TIMEOUT } = options;

      const startTime = Date.now();

      // Step 1: Convert natural language to KQL or use provided KQL
      let kql = query;
      if (type === QUERY_TYPES.NATURAL) {
        logger.info('Converting natural language to KQL', { query });

        // Extract potential table name from query (simple heuristic)
        const tableName = await _extractTableFromQuery(query, schemaManager);

        // Get schema context if available
        let schemaContext = null;
        if (tableName) {
          schemaContext = await schemaManager.getContextForLLM(tableName);
        }

        // Generate KQL using LLM
        kql = await llmService.generateKQL(query, schemaContext);

        // Validate generated KQL
        const validation = await validator.validate(kql);
        if (!validation.valid) {
          logger.warn('Generated KQL has validation issues', { validation: validation.errors });
        }
      }

      // Step 2: Execute KQL query
      logger.info('Executing KQL query', { kql: kql.substring(0, 200) });
      const result = await appInsightsService.executeQuery(kql, { limit, timeout });

      const executionTime = Date.now() - startTime;

      // Step 3: Format response
      const response = {
        success: true,
        query: kql,
        type: type,
        executionTime: executionTime,
        rowCount: result.rowCount,
        data: result.data,
        metadata: {
          generatedAt: new Date().toISOString(),
          outputFormat: output,
          limit: limit
        }
      };

      // Check if response should be formatted differently
      if (output === OUTPUT_FORMATS.CSV) {
        res.setHeader('Content-Type', 'text/csv');
        return res.send(formatOutput(result.data, 'csv'));
      }

      if (output === OUTPUT_FORMATS.TABLE) {
        res.setHeader('Content-Type', 'text/plain');
        return res.send(formatOutput(result.data, 'table'));
      }

      // Default JSON response
      res.json(response);

    } catch (error) {
      next(error);
    }
  }
);

/**
 * Extract potential table name from query
 */
async function _extractTableFromQuery(query, schemaManager) {
  const tables = ['SigninLogs', 'AuditLogs', 'SecurityEvent', 'Syslog', 'AppTraces', 'requests', 'exceptions', 'dependencies'];
  const lowerQuery = query.toLowerCase();

  for (const table of tables) {
    if (lowerQuery.includes(table.toLowerCase())) {
      return table;
    }
  }

  // If no match, try first available table
  try {
    const availableTables = await appInsightsService.getTables();
    if (availableTables && availableTables.length > 0) {
      // Prefer common log tables
      const preferred = availableTables.filter(t =>
        t.toLowerCase().includes('log') ||
        t.toLowerCase().includes('event') ||
        t.toLowerCase().includes('trace')
      );
      return preferred[0] || availableTables[0];
    }
  } catch (error) {
    logger.warn('Could not extract table name', { error: error.message });
  }

  return null;
}

/**
 * POST /api/v1/validate
 * Validate KQL query without execution
 */
router.post(
  '/validate',
  [
    body('query').notEmpty().withMessage('Query is required'),
    body('table').optional().isString()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, HTTP_STATUS.BAD_REQUEST);
      }

      const { query } = req.body;

      // Validate the KQL
      const validation = await validator.validate(query);

      res.json({
        success: true,
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings
      });

    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;