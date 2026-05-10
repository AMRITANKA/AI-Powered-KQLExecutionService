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

    logger.info('LLM response', { response: JSON.stringify(response).substring(0, 500) });

    // Handle various response formats
    let kql = null;

    if (response.choices && response.choices.length > 0) {
      kql = response.choices[0]?.message?.content?.trim();
    } else if (response.content) {
      // Alternative format
      kql = response.content.trim();
    } else if (response.text) {
      kql = response.text.trim();
    }

    if (!kql) {
      logger.error('Empty LLM response', { response: JSON.stringify(response) });
      throw new AppError('Empty response from LLM', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    // Clean up markdown code blocks if present
    kql = kql.replace(/^```kql\s*/i, '').replace(/^```\s*$/i, '').replace(/```$/i, '').trim();

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

    const kql = response.content[0]?.text?.trim();
    if (!kql) {
      throw new AppError('Empty response from LLM', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    logger.info('KQL generated successfully', { kql: kql.substring(0, 100) });
    return kql;
  }

  /**
   * Build system message with schema context
   */
  _buildSystemMessage(schema) {
    let message = KQL_SYSTEM_PROMPT;

    // Add few-shot examples
    message += '\n\n## Examples:\n';
    FEW_SHOT_EXAMPLES.forEach(example => {
      message += `\nUser: ${example.description}\n`;
      message += `Schema: ${JSON.stringify(example.schema)}\n`;
      message += `KQL: ${example.query}\n`;
    });

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