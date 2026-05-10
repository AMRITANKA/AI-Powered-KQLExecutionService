/**
 * KQL Validator Service
 * Validates KQL queries against schema and syntax rules
 */

const { schemaManager } = require('./schemaManager');
const { logger } = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS } = require('../constants');

class Validator {
  /**
   * Validate KQL query
   */
  async validate(kql) {
    const errors = [];

    // Basic syntax validation
    const syntaxErrors = this._validateSyntax(kql);
    if (syntaxErrors.length > 0) {
      errors.push(...syntaxErrors);
    }

    // Extract table name and validate columns
    const tableName = this._extractTableName(kql);
    if (tableName) {
      const schemaValidation = await this._validateAgainstSchema(kql, tableName);
      if (schemaValidation.errors.length > 0) {
        errors.push(...schemaValidation.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: this._getWarnings(kql)
    };
  }

  /**
   * Basic KQL syntax validation
   */
  _validateSyntax(kql) {
    const errors = [];

    if (!kql || typeof kql !== 'string') {
      errors.push('Query must be a non-empty string');
      return errors;
    }

    const trimmedKql = kql.trim();
    if (trimmedKql.length === 0) {
      errors.push('Query cannot be empty');
    }

    // Check for balanced pipes
    const pipeCount = (trimmedKql.match(/\|/g) || []).length;
    if (pipeCount === 0 && !trimmedKql.includes('|')) {
      // Query without pipes might just be a table name - that's OK
    }

    // Check for invalid join syntax (using 'or' in join conditions)
    const joinMatch = trimmedKql.match(/join\s+.*\s+on\s+([^|]+)/gi);
    if (joinMatch) {
      joinMatch.forEach(join => {
        if (/\s+or\s+/.test(join)) {
          errors.push('JOIN conditions must use "and", not "or"');
        }
      });
    }

    // Check for unclosed strings
    const singleQuotes = (trimmedKql.match(/'/g) || []).length;
    const doubleQuotes = (trimmedKql.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0) {
      errors.push('Unclosed single quote in query');
    }
    if (doubleQuotes % 2 !== 0) {
      errors.push('Unclosed double quote in query');
    }

    return errors;
  }

  /**
   * Extract table name from KQL
   */
  _extractTableName(kql) {
    const trimmedKql = kql.trim();

    // Match table name at the start (before first pipe or whitespace)
    const match = trimmedKql.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
    return match ? match[1] : null;
  }

  /**
   * Validate KQL against table schema
   */
  async _validateAgainstSchema(kql, tableName) {
    const errors = [];
    const schema = await schemaManager.getSchema(tableName);

    if (!schema) {
      // Schema not available - skip column validation
      return { errors: [], tableExists: false };
    }

    // Extract column names from query
    const columns = this._extractColumns(kql);

    for (const col of columns) {
      // Skip function names and keywords
      if (this._isKQLKeyword(col) || this._isKQLFunction(col)) {
        continue;
      }

      // Check if column exists in schema
      const normalizedCol = col.replace(/[\[\]]/g, '');
      if (!schema[normalizedCol] && !schema[col]) {
        // Check if it might be a valid schema column with different casing
        const matchingCol = Object.keys(schema).find(
          key => key.toLowerCase() === normalizedCol.toLowerCase()
        );
        if (!matchingCol) {
          errors.push(`Column '${col}' not found in table '${tableName}' schema`);
        }
      }
    }

    return { errors, tableExists: true };
  }

  /**
   * Extract column names from KQL
   */
  _extractColumns(kql) {
    const columns = [];
    const patterns = [
      /project\s+([a-zA-Z_\[\]'"]+[\s,\w]*)/gi,
      /extend\s+([a-zA-Z_][\w]*)/gi,
      /where\s+([a-zA-Z_][\w]*)/gi,
      /summarize\s+([a-zA-Z_][\w]*)/gi,
      /order\s+by\s+([a-zA-Z_][\w]*)/gi,
      /sort\s+by\s+([a-zA-Z_][\w]*)/gi,
      /join\s+.*\s+on\s+([a-zA-Z_][\w.]*)/gi
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(kql)) !== null) {
        const content = match[1];
        const colMatches = content.match(/([a-zA-Z_][\w]*|\[[^\]]+\])/g);
        if (colMatches) {
          columns.push(...colMatches);
        }
      }
    });

    return [...new Set(columns)];
  }

  /**
   * Check if string is a KQL keyword
   */
  _isKQLKeyword(str) {
    const keywords = [
      'where', 'project', 'extend', 'summarize', 'limit', 'take',
      'order', 'sort', 'by', 'asc', 'desc', 'join', 'on', 'let',
      'where', 'distinct', 'top', 'mv-expand', 'parse', 'where',
      'filter', 'compute'
    ];
    return keywords.includes(str.toLowerCase());
  }

  /**
   * Check if string is a KQL function
   */
  _isKQLFunction(str) {
    const functions = [
      'count', 'sum', 'min', 'max', 'avg', 'dcount', 'percentile',
      'now', 'ago', 'format_datetime', 'todatetime', 'tostring',
      'toint', 'tolong', 'toreal', 'isnull', 'isnotnull', 'iff',
      'strlen', 'substring', 'replace', 'split', 'toupper', 'tolower',
      'extract', 'extractjson', 'parsejson', 'bag_unpack'
    ];
    return functions.includes(str.toLowerCase());
  }

  /**
   * Get warnings for query
   */
  _getWarnings(kql) {
    const warnings = [];

    // Warn about using *
    if (kql.includes('project *')) {
      warnings.push('Avoid using "project *" - specify columns explicitly for better performance');
    }

    // Warn about missing time filter
    if (!kql.includes('ago') && !kql.includes('TimeGenerated') && !kql.includes('timestamp')) {
      warnings.push('Consider adding a time filter (e.g., | where TimeGenerated > ago(1h))');
    }

    // Warn about case sensitivity
    const camelCaseCols = kql.match(/[a-z]+[A-Z][a-zA-Z]*/g);
    if (camelCaseCols) {
      warnings.push('Column names are case-sensitive in KQL');
    }

    return warnings;
  }

  /**
   * Repair invalid column names if schema provides alternatives
   */
  async repairKQL(kql, tableName) {
    const schema = await schemaManager.getSchema(tableName);
    if (!schema) {
      return { success: false, kql, message: 'Schema not available for repair' };
    }

    let repairedKql = kql;
    const columns = this._extractColumns(kql);

    for (const col of columns) {
      const normalizedCol = col.replace(/[\[\]]/g, '');
      if (!schema[normalizedCol] && !schema[col]) {
        // Try to find matching column
        const matchingCol = Object.keys(schema).find(
          key => key.toLowerCase() === normalizedCol.toLowerCase()
        );
        if (matchingCol) {
          repairedKql = repairedKql.replace(
            new RegExp(`\\b${col}\\b`, 'gi'),
            matchingCol
          );
        }
      }
    }

    return {
      success: repairedKql !== kql,
      original: kql,
      repaired: repairedKql
    };
  }
}

// Export singleton instance
const validator = new Validator();

module.exports = { validator, Validator };