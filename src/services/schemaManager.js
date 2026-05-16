/**
 * Schema Manager Service
 * Manages schema discovery, caching, and retrieval
 */

const NodeCache = require('node-cache');
const config = require('../config');
const { appInsightsService } = require('./appInsights');
const { logger } = require('../middleware/logger');
const { APP_INSIGHTS_TABLES, APP_INSIGHTS_COLUMN_DESCRIPTIONS } = require('../constants');

class SchemaManager {
  constructor() {
    const cacheConfig = config.get('features.schemaCache', {});
    this.cache = new NodeCache({
      stdTTL: cacheConfig.ttlMinutes * 60 || 3600,
      checkperiod: 300,
      maxKeys: cacheConfig.maxTables || 100
    });
    this.enabled = cacheConfig.enabled !== false;
  }

  /**
   * Get schema for a specific table
   */
  async getSchema(tableName) {
    if (!this.enabled) {
      return await appInsightsService.getTableSchema(tableName);
    }

    const cachedSchema = this.cache.get(tableName);
    if (cachedSchema) {
      logger.debug('Schema cache hit', { table: tableName });
      return cachedSchema;
    }

    logger.debug('Schema cache miss, fetching from App Insights', { table: tableName });
    const schema = await appInsightsService.getTableSchema(tableName);

    if (schema) {
      this.cache.set(tableName, schema);
    }

    return schema;
  }

  /**
   * Get all cached schemas
   */
  getAllSchemas() {
    if (!this.enabled) {
      return {};
    }
    return this.cache.getStats()?.keys || [];
  }

  /**
   * Refresh schema for a specific table
   */
  async refreshSchema(tableName) {
    if (this.enabled) {
      this.cache.del(tableName);
    }
    return await this.getSchema(tableName);
  }

  /**
   * Clear all cached schemas
   */
  clearCache() {
    if (this.enabled) {
      this.cache.flushAll();
      logger.info('Schema cache cleared');
    }
    return { success: true, message: 'Cache cleared' };
  }

  /**
   * Get schema cache statistics
   */
  getStats() {
    if (!this.enabled) {
      return { enabled: false };
    }

    const stats = this.cache.getStats();
    return {
      enabled: true,
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.keys > 0 ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Get context for LLM (schema info with semantic column descriptions)
   */
  async getContextForLLM(tableName) {
    const schema = await this.getSchema(tableName);
    if (!schema) {
      return null;
    }

    const columnDescriptions = APP_INSIGHTS_COLUMN_DESCRIPTIONS[tableName] || {};
    const columnLines = Object.entries(schema).map(([name, info]) => {
      const desc = columnDescriptions[name] ;
      return desc
        ? `- ${name}: ${info.data_type} // ${desc}`
        : `- ${name}: ${info.data_type}`;
    }).join('\n');

    return {
      table: tableName,
      columns: schema,
      formatted: `Table: ${tableName}\nColumns: ${columnLines}`
    };
  }

  /**
   * Pre-warm schema cache for all known App Insights tables
   * Call on startup (non-blocking)
   */
  async warmUp() {
    logger.info('Warming up schema cache for App Insights tables');
    const results = await Promise.allSettled(
      APP_INSIGHTS_TABLES.map(table => this.getSchema(table))
    );
    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value).length;
    logger.info(`Schema cache warm-up completed', {succeeded}/${APP_INSIGHTS_TABLES.length} tables loaded`);
  }

  /**
   * Discover tables and their schemas
   */
  async discoverAllTables() {
    const tables = await appInsightsService.getTables();
    const tableSchemas = {};

    // Limit concurrent fetches
    const batchSize = 5;
    for (let i = 0; i < tables.length; i += batchSize) {
      const batch = tables.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (table) => {
          tableSchemas[table] = await this.getSchema(table);
        })
      );
    }

    return tableSchemas;
  }
}

// Export singleton instance
const schemaManager = new SchemaManager();

module.exports = { schemaManager, SchemaManager };