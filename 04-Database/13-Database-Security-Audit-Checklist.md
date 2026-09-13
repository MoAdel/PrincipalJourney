# Database Security & Performance Release Checklist

> **The Principal Production Go/No-Go Release Gate**  
> 10 Mandatory Pillars before deploying relational database schemas and queries to Production.

---

## 📋 The 10 Production Pillars

### 1. Identity & Least Privilege Access
- [ ] Application connects via a dedicated non-privileged user (e.g., `app_order_svc`).
- [ ] Direct `sa`, `postgres`, `sysadmin`, or `rds_superuser` credentials are **strictly prohibited** in application connection strings.
- [ ] Database user is granted only `SELECT`, `INSERT`, `UPDATE`, `DELETE` on specific application schemas.
- [ ] `DDL` operations (`CREATE TABLE`, `DROP`, `ALTER`) are restricted to automated migration pipelines (`dotnet ef migrations bundle`).

### 2. Injection Defense & Parameterization
- [ ] 100% of queries use strongly typed parameters. Zero raw string interpolation (`$"SELECT ... WHERE Id = {userInput}"`) in `FromSqlRaw` or Dapper.
- [ ] Formattable strings in EF Core use `FromSqlInterpolated` (which safely maps interpolated holes to `DbParameter` objects).
- [ ] High-risk dynamic filters use approved query builders or parameterized dynamic predicates.

### 3. Encryption in Transit & At Rest
- [ ] Connection string specifies `Encrypt=True;TrustServerCertificate=False;` to mandate TLS certificate verification.
- [ ] Transparent Data Encryption (TDE) enabled on data and transaction log storage.
- [ ] Customer Managed Keys (CMK) configured in Azure Key Vault / AWS KMS with automated key rotation.

### 4. Concurrency & Isolation Baseline
- [ ] Database has **Read Committed Snapshot Isolation (RCSI)** enabled (SQL Server) or is verified under **PostgreSQL MVCC**.
- [ ] Verified that readers do not acquire Shared locks that block writers.
- [ ] Transactions are kept strictly under **15 milliseconds** in execution time.
- [ ] Zero external network calls (HTTP, Kafka, gRPC, Email) executed within open database transactions.

### 5. Indexing & Plan Health Audit
- [ ] Every foreign key column has a supporting non-clustered index (prevents full-table scans during cascading checks).
- [ ] Top 20 high-frequency queries achieve a **100% Index Seek** (Zero Clustered Scans).
- [ ] Composite indexes adhere strictly to the **Equality-First, Range-Last** column ordering rule.
- [ ] High-frequency read queries use **Covering Indexes (`INCLUDE`)** to eliminate Key Lookups.
- [ ] Zero execution plans show **Sort Spills** or **Hash Match Spills** into `tempdb`.

### 6. Primary Key & Page Architecture
- [ ] Clustered Primary Keys are **Monotonically Increasing** (`BIGINT IDENTITY` or .NET 9 `UUIDv7`).
- [ ] Random `Guid.NewGuid()` (UUIDv4) is **strictly forbidden** as a clustered key.
- [ ] Tables with frequent random inserts have Fill Factor tuned to 85–90% to avoid mid-page splits.

### 7. Connection Pool Guardrails
- [ ] `MaxPoolSize` explicitly configured (defaulting between 50 and 100 per pod).
- [ ] Connection timeout configured to a strict **5 seconds** (prevents thread pool queue saturation).
- [ ] All database connections wrapped in `await using` blocks or managed by scoped DI lifecycles.

### 8. Batch Mutation & Archival Guardrails
- [ ] Bulk updates and deletions are batched in chunks of **$\le 2,500$ rows** to prevent Lock Escalation.
- [ ] Historical audit tables exceeding 50 million rows implement **Range Partitioning with Sliding Window switching**.

### 9. Auditing, CDC & Slow Query Telemetry
- [ ] Slow query logging enabled for statements executing longer than **250 milliseconds**.
- [ ] Change Data Capture (CDC) or audit triggers track critical balance updates and permission modifications.
- [ ] Telemetry correlation: Application passes W3C `TraceId` in `Application Name` or `sp_set_session_context`.

### 10. Disaster Recovery Verification (RPO & RTO)
- [ ] Recovery Point Objective (RPO) verified: Transaction log backups executing every **5 minutes** (Max data loss: 5m).
- [ ] Recovery Time Objective (RTO) verified: Point-in-time restore automated and tested in disaster recovery drills.
