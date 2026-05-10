/**
 * Schema Routes
 * API endpoints for schema management
 */

const express = require('express');
const { schemaManager } = require('../services/schemaManager');
const { logger } = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');

const router = express.Router();

/**
 * GET /api/v1/schema
 * List all cached schemas
 */
router.get('/', async (req, res, next) => {
  try {
    const tables = schemaManager.getAllSchemas();
    const stats = schemaManager.getStats();

    res.json({
      success: true,
      tables: tables,
      count: tables.length,
      stats: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/schema/:table
 * Get schema for a specific table
 */
router.get('/:table', async (req, res, next) => {
  try {
    const { table } = req.params;

    if (!table) {
      throw new AppError('Table name is required', HTTP_STATUS.BAD_REQUEST);
    }

    const schema = await schemaManager.getSchema(table);

    if (!schema) {
      throw new AppError(`Schema not found for table: ${table}`, HTTP_STATUS.NOT_FOUND);
    }

    res.json({
      success: true,
      table: table,
      schema: schema,
      columnCount: Object.keys(schema).length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/schema/refresh
 * Refresh schema cache
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { table } = req.body;

    if (table) {
      // Refresh specific table
      await schemaManager.refreshSchema(table);
      res.json({
        success: true,
        message: `Schema refreshed for table: ${table}`
      });
    } else {
      // Refresh all (clear and re-discover)
      schemaManager.clearCache();
      const schemas = await schemaManager.discoverAllTables();
      res.json({
        success: true,
        message: 'All schemas refreshed',
        tables: Object.keys(schemas).length
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/schema
 * Clear schema cache
 */
router.delete('/', async (req, res, next) => {
  try {
    const result = schemaManager.clearCache();

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/schema/stats
 * Get schema cache statistics
 */
router.get('/stats', (req, res) => {
  const stats = schemaManager.getStats();

  res.json({
    success: true,
    stats: stats
  });
});

module.exports = router;