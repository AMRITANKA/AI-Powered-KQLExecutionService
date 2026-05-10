/**
 * Azure Application Insights Service
 * Handles KQL query execution against Azure App Insights
 */

const axios = require('axios');
const config = require('../config');
const { logger } = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS } = require('../constants');

class AppInsightsService {
  constructor() {
    this._initializeClient();
  }

  /**
   * Initialize the App Insights client
   */
  _initializeClient() {
    // Support both connection string and separate App ID/API Key
    let appId = process.env.APPINSIGHTS_APP_ID;
    let apiKey = process.env.APPINSIGHTS_API_KEY;
    let apiUrl = process.env.APPINSIGHTS_API_URL || 'https://api.applicationinsights.io';

    // If not provided as separate vars, try to extract from connection string
    if (!appId || !apiKey) {
      const connectionString = config.get('azure.appInsights.connectionString');
      if (connectionString) {
        const parts = connectionString.split(';');
        appId = appId || this._extractConnectionPart(parts, 'AppId') || this._extractConnectionPart(parts, 'ApplicationId');
        apiKey = apiKey || this._extractConnectionPart(parts, 'ApiKey') || this._extractConnectionPart(parts, 'InstrumentationKey');
      }
    }

    if (!appId || !apiKey) {
      throw new AppError('Application Insights App ID and API Key are required. Set APPINSIGHTS_APP_ID and APPINSIGHTS_API_KEY environment variables.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    this.appId = appId;
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;

    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 35000,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Extract specific part from connection string
   */
  _extractConnectionPart(parts, key) {
    // Try exact match first, then case-insensitive
    let part = parts.find(p => p.startsWith(`${key}=`));
    if (part) return part.substring(key.length + 1);

    // Try case-insensitive match
    const lowerKey = key.toLowerCase();
    part = parts.find(p => p.toLowerCase().startsWith(`${lowerKey}=`));
    return part ? part.substring(key.length + 1) : null;
  }

  /**
   * Execute a KQL query
   */
  async executeQuery(kql, options = {}) {
    const { limit = 100, timeout = 30000 } = options;

    logger.info('Executing KQL query', { kql: kql.substring(0, 200), limit });

    try {
      // Wrap KQL with limit if not present
      const safeKQL = this._ensureLimit(kql, limit);

      const response = await this.client.post(
        `/v1/apps/${this.appId}/query`,
        { query: safeKQL },
        { timeout }
      );

      const { tables, statistics } = response.data;

      if (!tables || tables.length === 0) {
        return {
          data: [],
          rowCount: 0,
          executionTime: statistics?.executionTime || 0
        };
      }

      // Transform to array of objects
      const columns = tables[0].columns.map(col => col.name);
      const rows = tables[0].rows.map(row => {
        const obj = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      });

      logger.info('Query executed successfully', { rowCount: rows.length, executionTime: statistics?.executionTime });

      return {
        data: rows,
        rowCount: rows.length,
        executionTime: statistics?.executionTime || 0,
        tables: tables
      };
    } catch (error) {
      logger.error('App Insights query failed', {
        error: error.message,
        kql: kql.substring(0, 100)
      });

      if (error.response) {
        const errorMessage = error.response.data?.error?.message || 'Application Insights query failed';
        throw new AppError(errorMessage, HTTP_STATUS.UNPROCESSABLE_ENTITY);
      }

      if (error.code === 'ECONNABORTED') {
        throw new AppError('Query timeout', HTTP_STATUS.SERVICE_UNAVAILABLE);
      }

      throw new AppError('Failed to execute query', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Ensure query has a limit clause
   */
  _ensureLimit(kql, limit) {
    const upperKQL = kql.toUpperCase();
    if (!upperKQL.includes('TAKE') && !upperKQL.includes('LIMIT')) {
      return `${kql.trim()} | take ${limit}`;
    }
    return kql;
  }

  /**
   * Get list of tables in App Insights
   */
  async getTables() {
    logger.info('Fetching available tables from App Insights');

    // Common App Insights tables to check
    const commonTables = [
      'requests', 'dependencies', 'exceptions', 'traces',
      'customEvents', 'availabilityResults', 'pageViews',
      'performanceCounters', 'browserTimings'
    ];

    const availableTables = [];

    for (const table of commonTables) {
      try {
        await this.client.post(
          `/v1/apps/${this.appId}/query`,
          { query: `${table} | take 1` },
          { timeout: 5000 }
        );
        availableTables.push(table);
      } catch (error) {
        // Table doesn't exist or is empty, skip it
      }
    }

    logger.info('Tables fetched successfully', { tableCount: availableTables.length });
    return availableTables;
  }

  /**
   * Get schema for a specific table
   */
  async getTableSchema(tableName) {
    logger.info('Fetching schema for table', { table: tableName });

    try {
      // Get schema using table() function
      const response = await this.client.post(
        `/v1/apps/${this.appId}/query`,
        { query: `${tableName} | getschema` },
        { timeout: 10000 }
      );

      if (!response.data?.tables?.[0]?.rows) {
        return null;
      }

      const schema = {};
      response.data.tables[0].rows.forEach(row => {
        schema[row[0]] = {
          data_type: row[1],
          column_type: row[2] || 'regular'
        };
      });

      logger.info('Schema fetched successfully', { table: tableName, columnCount: Object.keys(schema).length });
      return schema;
    } catch (error) {
      logger.error('Failed to fetch table schema', { error: error.message, table: tableName });
      return null;
    }
  }

  /**
   * Health check for App Insights
   */
  async healthCheck() {
    try {
      await this.getTables();
      return true;
    } catch (error) {
      logger.error('App Insights health check failed', { error: error.message });
      return false;
    }
  }
}

// Export singleton instance
const appInsightsService = new AppInsightsService();

module.exports = { appInsightsService, AppInsightsService };