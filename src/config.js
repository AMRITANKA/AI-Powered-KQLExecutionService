/**
 * Configuration Loader
 * Loads and validates configuration from config.yaml and environment variables
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

class Config {
  constructor() {
    this._config = null;
  }

  /**
   * Load configuration from file and environment
   */
  load(configPath = null) {
    const defaultPath = path.join(process.cwd(), 'config.yaml');
    const filePath = configPath || defaultPath;

    let fileConfig = {};

    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        fileConfig = yaml.parse(this._replaceEnvVars(fileContent)) || {};
      } catch (error) {
        throw new Error(`Failed to load config file: ${error.message}`);
      }
    }

    this._config = this._mergeWithDefaults(fileConfig);
    this._validate();
    return this._config;
  }

  /**
   * Replace ${VAR} with environment variables
   */
  _replaceEnvVars(content) {
    return content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || '';
    });
  }

  /**
   * Merge configuration with defaults
   */
  _mergeWithDefaults(config) {
    return {
      app: {
        host: config.app?.host || '0.0.0.0',
        port: parseInt(process.env.PORT, 10) || config.app?.port || 3000,
        name: config.app?.name || 'AI-Powered-KQLExecutionService'
      },
      azure: {
        appInsights: {
          connectionString: config.azure?.appInsights?.connectionString ||
            process.env.APPINSIGHTS_CONNECTION_STRING || '',
          apiUrl: config.azure?.appInsights?.apiUrl || 'https://api.applicationinsights.io',
          apiVersion: config.azure?.appInsights?.apiVersion || 'v1'
        }
      },
      llm: {
        provider: config.llm?.provider || 'openai',
        model: config.llm?.model || 'gpt-4',
        apiKey: config.llm?.apiKey || process.env.OPENAI_API_KEY ||
          process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY || '',
        baseURL: config.llm?.baseURL || process.env.LLM_BASE_URL || '',
        temperature: config.llm?.temperature || 0.1,
        maxTokens: config.llm?.maxTokens || 2000
      },
      security: {
        apiKeys: this._parseApiKeys(config.security?.apiKeys),
        rateLimit: {
          windowMs: config.security?.rateLimit?.windowMs || 60000,
          maxRequests: config.security?.rateLimit?.maxRequests || 100
        }
      },
      logging: {
        level: config.logging?.level || 'info',
        format: config.logging?.format || 'json'
      },
      features: {
        schemaCache: {
          enabled: config.features?.schemaCache?.enabled !== false,
          ttlMinutes: config.features?.schemaCache?.ttlMinutes || 60,
          maxTables: config.features?.schemaCache?.maxTables || 100
        }
      }
    };
  }

  /**
   * Parse API keys from config/env
   */
  _parseApiKeys(apiKeys) {
    if (!apiKeys || !Array.isArray(apiKeys)) {
      const envKey = process.env.API_KEY;
      return envKey ? [envKey] : [];
    }
    return apiKeys.filter(key => key && key.length > 0);
  }

  /**
   * Validate configuration
   */
  _validate() {
    const errors = [];

    // Check for App Insights - either connection string OR appId+apiKey
    const hasConnectionString = this._config.azure.appInsights.connectionString;
    const hasAppId = process.env.APPINSIGHTS_APP_ID;
    const hasApiKey = process.env.APPINSIGHTS_API_KEY;

    if (!hasConnectionString && (!hasAppId || !hasApiKey)) {
      errors.push('APPINSIGHTS_CONNECTION_STRING OR (APPINSIGHTS_APP_ID + APPINSIGHTS_API_KEY) is required');
    }

    if (!this._config.llm.apiKey) {
      errors.push('LLM API key is required (OPENAI_API_KEY, ANTHROPIC_API_KEY, or LLM_API_KEY)');
    }

    if (this._config.security.apiKeys.length === 0) {
      errors.push('At least one API key is required');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Get configuration value
   */
  get(path, defaultValue = null) {
    if (!this._config) {
      this.load();
    }

    const parts = path.split('.');
    let value = this._config;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Get full configuration
   */
  getAll() {
    if (!this._config) {
      this.load();
    }
    return this._config;
  }
}

// Export singleton instance
const config = new Config();

module.exports = config;