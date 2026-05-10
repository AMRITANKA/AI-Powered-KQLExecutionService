AI-Powered KQL Query Execution with Natural Language to KQL (NL2KQL) Conversion and Execution


 Features
execute_kql_query:

Natural Language to KQL: Generate KQL queries from natural language descriptions.
Direct KQL Execution: Execute raw KQL queries.
Multiple Output Formats: Supports JSON, CSV, and table formats.
Strict Schema Validation: Uses discovered schema memory and validation before execution.
Schema-Grounded Repair: Repairs invalid columns only when a valid table schema can prove the replacement.
schema_memory:

Schema Discovery: Discover and cache schemas for tables.
Database Exploration: List all tables within a database.
AI Context: Get ranked CAG context for tables, with optional table-scoped strict schema output.
Analysis Reports: Generate reports with visualizations.
Cache Management: Clear or refresh the schema cache.
Memory Statistics: Get statistics about the memory usage.

# System prompt with KQL expertise
KQL_SYSTEM_PROMPT = """You are an expert in Kusto Query Language (KQL). You generate accurate, efficient KQL queries.

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
Return ONLY the KQL query, nothing else. No explanations, no markdown, just the query."""




# Few-shot learning examples
FEW_SHOT_EXAMPLES = [
    {
        "description": "Show recent failed login attempts",
        "schema": {
            "table": "SigninLogs",
            "columns": {
                "TimeGenerated": {"data_type": "datetime"},
                "UserPrincipalName": {"data_type": "string"},
                "ResultType": {"data_type": "string"},
                "ResultDescription": {"data_type": "string"},
                "IPAddress": {"data_type": "string"},
                "Location": {"data_type": "string"}
            }
        },
        "query": "SigninLogs | where ResultType != '0' | where TimeGenerated > ago(1h) | project TimeGenerated, UserPrincipalName, ResultDescription, IPAddress, Location | take 100"
    },
    {
        "description": "Count events by severity in the last 24 hours",
        "schema": {
            "table": "SecurityEvent",
            "columns": {
                "TimeGenerated": {"data_type": "datetime"},
                "EventID": {"data_type": "int"},
                "Level": {"data_type": "string"},
                "Computer": {"data_type": "string"},
                "Account": {"data_type": "string"}
            }
        },
        "query": "SecurityEvent | where TimeGenerated > ago(24h) | summarize Count=count() by Level | order by Count desc"
    },
    {
        "description": "Find top 10 users by activity",
        "schema": {
            "table": "AuditLogs",
            "columns": {
                "TimeGenerated": {"data_type": "datetime"},
                "OperationName": {"data_type": "string"},
                "InitiatedBy": {"data_type": "string"},
                "TargetResources": {"data_type": "dynamic"},
                "Result": {"data_type": "string"}
            }
        },
        "query": "AuditLogs | summarize ActivityCount=count() by InitiatedBy | top 10 by ActivityCount desc"
    },
    {
        "description": "Join two tables to correlate data",
        "schema": {
            "table1": "Alerts",
            "columns1": {
                "AlertId": {"data_type": "string"},
                "Severity": {"data_type": "string"},
                "DeviceId": {"data_type": "string"},
                "TimeGenerated": {"data_type": "datetime"}
            },
            "table2": "Devices",
            "columns2": {
                "DeviceId": {"data_type": "string"},
                "DeviceName": {"data_type": "string"},
                "OSPlatform": {"data_type": "string"}
            }
        },
        "query": "Alerts | join kind=inner Devices on DeviceId | project TimeGenerated, AlertId, Severity, DeviceName, OSPlatform | take 50"
    }
]

