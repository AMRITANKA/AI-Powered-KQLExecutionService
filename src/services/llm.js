/**
 * LLM Service
 * Handles communication with OpenAI and Anthropic for KQL generation
 */

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const { KQL_SYSTEM_PROMPT, FEW_SHOT_EXAMPLES } = require('../constants');
const { logger } = require('../middleware/logger');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS } = require('../constants');

/**
  * Strip markdown fences and preamble text from LLM KQL response
*/

function _cleanKqlResponse(raw) {
  return raw
  .replace(/^```kql\s*/im, '')
  .replace(/^```kusto\s*$/im, '')
  .replace(/^```\s*/im, '')
  .replace(/^```\s*$/im, '')
  .replace(/^(Here is|Here's|The KQL query is)[^:]*:\s*/i, '')
  .replace(/\n{3,}/g, '\n')
  .trim();
}

class LLMService {
  constructor() {
    this.provider = config.get('llm.provider', 'openai');
    this._initializeClient();
  }

  /**
   * Initialize the LLM client based on provider
   */
  _initializeClient() {
    const apiKey = config.get('llm.apiKey');
    const baseURL = config.get('llm.baseURL');

    if (this.provider === 'openai') {
      this.client = new OpenAI({
        apiKey: apiKey,
        baseURL: baseURL || undefined,
        timeout: 30000
      });
    } else if (this.provider === 'anthropic') {
      this.client = new Anthropic({
        apiKey: apiKey,
        maxTimeout: 30000
      });
    } else if (this.provider === 'custom' || this.provider === 'opencode') {
      // Custom provider using OpenAI-compatible API (e.g., opencode.ai, MiniMax)
      this.client = new OpenAI({
        apiKey: apiKey,
        baseURL: baseURL || 'https://api.opencode.ai/v1',
        timeout: 30000
      });
    } else {
      throw new AppError(`Unsupported LLM provider: ${this.provider}`, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Generate KQL query from natural language
   */
  async generateKQL(naturalLanguageQuery, schema = null) {
    logger.info('Generating KQL from natural language', { query: naturalLanguageQuery });

    try {
      if (this.provider === 'openai' || this.provider === 'custom' || this.provider === 'opencode') {
        return await this._generateWithOpenAI(naturalLanguageQuery, schema);
      } else if (this.provider === 'anthropic') {
        return await this._generateWithAnthropic(naturalLanguageQuery, schema);
      }
    } catch (error) {
      logger.error('LLM generation failed', { error: error.message });
      throw new AppError('Failed to generate KQL query', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Generate KQL using OpenAI
   */
  async _generateWithOpenAI(query, schema) {
    const systemMessage = this._buildSystemMessage(schema);
    const userMessage = this._buildUserMessage(query);

    const response = await this.client.chat.completions.create({
      model: config.get('llm.model', 'gpt-4'),
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      temperature: config.get('llm.temperature', 0.1),
      max_tokens: config.get('llm.maxTokens', 2000)
    });

    // Log token usage for cost monitoring
    if (response.usage) {
      logger.info('LLM token usage', {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        model: config.get('llm.model', 'gpt-4')
      });
    }

    // Handle various response formats
    let raw = null;
    if (response.choices && response.choices.length > 0) {
      raw = response.choices[0].message?.content?.trim();
    }else if (response.content) {
      raw = typeof response.content === 'string' ? response.content.trim() : null;
    } else if (response.text) {
      raw = response.text.trim();
    }

    if (!raw) {
      logger.error('Empty LLM response', { response: JSON.stringify(response) });
      throw new AppError('Empty response from LLM', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    const kql = _cleanKqlResponse(raw);
    logger.info('KQL generated successfully', { kql: kql.substring(0, 100) });
    return kql;
  }

  /**
   * Generate KQL using Anthropic
   */
  async _generateWithAnthropic(query, schema) {
    const systemMessage = this._buildSystemMessage(schema);
    const userMessage = this._buildUserMessage(query);

    const response = await this.client.messages.create({
      model: config.get('llm.model', 'claude-3-sonnet-20240229'),
      system: systemMessage,
      messages: [
        { role: 'user', content: userMessage }
      ],
      temperature: config.get('llm.temperature', 0.1),
      max_tokens: config.get('llm.maxTokens', 2000)
    });

    const raw = response.content[0]?.text?.trim();
    if (!raw) {
       throw new AppError('Empty response from LLM', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    const kql = _cleanKqlResponse(raw);
    logger.info('KQL generated successfully', { kql: kql.substring(0, 100) });
    return kql;
  }

  /**
   * Get key columns for project clause based on table type
   * Returns a dynamic list of important columns for each table
   */
  _getKeyColumns(tableName) {
    const columnMap = {
      requests: ['timestamp', 'id', 'name', 'url', 'resultCode', 'success', 'duration', 'operation_Name', 'operation_Id', 'cloud_RoleName','appName'],
      dependencies: ['timestamp', 'name', 'type', 'target', 'duration', 'success', 'resultCode', 'operation_Id'],
      exceptions: ['appId', 'appName', 'cloud_RoleName', 'details','innermostMessage', 'operation_Id', 'operation_Name', 'outerMessage', 'severityLevel', 'timestamp'],
      traces: ['timestamp', 'message', 'severityLevel', 'operation_Name', 'operation_Id', 'cloud_RoleName', 'appId', 'appName'],
      customEvents: ['timestamp', 'name', 'customDimensions'],
      customMetrics: ['timestamp', 'name', 'value', 'customDimensions'],
      availabilityResults: ['timestamp', 'name', 'location', 'success', 'duration'],
      performanceCounters: ['timestamp', 'name', 'counter', 'value', 'instance'],
      pageViews: ['timestamp', 'name', 'url', 'duration'],
      browserTimings: ['timestamp', 'name', 'url', 'totalDuration']
    };
    return columnMap[tableName] || ['timestamp'];
  }

  /**
   * Filter columns that actually exist in the schema
   */
  _filterExistingColumns(columns, schema) {
    if (!schema) return columns;
    return columns.filter(col => schema[col] !== undefined);
  }

  /**
   * Build dynamic project clause from schema
   */
  _buildProjectClause(tableName, schema) {
    const keyColumns = this._getKeyColumns(tableName);
    const existingColumns = this._filterExistingColumns(keyColumns, schema);
    if (existingColumns.length === 0) {
      return '';
    }
    return `project ${existingColumns.join(', ')}`;
  }

  /**
   * Generate dynamic examples based on actual schema
   */
  _buildDynamicExamples(schema) {
    if (!schema) {
      // No schema - use default examples
      return FEW_SHOT_EXAMPLES.map(ex => ({
        description: ex.description,
        query: ex.query
      })).join('\n\n');
    }

    // Detect table from schema keys
    const tableName = this._detectTableFromSchema(schema);
    const projectClause = this._buildProjectClause(tableName, schema);

    // Build dynamic examples with actual project clause
    const dynamicExamples = [
      {
        description: "Show failed requests in the last hour",
        query: `requests
| where timestamp > ago(1h)
| where success == false
| ${projectClause}
| order by timestamp desc
| take 100`
      },
      {
        description: "Top exceptions by count in the last 24 hours",
        query: `exceptions
| where timestamp > ago(24h)
| summarize OccurrenceCount = count() by type, message
| top 10 by OccurrenceCount desc`
      },
      {
        description: "Error logs in the last 2 hours",
        query: `traces
| where timestamp > ago(2h)
| where severityLevel >= 3
| ${projectClause}
| order by timestamp desc
| take 200`
      }
    ];

    return dynamicExamples.map(ex => `User: ${ex.description}\nKQL: ${ex.query}`).join('\n\n');
  }

  /**
   * Detect table name from schema keys
   */
  _detectTableFromSchema(schema) {
    const knownTables = {
      success: 'requests',
      resultCode: 'requests',
      duration: 'requests',
      type: 'dependencies',
      target: 'dependencies',
      problemId: 'exceptions',
      severityLevel: 'traces',
      name: 'customEvents',
      value: 'customMetrics'
    };

    for (const [key, table] of Object.entries(knownTables)) {
      if (schema[key]) {
        return table;
      }
    }
    return 'requests'; // default
  }

  /**
   * Build system message with schema context
   */
  _buildSystemMessage(schema) {
    let message = KQL_SYSTEM_PROMPT;

    // Add dynamic few-shot examples based on schema
    message += '\n\n## Examples:\n';
    message += this._buildDynamicExamples(schema);

    // Add schema if provided
    if (schema) {
      message += `\n\n## Current Schema:\n${JSON.stringify(schema, null, 2)}`;
    }

    return message;
  }

  /**
   * Build user message for KQL generation
   */
  _buildUserMessage(query) {
    return `Generate a KQL query for: "${query}"

Return ONLY the KQL query, no explanations or markdown.`;
  }

  /**
   * Validate that LLM is properly configured
   */
  async healthCheck() {
    try {
      if (this.provider === 'openai' || this.provider === 'custom' || this.provider === 'opencode') {
        // Try a simple completion instead of models.list as not all compatible APIs support it
        await this.client.chat.completions.create({
          model: config.get('llm.model', 'gpt-4'),
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5
        });
      } else if (this.provider === 'anthropic') {
        await this.client.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        });
      }
      return true;
    } catch (error) {
      logger.error('LLM health check failed', { error: error.message });
      return false;
    }
  }
}

// Export singleton instance
const llmService = new LLMService();

module.exports = { llmService, LLMService };