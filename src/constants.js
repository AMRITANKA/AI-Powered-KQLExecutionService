/**
 * KQL Query Generation Constants
 */

const KQL_SYSTEM_PROMPT = `You are an expert in Kusto Query Language (KQL). You generate accurate, efficient KQL queries.

CRITICAL RULES:
1. **Join Conditions**: ONLY use 'and' in join conditions, NEVER 'or'
   - ✅ CORRECT: Table1 | join Table2 on Col1 and Col2
   - ❌ WRONG: Table1 | join Table2 on Col1 or Col2

2. **Column Validation**: ONLY use columns that exist in the provided schema
   - Always check the schema before using a column name
   - Use exact column names (case-sensitive)

3. **Reserved Words**: Bracket reserved words and special characters
   - Use ['column-name'] for columns with hyphens or spaces
   - Use ['table name'] for tables with spaces

4. **Operator Best Practices**:
   - Use 'project' to select specific columns (avoid 'project *')
   - Use 'where' for filtering
   - Use 'summarize' for aggregations
   - Use 'extend' to add calculated columns
   - Use 'take' or 'limit' to limit results

5. **Data Types**: Use proper type conversions
   - toint(), tolong(), toreal() for numbers
   - tostring() for strings
   - todatetime() for dates
   - Handle nulls with isnull(), isnotnull(), iff()

OUTPUT FORMAT:
Return ONLY the KQL query, nothing else. No explanations, no markdown, just the query.`;

/**
 * Few-shot learning examples for KQL generation
 */
const FEW_SHOT_EXAMPLES = [
  {
    description: "Show recent failed login attempts",
    schema: {
      table: "SigninLogs",
      columns: {
        TimeGenerated: { data_type: "datetime" },
        UserPrincipalName: { data_type: "string" },
        ResultType: { data_type: "string" },
        ResultDescription: { data_type: "string" },
        IPAddress: { data_type: "string" },
        Location: { data_type: "string" }
      }
    },
    query: "SigninLogs | where ResultType != '0' | where TimeGenerated > ago(1h) | project TimeGenerated, UserPrincipalName, ResultDescription, IPAddress, Location | take 100"
  },
  {
    description: "Count events by severity in the last 24 hours",
    schema: {
      table: "SecurityEvent",
      columns: {
        TimeGenerated: { data_type: "datetime" },
        EventID: { data_type: "int" },
        Level: { data_type: "string" },
        Computer: { data_type: "string" },
        Account: { data_type: "string" }
      }
    },
    query: "SecurityEvent | where TimeGenerated > ago(24h) | summarize Count=count() by Level | order by Count desc"
  },
  {
    description: "Find top 10 users by activity",
    schema: {
      table: "AuditLogs",
      columns: {
        TimeGenerated: { data_type: "datetime" },
        OperationName: { data_type: "string" },
        InitiatedBy: { data_type: "string" },
        TargetResources: { data_type: "dynamic" },
        Result: { data_type: "string" }
      }
    },
    query: "AuditLogs | summarize ActivityCount=count() by InitiatedBy | top 10 by ActivityCount desc"
  },
  {
    description: "Join two tables to correlate data",
    schema: {
      table1: "Alerts",
      columns1: {
        AlertId: { data_type: "string" },
        Severity: { data_type: "string" },
        DeviceId: { data_type: "string" },
        TimeGenerated: { data_type: "datetime" }
      },
      table2: "Devices",
      columns2: {
        DeviceId: { data_type: "string" },
        DeviceName: { data_type: "string" },
        OSPlatform: { data_type: "string" }
      }
    },
    query: "Alerts | join kind=inner Devices on DeviceId | project TimeGenerated, AlertId, Severity, DeviceName, OSPlatform | take 50"
  }
];

/**
 * HTTP Status Codes
 */
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

/**
 * Error Messages
 */
const ERROR_MESSAGES = {
  INVALID_REQUEST: "Invalid request format",
  MISSING_API_KEY: "Missing API key",
  INVALID_API_KEY: "Invalid API key",
  MISSING_QUERY: "Query is required",
  INVALID_QUERY_TYPE: "Query type must be 'natural' or 'kql'",
  INVALID_OUTPUT_FORMAT: "Output format must be 'json', 'csv', or 'table'",
  QUERY_VALIDATION_FAILED: "KQL query validation failed",
  LLM_GENERATION_FAILED: "Failed to generate KQL query",
  APPINSIGHTS_ERROR: "Azure Application Insights error",
  SCHEMA_NOT_FOUND: "Table schema not found",
  TIMEOUT: "Query timeout"
};

/**
 * Query Types
 */
const QUERY_TYPES = {
  NATURAL: "natural",
  KQL: "kql"
};

/**
 * Output Formats
 */
const OUTPUT_FORMATS = {
  JSON: "json",
  CSV: "csv",
  TABLE: "table"
};

/**
 * Default Configuration
 */
const DEFAULTS = {
  PORT: 3000,
  HOST: "0.0.0.0",
  LLM_TEMPERATURE: 0.1,
  LLM_MAX_TOKENS: 2000,
  QUERY_TIMEOUT: 30000,
  DEFAULT_LIMIT: 100,
  SCHEMA_CACHE_TTL: 60 // minutes
};

module.exports = {
  KQL_SYSTEM_PROMPT,
  FEW_SHOT_EXAMPLES,
  HTTP_STATUS,
  ERROR_MESSAGES,
  QUERY_TYPES,
  OUTPUT_FORMATS,
  DEFAULTS
};