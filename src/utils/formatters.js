/**
 * Output Formatters
 * Handles JSON, CSV, and Table output formatting
 */

const stringify = require('csv-stringify/sync');
const { table } = require('table');

/**
 * Format output based on requested format
 */
function formatOutput(data, format, options = {}) {
  switch (format) {
    case 'csv':
      return formatCSV(data);
    case 'table':
      return formatTable(data);
    case 'json':
    default:
      return formatJSON(data, options);
  }
}

/**
 * Format data as JSON
 */
function formatJSON(data, options = {}) {
  const { pretty = true } = options;

  if (pretty) {
    return JSON.stringify(data, null, 2);
  }
  return JSON.stringify(data);
}

/**
 * Format data as CSV
 */
function formatCSV(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  try {
    return stringify.stringify(data, {
      header: true,
      quoted_string: true
    });
  } catch (error) {
    // Fallback for complex data types
    const simplified = data.map(row => {
      const simplifiedRow = {};
      for (const [key, value] of Object.entries(row)) {
        simplifiedRow[key] = typeof value === 'object' ? JSON.stringify(value) : value;
      }
      return simplifiedRow;
    });
    return stringify.stringify(simplified, {
      header: true,
      quoted_string: true
    });
  }
}

/**
 * Format data as ASCII table
 */
function formatTable(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return 'No data';
  }

  // Get all unique headers
  const headers = new Set();
  data.forEach(row => {
    Object.keys(row).forEach(key => headers.add(key));
  });
  const headerArray = Array.from(headers);

  // Build rows
  const rows = data.map(row => {
    return headerArray.map(header => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    });
  });

  // Create table config - only pass column-width array (no unsupported properties)
  const columnWidths = headerArray.map((header, index) =>
  Math.min(
    50,
    Math.max(
      10,
      header.length,
      ...rows.map(row => (row[index] || '').toString().length)
    )
  )
  );

  const config = {
    columns: columnWidths.map(width => ({ width }))
  };

  return table([headerArray, ...rows], config);
}

/**
 * Format error response
 */
function formatError(error, options = {}) {
  const { includeStack = false } = options;

  const response = {
    success: false,
    error: error.message || 'Unknown error'
  };

  if (error.code) {
    response.code = error.code;
  }

  if (error.details) {
    response.details = error.details;
  }

  if (includeStack && error.stack) {
    response.stack = error.stack;
  }

  return formatJSON(response);
}

/**
 * Format success response
 */
function formatSuccess(data, options = {}) {
  return formatJSON({ success: true, ...data }, options);
}

/**
 * Truncate long strings for display
 */
function truncateString(str, maxLength = 100) {
  if (!str || typeof str !== 'string') {
    return str;
  }
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Escape special characters for CSV
 */
function escapeCSVValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = {
  formatOutput,
  formatJSON,
  formatCSV,
  formatTable,
  formatError,
  formatSuccess,
  truncateString,
  escapeCSVValue
};