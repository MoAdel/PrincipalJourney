# Resources — Curated Database Performance Literature & Tooling

> **Authoritative Literature, Internal Specifications & Diagnostic Tooling**  
> Essential reading and tools for the Principal Data Architect.

---

## 📚 Essential Books

1. **Database Internals: A Deep Dive into How Distributed Data Systems Work** — *Alex Petrov*  
   The definitive guide to B-Trees, LSM-Trees, storage engines, buffer pool managers, and write-ahead logging.
2. **SQL Server Internals: In-Memory OLTP & Storage Engine Architecture** — *Kalen Delaney*  
   Mastery of SQL Server 8KB pages, allocation maps (PFS, GAM, SGAM), and lock managers.
3. **PostgreSQL 16 High Performance** — *Gregory Smith, Ibrar Ahmed*  
   Deep dive into MVCC, autovacuum tuning, WAL write caching, and `pg_stat_statements`.
4. **Designing Data-Intensive Applications** — *Martin Kleppmann*  
   Chapters 3 & 7: Storage & Retrieval, and Transactions & Concurrency Control.

---

## 🔬 Diagnostic Tools & DMVs

### SQL Server Diagnostic DMVs:
```sql
-- Top Queries by CPU / Physical Read
SELECT TOP 20 
    qs.total_worker_time / qs.execution_count AS AvgCpuTime,
    qs.total_logical_reads / qs.execution_count AS AvgLogicalReads,
    SUBSTRING(st.text, (qs.statement_start_offset/2)+1, 
        ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text) 
         ELSE qs.statement_end_offset END - qs.statement_start_offset)/2) + 1) AS QueryText
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
ORDER BY AvgLogicalReads DESC;

-- Active Locks & Blocking Chains
SELECT 
    r.session_id, r.blocking_session_id, r.wait_type, r.wait_time,
    t.text AS QueryText
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.blocking_session_id <> 0;
```

### PostgreSQL Diagnostic Views:
```sql
-- Top Slow Queries in PostgreSQL
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- Dead Tuples and Table Bloat
SELECT relname, n_live_tup, n_dead_tup, 
       ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS DeadTuplePct
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

---

## 🛠️ Benchmark & Profiling Tooling

* **BenchmarkDotNet**: Benchmarking EF Core vs Dapper vs ADO.NET micro-benchmarks.
* **k6 / wrk**: High-concurrency load testing against database-backed HTTP endpoints.
* **MiniProfiler**: Lightweight inline profiling for .NET Web APIs showing exact SQL query timings.
* **Sentry / OpenTelemetry SQL Instrumentation**: Capturing distributed database traces with `db.system` and `db.statement`.
