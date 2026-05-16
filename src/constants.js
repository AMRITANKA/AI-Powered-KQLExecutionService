/**
 * KQL Query Generation Constants
 */

const KQL_SYSTEM_PROMPT = `You are an expert in Azure Application Insights and Kusto Query Language (KQL).
You generate accurate, efficient, production-safe KQL queries for Azure Application Insights workspaces.

## OBJECTIVE
Generate accurate KQL queries using best practices, with:
- Cost-aware optimization (minimize data scanned, avoid full-table reads)
- Proper timestamp filtering on every query
- Correct schema usage (App Insight tables and columns)
- Obeservability patterns (error rates, latency percentiles, SLA availability, distributed tracing joins)
- Guardrails to prevent expensive or inefficient queries

## AZURE APPLICATION INSIGHTS CONTEXT

You are querying an Azure Application Insights instance. The available tables and their purpose are:

| Table                  | Purpose                                                       |
|------------------------|---------------------------------------------------------------|
| requests               | HTTP requests received by the application (server-side)       |
| dependencies           | Outbound calls made by the app (HTTP, SQL, storage, queues)   |
| exceptions             | Unhandled and handled exceptions thrown by the application    |
| traces                 | Log/trace messages written via SDK (ILogger, TrackTrace)      |
| customEvents           | Custom business events tracked via TrackEvent()               |
| customMetrics          | Custom numeric measurements tracked via TrackMetric()         |
| availabilityResults    | Results from URL ping / multi-step availability tests         |
| pageViews              | Page load events from browser-side JavaScript SDK             |
| browserTimings         | Detailed browser-side page load performance metrics           |
| performanceCounters    | Server performance counters (CPU, memory, request rate)       |
| resources              | Azure resource metadata associated with the workspace         |

## UNIVERSAL APP INSIGHTS COLUMNS(available in all tables)

Every table contains these standard columns — always prefer them for filtering and correlation:

- timestamp (datetime) — when the event was recorded; always use this for time filters
- itemId (string) — unique identifier for each telemetry item
- itemType (string) — telemetry type (request, dependency, exception, etc.)
- appName (string) — application name
- appId (string) — Application Insights resource ID
- sdkVersion (string) — SDK version that generated the telemetry
- operation_Id (string) — distributed trace / correlation ID (links requests -> dependencies -> exceptions)
- operation_ParentId (string) — parent span ID for distributed tracing
- operation_Name (string) — logical operation name (e.g., "GET /api/users")
- session_Id (string) — user session identifier
- user_Id (string) — anonymous user ID
- user_AuthenticatedId (string) — authenticated user identity
- client_City / client_CountryOrRegion / client_IP (string) — geo-location
- cloud_RoleName (string) — microservice / component name
- cloud_RoleInstance (string) — server/container instance name

## TABLE-SPECIFIC KEY COLUMNS
### requests: id, name, url, resultCode (string), success (bool), duration (real, milliseconds),performanceBucket (string), source (string)
### dependencies: id, name, type (string: "HTTP"|"SQL"|"Azure blob"|"Azure queue"|etc.),target (string), data (string — SQL query or URL), duration (real),resultCode (string), success (bool), performanceBucket (string)
### exceptions: problemId (string), type (string — exception class), method (string),assembly (string), message (string — SHORT summary only), severityLevel (int 0-4),details (dynamic — FULL stack trace array, ALWAYS use for searching exception content), handledAt (string),innermostType / innermostMessage / innermostMethod (string)
### traces: message (string), severityLevel (int: 0=Verbose 1=Information 2=Warning 3=Error 4=Critical),customDimensions (dynamic), customMeasurements (dynamic)
### customEvents: name (string — event name), customDimensions (dynamic), customMeasurements (dynamic)
### customMetrics: name (string — metric name), value (real), valueSum / valueCount / valueMin / valueMax (real),customDimensions (dynamic)
### availabilityResults: name (string — test name), location (string), success (bool), duration (real),message (string), runLocation (string), size (real)
### pageViews: name (string — page title), url (string), duration (real), performanceBucket (string),customDimensions (dynamic)
### browserTimings: name (string), url (string), totalDuration (real), networkDuration (real),sendDuration (real), receiveDuration (real), processingDuration (real)
### performanceCounters: name (string), category (string), counter (string), instance (string), value (real)


## AUTO-OPTIMIZATION RULES (MANDATORY)

1. Always filter by timestamp first — before any join or summarize
2. Filter BEFORE join or summarize to reduce data early
3. Use project to limit columns immediately after filtering
4. Prefer aggregations over raw row returns
5. Limit result size with take 100 if no summarize is present
6. Avoid unfiltered table scans — every query must have at least one where clause
7. Join only on operation_Id — never join on dynamic or high-cardinality columns
8. Use time binning with bin(timestamp, Xm) for time-series results
9. Parse dynamic fields safely: tostring(customDimensions["key"]), toint(...), etc.
10. Use meaningful column aliases with extend or project-rename for readability

## BUILT-IN OBSERVABILITY PATTERNS
### Error Rate
requests
| where timestamp > ago(1h)
| summarize Total = count(), Failures = countif(success == false)
| extend FailureRate = Failures * 100.0 / Total
| order by FailureRate desc

### P95 Latency by Endpoint
requests
| where timestamp > ago(1h)
| summarize P50 = percentile(duration, 50), P95 = percentile(duration, 95), P99 = percentile(duration, 99), by name
| order by P95 desc

### SLA Availability %
requests
| where timestamp > ago(24h)
| summarize Total = count(), Failed = countif(success == false)
| extend AvailabilityPct = (Total - Failed) * 100.0 / Total
| order by AvailabilityPct asc

### End-to-End Trace (Request + Dependency + Exception)
requests
| where timestamp > ago(1h)
| join kind=leftouter (deppendencies | where timestamp > ago(1h) on operation_Id
| join kind=leftouter (exceptions | where timestamp > ago(1h) on operation_Id
| project timestamp, requestName = name, url, dependencyName = dependencies.name, exceptionType = exceptions.type, exceptionMessage = exceptions.outerMessage
| order by timestamp desc
| take 100


## CRITICAL KQL RULES
- ALWAYS use timestamp, NEVER use TimeGenerated
- JOIN conditions must use and only: Table1 | join Table2 on Col1 and Col2
- NEVER use or in join conditions
- Join on operation_Id for cross-table correlation, never on dynamic or high-cardinality columns
- Use percentile() or percentiles() for duration analysis, not just avg()
- Dynamic columns: customDimension["key"] must be accessed with tostring() or toint() to avoid type issues
- Null safety: isnotnull(col), iff(isnull(val),default, val)
- FOR exceptions table: ALWAYS use details column for searching error text, NEVER use message


## GUARDRAILS

- NEVER generate a query without a timestamp filter
- NEVER scan full tables without at least one where filter
- NEVER return unnecessary columns — always use project
- ALWAYS default to ago(1h) if the user does not specify a time range
- ALWAYS choose the most relevant table when intent is ambiguous
- NEVER use TimeGenerated — App Insights uses timestamp


## OUTPUT FORMAT:
Return ONLY the KQL query, nothing else. No explanations, no markdown, just the query.`;

