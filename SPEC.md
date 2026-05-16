# AI-Powered KQL Query Execution Service

## Project Overview

- **Project Name**: AI-Powered-KQLExecutionService - Natural Language to Kusto Query Language
- **Type**: REST API Service (Node.js/Express)
- **Core Functionality**: Convert natural language queries to KQL and execute against Azure Application Insights
- **Target Users**: DevOps engineers, SREs, security analysts, and developers who need to query Azure logs without KQL expertise

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────────┐
│   Client    │────▶│  Express API │────▶│  LLM Engine │────▶│  KQL Generator   │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────────┘
                           │                                             │
                           ▼                                             ▼
                    ┌──────────────┐                              ┌──────────────────┐
                    │  Validator   │──────┬───────────────┬──────▶│ Azure App Insights│
                    └──────────────┘      │               │       └──────────────────┘
                                          ▼               │
                                   ┌──────────────┐     │
                                   │Schema Memory │─────┘
                                   └──────────────┘
```

## Functionality Specification

### Core Features

#### 1. Natural Language to KQL Conversion
- Receive natural language query via REST endpoint
- Use LLM (OpenAI/Anthropic) to convert NL to KQL
- Apply schema validation before execution
- Return generated KQL query with results

#### 2. Direct KQL Execution
- Accept raw KQL queries for direct execution
- Validate KQL syntax and schema compatibility
- Execute against Azure Application Insights
- Return results in specified format

#### 3. Schema Memory System
- Discover and cache table schemas from App Insights
- Store column names, data types, and sample values
- Provide schema context to LLM for accurate KQL generation
- Support schema refresh and cache management

#### 4. Output Formats
- JSON (default): Structured data with metadata
- CSV: Flattened tabular data
- Table: Formatted ASCII table for terminal viewing

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/query | Execute natural language or KQL query |
| POST | /api/v1/validate | Validate KQL query without execution |
| GET | /api/v1/schema/:table | Get schema for specific table |
| GET | /api/v1/schema | List all cached schemas |
| POST | /api/v1/schema/refresh | Refresh schema cache |
| DELETE | /api/v1/schema | Clear schema cache |
| GET | /health | Health check endpoint |

### Request/Response Formats

#### POST /api/v1/query
**Request:**
```json
{
  "query": "Show me failed login attempts in the last hour",
  "type": "natural" | "kql",
  "output": "json" | "csv" | "table",
  "options": {
    "limit": 100,
    "timeout": 30000
  }
}
```

**Response:**
```json
{
  "success": true,
  "query": "SigninLogs | where ResultType != '0' | ...",
  "type": "natural",
  "executionTime": 1250,
  "rowCount": 45,
  "data": [...],
  "metadata": {
    "generatedAt": "2026-05-10T10:30:00Z",
    "table": "SigninLogs"
  }
}
```

### Error Handling
- HTTP 400: Invalid request format
- HTTP 401: Missing/invalid API key
- HTTP 422: KQL validation failed
- HTTP 429: Rate limit exceeded
- HTTP 500: Internal server error
- HTTP 503: Azure App Insights unavailable

## Configuration (config.yaml)

```yaml
app:
  host: "0.0.0.0"
  port: 3000

azure:
  appInsights:
    connectionString: "${APPINSIGHTS_CONNECTION_STRING}"
    apiUrl: "https://api.applicationinsights.io"

llm:
  provider: "openai" | "anthropic"
  model: "gpt-4" | "claude-3"
  apiKey: "${LLM_API_KEY}"
  temperature: 0.1
  maxTokens: 2000

security:
  apiKeys:
    - "key1"
    - "key2"
  rateLimit:
    windowMs: 60000
    maxRequests: 100

logging:
  level: "info"
  format: "json"

features:
  schemaCache:
    enabled: true
    ttlMinutes: 60
```

## Acceptance Criteria

1. **NL to KQL Conversion**: Natural language queries are accurately converted to valid KQL
2. **Schema Validation**: Generated KQL uses only columns that exist in the table schema
3. **Direct Execution**: Raw KQL queries execute successfully against App Insights
4. **Output Formats**: All three output formats (JSON, CSV, Table) work correctly
5. **Schema Discovery**: Table schemas are automatically discovered and cached
6. **Error Handling**: All error cases return appropriate HTTP status codes with clear messages
7. **Security**: API key authentication and rate limiting are enforced
8. **Performance**: Queries complete within timeout (default 30s)
9. **Logging**: All requests and responses are logged appropriately
10. **Health Check**: /health endpoint returns service status
