/**
 * Unit Tests for AI-Powered-KQLExecutionService
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Test constants
const { QUERY_TYPES, OUTPUT_FORMATS, HTTP_STATUS } = require('../src/constants');

describe('Constants', () => {
  it('should have valid query types', () => {
    assert.strictEqual(QUERY_TYPES.NATURAL, 'natural');
    assert.strictEqual(QUERY_TYPES.KQL, 'kql');
  });

  it('should have valid output formats', () => {
    assert.strictEqual(OUTPUT_FORMATS.JSON, 'json');
    assert.strictEqual(OUTPUT_FORMATS.CSV, 'csv');
    assert.strictEqual(OUTPUT_FORMATS.TABLE, 'table');
  });

  it('should have valid HTTP status codes', () => {
    assert.strictEqual(HTTP_STATUS.OK, 200);
    assert.strictEqual(HTTP_STATUS.BAD_REQUEST, 400);
    assert.strictEqual(HTTP_STATUS.UNAUTHORIZED, 401);
    assert.strictEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR, 500);
  });
});

describe('KQL System Prompt', () => {
  const { KQL_SYSTEM_PROMPT } = require('../src/constants');

  it('should include critical KQL rules', () => {
    assert.ok(KQL_SYSTEM_PROMPT.includes('timestamp'));
    assert.ok(KQL_SYSTEM_PROMPT.includes('join'));
  });

  it('should include exceptions table guidance', () => {
    assert.ok(KQL_SYSTEM_PROMPT.includes('exceptions'));
    assert.ok(KQL_SYSTEM_PROMPT.includes('details'));
  });

  it('should include guardrails', () => {
    assert.ok(KQL_SYSTEM_PROMPT.includes('GUARDRAILS'));
  });
});

describe('Few-shot Examples', () => {
  const { FEW_SHOT_EXAMPLES } = require('../src/constants');

  it('should have examples', () => {
    assert.ok(FEW_SHOT_EXAMPLES.length > 0);
  });

  it('each example should have required fields', () => {
    FEW_SHOT_EXAMPLES.forEach(example => {
      assert.ok(example.description, 'Missing description');
      assert.ok(example.schema, 'Missing schema');
      assert.ok(example.query, 'Missing query');
    });
  });
});

describe('Formatters', () => {
  const { formatJSON, formatCSV, formatTable, formatOutput } = require('../src/utils/formatters');

  it('should format JSON correctly', () => {
    const data = { name: 'test', value: 123 };
    const result = formatJSON(data);
    assert.ok(result.includes('test'));
    assert.ok(result.includes('123'));
  });

  it('should format CSV correctly', () => {
    const data = [{ name: 'test', value: 123 }];
    const result = formatCSV(data);
    assert.ok(result.includes('name'));
    assert.ok(result.includes('test'));
  });

  it('should format table correctly', () => {
    const data = [{ name: 'test', value: 123 }];
    const result = formatTable(data);
    assert.ok(result.includes('name'));
  });

  it('should handle empty data', () => {
    assert.strictEqual(formatCSV([]), '');
    assert.strictEqual(formatTable([]), 'No data');
  });
});

describe('Validator', () => {
  const { validator } = require('../src/services/validator');

  it('should validate valid KQL', async () => {
    const result = await validator.validate('Table | take 10');
    assert.ok(result.warnings !== undefined);
  });

  it('should detect empty query', async () => {
    const result = await validator.validate('');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('should detect join with OR condition', async () => {
    const result = await validator.validate('Table1 | join Table2 on Col1 or Col2');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('or')));
  });
});

console.log('Running unit tests...');