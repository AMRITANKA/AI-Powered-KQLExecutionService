# NL2KQL - AI-Powered KQL Query Execution

Natural Language to Kusto Query Language (KQL) conversion and execution service for Azure Application Insights.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [User Manual](#user-manual)
- [API Reference](#api-reference)
- [Development](#development)

---

## Overview

NL2KQL is a REST API service that allows you to query Azure Application Insights using natural language. Instead of writing complex KQL queries, you can simply describe what you want to know in plain English, and the AI will generate and execute the corresponding KQL query.

**Example:**
- Input: "Show me recent errors"
- AI generates: `traces | where severityLevel >= 3 | where timestamp > ago(1h) | take 100`

---

## How It Works

```
+-----------+    +----------+    +--------+    +--------+
| User      |--->| Express  |--->| LLM    |--->| Azure  |
| Request   |    | API      |    | Service|    | App    |
+-----------+    +----------+    +--------+    +--------+
                 |
                 +-- Auth Check
                 +-- Rate Limit
                 
                 |
                 +-- System Prompt
                 +-- Few-Shot Examples
                 
                 |
                 +-- KQL Execution
                 +-- Results
```

### Step-by-Step Flow:

1. **Request Received**: API validates the request (auth, rate limit, schema)
2. **Natural Language Processing**: If type is "natural", the LLM converts English to KQL
3. **Schema Validation**: Query is validated against available table schemas
4. **KQL Execution**: KQL query is executed against Azure Application Insights
5. **Response**: Results returned in requested format (JSON/CSV/Table)

---

## Features

- **Natural Language to KQL**: Convert plain English queries to KQL using AI
- **Direct KQL Execution**: Execute raw KQL queries directly
- **Multiple Output Formats**: JSON, CSV, or table output
- **Schema Validation**: Validates queries against table schemas
- **Schema Memory**: Caches table schemas for improved performance
- **Production Ready**: Rate limiting, authentication, error handling, logging
- **Flexible LLM**: Supports OpenAI, Anthropic, and custom OpenAI-compatible APIs (like opencode.ai, MiniMax)

---

## Prerequisites

- Node.js 18+
- Azure Application Insights (App ID + API Key)
- LLM API Key (OpenAI, Anthropic, or compatible provider)

---

## Quick Start

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd KQL-QueryExecution-with-Natural-Language

# Install dependencies
npm install
```

### 2. Configure Environment

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Azure Application Insights
APPINSIGHTS_APP_ID=your-app-id
APPINSIGHTS_API_KEY=your-api-key
APPINSIGHTS_API_URL=https://api.applicationinsights.io

# LLM Configuration
LLM_API_KEY=your-llm-api-key

# API Security
API_KEY=your-secure-api-key
```

### 3. Configure LLM Provider

Edit `config.yaml` to choose your LLM provider:

```yaml
llm:
  # Options: openai, anthropic, custom
  provider: "custom"
  # For custom (opencode.ai, MiniMax, etc.)
  model: "minimax-m2.5-free"
  baseURL: "https://opencode.ai/zen/v1"
```

### 4. Start the Server

```bash
npm start
```

Server runs at `http://localhost:3000`

---

## Configuration

### config.yaml

| Section | Option | Description | Default |
|---------|--------|-------------|---------|
| app | port | Server port | 3000 |
| app | host | Server host | 0.0.0.0 |
| azure.appInsights | connectionString | Azure connection string | - |
| azure.appInsights | apiUrl | App Insights API URL | https://api.applicationinsights.io |
| llm | provider | LLM provider (openai/anthropic/custom) | openai |
| llm | model | Model name | gpt-4 |
| llm | baseURL | Custom API URL for custom provider | - |
| llm | temperature | LLM creativity (0-1) | 0.1 |
| llm | maxTokens | Max response tokens | 2000 |
| security.apiKeys | - | Array of valid API keys | - |
| security.rateLimit.windowMs | - | Rate limit window (ms) | 60000 |
| security.rateLimit.maxRequests | - | Max requests per window | 100 |
| features.schemaCache.enabled | - | Enable schema caching | true |
| features.schemaCache.ttlMinutes | - | Cache TTL (minutes) | 60 |

---

## User Manual

### Making Your First Query

#### Using Natural Language

```bash
curl --location 'http://localhost:3000/api/v1/query' \
  --header 'x-api-key: your-secure-api-key' \
  --header 'Content-Type: application/json' \
  --data '{
    "query": "Show me recent API requests",
    "type": "natural",
    "output": "json"
  }'
```

**Response:**
```json
{
  "success": true,
  "query": "requests | take 100",
  "type": "natural",
  "executionTime": 9767,
  "rowCount": 31,
  "data": [...],
  "metadata": {
    "generatedAt": "2026-05-10T11:17:38.909Z",
    "outputFormat": "json"
  }
}
```

#### Using Raw KQL

```bash
curl --location 'http://localhost:3000/api/v1/query' \
  --header 'x-api-key: your-secure-api-key' \
  --header 'Content-Type: application/json' \
  --data '{
    "query": "traces | where severityLevel >= 3 | take 50",
    "type": "kql",
    "output": "json"
  }'
```

### Example Queries

| Natural Language | Generated KQL |
|------------------|---------------|
| "Show me recent errors" | `traces \| where severityLevel >= 3 \| where timestamp > ago(1h) \| take 100` |
| "Show me failed requests" | `requests \| where success == "False" \| take 100` |
| "Top 10 slow requests" | `requests \| order by duration desc \| take 10` |
| "Errors in last 24 hours" | `traces \| where timestamp > ago(24h) \| where severityLevel >= 3 \| take 100` |

### Query Options

```json
{
  "query": "Show me errors",
  "type": "natural",
  "output": "json",
  "options": {
    "limit": 50,
    "timeout": 30000
  }
}
```

### Output Formats

- **JSON**: `{"query": "...", "type": "natural", "output": "json"}`
- **CSV**: `{"query": "...", "type": "natural", "output": "csv"}`
- **Table**: `{"query": "...", "type": "natural", "output": "table"}`

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/query | Execute natural language or KQL query |
| POST | /api/v1/validate | Validate a KQL query |
| GET | /api/v1/schema/:table | Get schema for a specific table |
| GET | /api/v1/schema | List all available table schemas |
| GET | /health | Health check |

### POST /api/v1/query

**Request:**
```json
{
  "query": "string (required)",
  "type": "natural|kql (required)",
  "output": "json|csv|table (optional, default: json)",
  "options": {
    "limit": "number (optional, default: 100)",
    "timeout": "number (optional, default: 30000)"
  }
}
```

**Response:**
```json
{
  "success": "boolean",
  "query": "string",
  "type": "string",
  "executionTime": "number (ms)",
  "rowCount": "number",
  "data": "array",
  "metadata": {
    "generatedAt": "string",
    "outputFormat": "string"
  }
}
```

### Error Responses

| Status Code | Description |
|-------------|-------------|
| 400 | Invalid request format |
| 401 | Missing or invalid API key |
| 422 | KQL validation failed |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 503 | Service unavailable |

---

## Developers

- [Amritanka Pal](https://github.com/Amritanka)

---

## Development

### Commands

```bash
# Start production server
npm start

# Start development mode (with auto-reload)
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix
```

### Project Structure

```
├── src/
│   ├── config.js          # Configuration loader
│   ├── constants.js       # Constants and prompts
│   ├── index.js           # Entry point
│   ├── server.js          # Express server setup
│   ├── middleware/        # Express middleware
│   │   ├── logger.js      # Winston logger
│   │   └── errorHandler.js
│   ├── routes/            # API routes
│   │   └── query.js
│   └── services/          # Business logic
│       ├── appInsights.js # Azure API client
│       ├── llm.js        # LLM client
│       └── schemaManager.js
├── tests/                 # Test files
├── config.yaml            # Configuration
├── .env                   # Environment variables
└── package.json
```

---