/**
 * Full list of App Insights tables for table detection
 */
const APP_INSIGHTS_TABLES = [
  'requests',
  'dependencies',
  'exceptions',
  'traces',
  'customEvents',
  'customMetrics',
  'availabilityResults',
  'pageViews',
  'browserTimings',
  'performanceCounters',
  'resources'
];

/**
 * Semantic column deecriptions for enriching LLM schema context
 */
const APP_INSIGHTS_COLUMN_DESCRIPTIONS = {
  requests: {
    resultCode: "HTTP status code string e.g. '200', '404', '500'",
    success: "true if resultCode < 400",
    duration: "Server processing time in milliseconds",
    performanceBucket: "Latency bucket e.g. '<250ms', '250ms-500ms', '>5s'",
    name: "Route template e.g. 'GET /api/users/{id}'"
  },

  dependencies: {
    type: "Dependency kind: 'HTTP', 'SQL', 'Azure blob', 'Azure queue', 'Azure table'",
    target: "Dependency host/server name",
    data: "SQL command text or full HTTP URL",
    name: "SQL stored procedure name or HTTP verb+path"
  },

  exceptions: {
    severityLevel: "0=Verbose 1=Information 2=Warning 3=Error 4=Critical",
    problemId: "Fingerprint of the exception (type + method) for grouping",
    handledAt: "'UserCode' if caught, 'Platform' if unhandled",
    details: "MUST USE for searching exception content. Dynamic array of stack frames — contains FULL error text. Use: where details contains \"keyword\" (NEVER use message for searching)",
    message: "Short summary only — do NOT use for searching error content, use details column instead"
  },

  traces: {
    severityLevel: "0=Verbose 1=Information 2=Warning 3=Error 4=Critical",
    message: "Log message string",
    customDimensions: "Key-value property bag — access with tostring(customDimensions['key'])"
  },

  availabilityResults: {
    success: "true if the availability test passed",
    location: "Azure region where the test ran e.g. 'East US', 'West Europe'",
    duration: "Round-trip time in milliseconds"
  },

  performanceCounters: {
    counter: "Counter name e.g. '% Processor Time', 'Available MBytes', 'Requests/Sec'",
    category: "Performance category e.g. 'Processor', 'Memory', 'ASP.NET Applications'"
  }
};


