/**
 * Schema Manager Service
 * Manages schema discovery, caching, and retrieval
 */

const NodeCache = require('node-cache');
const config = require('../config');
const { appInsightsService } = require('./appInsights');
const { logger } = require('../middleware/logger');

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
   * Get context for LLM (schema info formatted for prompt)
   */
  async getContextForLLM(tableName) {
    const schema = await this.getSchema(tableName);
    if (!schema) {
      return null;
    }

    const columns = Object.entries(schema).map(([name, info]) => {
      return `${name}: ${info.data_type}`;
    }).join(', ');

    return {
      table: tableName,
      columns: schema,
      formatted: `Table: ${tableName}\nColumns: ${columns}`
    };
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