/**
 * Intent classification pattern for few-shot filtering
 */
const INTENT_PATTERNS = {
  performance: /slow|latency|p95|p99|percentile|duration|response time/i,
  errors: /error|fail|exception|crash|broken|4\d\d|5\d\d/i,
  availability: /uptime|availability|ping|health|sla|down/i,
  usage: /usage|session|page view|visit|traffic|count/i,
  tracing: /trace|log|correlate|operation|distributed/i,
  infrastructure: /cpu|memory|server|resource|instance|counter/i,
  general: /show|list|find|get|count|summarize/i
};

/**
 * Few-shot learning examples for KQL generation (App Insights tables only)
 */
const FEW_SHOT_EXAMPLES = [
  {
    description: "Show failed HTTP requests in the last hour",
    schema: {
      table: "requests",
      columns: {
        timestamp: { data_type: "datetime" },
        name: { data_type: "string" },
        url: { data_type: "string" },
        resultCode: { data_type: "string" },
        success: { data_type: "bool" },
        duration: { data_type: "real" },
        operation_Id: { data_type: "string" },
        cloud_RoleName: { data_type: "string" }
      }
    },
    query: `requests
| where timestamp > ago(1h)
| where success == false
| project timestamp, name, url, resultCode, duration, operation_Id, cloud_RoleName
| order by timestamp desc
| take 100`
  },
  {
    description: "P50, P95, P99 response time for each endpoint in the last 24 hours",
    schema: {
      table: "requests",
      columns: {
        timestamp: { data_type: "datetime" },
        name: { data_type: "string" },
        duration: { data_type: "real" },
        success: { data_type: "bool" }
      }
    },
    query: `requests
| where timestamp > ago(24h)
| summarize
    RequestCount = count(),
    FailureRate = countif(success == false) * 100.0 / count(),
    P50 = percentile(duration, 50),
    P95 = percentile(duration, 95),
    P99 = percentile(duration, 99)
  by name
| order by P95 desc`
  },
  {
    description: "Show slow outbound dependency calls over 500ms in the last 6 hours",
    schema: {
      table: "dependencies",
      columns: {
        timestamp: { data_type: "datetime" },
        name: { data_type: "string" },
        type: { data_type: "string" },
        target: { data_type: "string" },
        duration: { data_type: "real" },
        success: { data_type: "bool" },
        resultCode: { data_type: "string" },
        operation_Id: { data_type: "string" }
      }
    },
    query: `dependencies
| where timestamp > ago(6h)
| where duration > 500
| project timestamp, name, type, target, duration, success, resultCode, operation_Id
| order by duration desc
| take 50`
  },
  {
    description: "Top 10 most frequent exceptions in the last 24 hours",
    schema: {
      table: "exceptions",
      columns: {
        timestamp: { data_type: "datetime" },
        type: { data_type: "string" },
        problemId: { data_type: "string" },
        outerMessage: { data_type: "string" },
        severityLevel: { data_type: "int" },
        cloud_RoleName: { data_type: "string" }
      }
    },
    query: `exceptions
| where timestamp > ago(24h)
| summarize OccurrenceCount = count(), LastSeen = max(timestamp)
  by type, problemId, outerMessage, cloud_RoleName
| top 10 by OccurrenceCount desc`
  },
  {
    description: "Count database connection failures in the last 7 days",
    schema: {
      table: "exceptions",
      columns: {
        timestamp: { data_type: "datetime" },
        details: { data_type: "dynamic" }
      }
    },
    query: `exceptions
| where timestamp > ago(7d)
| where details contains "database"
| summarize ExceptionCount = count()`
  },
  {
    description: "Show error and critical log messages in the last 2 hours",
    schema: {
      table: "traces",
      columns: {
        timestamp: { data_type: "datetime" },
        message: { data_type: "string" },
        severityLevel: { data_type: "int" },
        customDimensions: { data_type: "dynamic" },
        operation_Id: { data_type: "string" },
        cloud_RoleName: { data_type: "string" }
      }
    },
    query: `traces
| where timestamp > ago(2h)
| where severityLevel >= 3
| order by timestamp desc
| take 200`
  },
  {
    description: "Availability test failure rate per location in the last 24 hours",
    schema: {
      table: "availabilityResults",
      columns: {
        timestamp: { data_type: "datetime" },
        name: { data_type: "string" },
        location: { data_type: "string" },
        success: { data_type: "bool" },
        duration: { data_type: "real" },
        message: { data_type: "string" }
      }
    },
    query: `availabilityResults
| where timestamp > ago(24h)
| summarize Total = count(), Failed = countif(success == false), AvgDuration = avg(duration)
  by name, location
| extend AvailabilityPct = (Total - Failed) * 100.0 / Total
| order by AvailabilityPct asc`
  },
  {
    description: "CPU and memory usage per server instance in the last hour",
    schema: {
      table: "performanceCounters",
      columns: {
        timestamp: { data_type: "datetime" },
        counter: { data_type: "string" },
        value: { data_type: "real" },
        cloud_RoleInstance: { data_type: "string" }
      }
    },
    query: `performanceCounters
  | where timestamp > ago(1h)
  | where counter in ("% Processor Time", "Available MBytes")
  | summarize AvgValue = avg(value) by counter, cloud_RoleInstance, bin(timestamp, 5m)
  | order by timestamp asc`
  },
  {
    description: "Correlate exceptions with the originating request using operation_Id",
    schema: {
      table1: "requests",
      columns1: {
        timestamp: { data_type: "datetime" },
        name: { data_type: "string" },
        url: { data_type: "string" },
        operation_Id: { data_type: "string" }
      },
      table2: "exceptions",
      columns2: {
        timestamp: { data_type: "datetime" },
        type: { data_type: "string" },
        outerMessage: { data_type: "string" },
        operation_Id: { data_type: "string" }
      }
    },
    query: `requests
  | where timestamp > ago(1h)
  | join kind=inner (
        exceptions
          | where timestamp > ago(1h)
          | project exceptionType = type, exceptionMessage = outerMessage, operation_Id
          ) on operation_Id
  | project timestamp, requestName = name, url, exceptionType, exceptionMessage, operation_Id
  | order by timestamp desc
  | take 100`
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
  APP_INSIGHTS_TABLES,
  APP_INSIGHTS_COLUMN_DESCRIPTIONS,
  INTENT_PATTERNS,
  HTTP_STATUS,
  ERROR_MESSAGES,
  QUERY_TYPES,
  OUTPUT_FORMATS,
  DEFAULTS
};