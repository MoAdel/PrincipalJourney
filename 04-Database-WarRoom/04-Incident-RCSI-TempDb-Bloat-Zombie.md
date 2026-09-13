# Incident 04: The Midnight RCSI TempDB Explosion & Zombie Transactions

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: SQL Server 2022 Enterprise / PostgreSQL 16 (MVCC)  
> **Business Impact**: Disk capacity dropped from 350GB free to 0GB in 4 hours; server shut down due to disk full error; version store frozen  
> **Competencies Mastered**: Multi-Version Concurrency Control (MVCC), Read Committed Snapshot Isolation (RCSI), Version Store Garbage Collection, Zombie Read Transactions

---

## 🚨 1. The 03:00 AM Crisis Briefing

At 03:15 AM, the primary transactional database crashes hard:

```text
[03:15:10] Operating System Error: 112 (There is not enough space on the disk).
[03:15:12] SQL Server Error: 1105: Could not allocate space for object 'sys.sysrsvols' in database 'tempdb' because the 'PRIMARY' filegroup is full.
[03:15:18] Database Engine Emergency Shutdown initiated.
```

The on-call engineer reports:
> *"Our user database is only 40 GB. But `tempdb` grew uncontrollably from 4 GB to 280 GB overnight! We enabled Read Committed Snapshot Isolation (RCSI) two days ago to stop blocking. Did RCSI just eat our entire server disk?!"*

---

## 🔍 2. Diagnostic Investigation

You inspect the version store dynamic management view:

```sql
SELECT 
    transaction_id, 
    transaction_sequence_num, 
    commit_sequence_num, 
    is_snapshot, 
    first_snapshot_sequence_num,
    elapsed_time_seconds
FROM sys.dm_tran_active_snapshot_database_transactions
ORDER BY elapsed_time_seconds DESC;
```

### The Shocking Discovery:
```text
transaction_id: 1048576
transaction_sequence_num: 4812
elapsed_time_seconds: 28,450 seconds (7.9 HOURS!)
program_name: "DataGrip / Analytics Query"
sql_text: "BEGIN TRANSACTION; SELECT COUNT(*) FROM Customers WHERE Status = 'Active'..."
```

### What Happened?
1. At 07:30 PM yesterday, a business intelligence developer opened a manual SQL query window, ran a simple `SELECT COUNT(*)`, and **forgot to type `COMMIT` or close the connection**.
2. Because the transaction was left open with `XSN = 4812`, SQL Server's background version store cleanup thread **could not delete ANY version record newer than 4812**!
3. Over the next 8 hours, the e-commerce system processed 1.2 million order updates.
4. Every single row update created a version record in `tempdb`.
5. `tempdb` expanded continuously until the disk ran out of bytes, crashing the entire database cluster!

---

## ⚙️ 3. Deep Engine Internals: Why it Happened

### The Oldest Active Transaction Rule
In MVCC / RCSI architectures:
* The engine guarantees that any active transaction can read the version of the data that existed when that transaction started.
* If a single transaction has been open for 8 hours, the database **must retain every historical row version created over the last 8 hours**, just in case that 8-hour-old transaction decides to query those rows!
* In PostgreSQL, this same phenomenon prevents `VACUUM` from freezing dead tuples, leading to catastrophic **Table Bloat** and transaction ID wraparound risks.

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

### 1. Automated Zombie Transaction Reaper Script
Deploy an automated watchdog job that monitors active snapshot transactions and terminates any connection idle in transaction for more than 15 minutes:

```sql
-- Automated Zombie Transaction Terminator
DECLARE @KillSpid INT;
DECLARE @ElapsedSec INT;

SELECT TOP 1 
    @KillSpid = session_id, 
    @ElapsedSec = elapsed_time_seconds
FROM sys.dm_tran_active_snapshot_database_transactions
WHERE elapsed_time_seconds > 900 -- 15 Minutes
ORDER BY elapsed_time_seconds DESC;

IF @KillSpid IS NOT NULL
BEGIN
    PRINT CONCAT('Killing Zombie Snapshot Transaction SPID: ', @KillSpid, ' Active for: ', @ElapsedSec, 's');
    EXEC('KILL ' + @KillSpid);
END
```

### 2. Client-Side Driver Timeout Safeguards
In .NET application code:
```csharp
// Program.cs - Enforce strict client-side transaction timeouts
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseNpgsql(connString, npgsqlOptions =>
    {
        // Cancel queries if idle in transaction over 10 seconds
        npgsqlOptions.CommandTimeout(10);
    });
});
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Zombie Transaction) | After (Watchdog & Timeouts) |
|---|---|---|
| **TempDB Storage Consumption** | **280 GB** (Disk Exhaustion) | **2.4 GB (Stable baseline)** |
| **Oldest Active Transaction** | 7.9 Hours (Uncommitted) | **< 30 Seconds** |
| **Server Crash Risk** | 100% (Disk Full Outage) | **0% (Automated Cleanup Guard)** |
| **Version Store Cleanup Latency** | Blocked indefinitely | **Runs continuously every 60s** |

---

## 🛡️ 5. The Socratic Duel

### Question 1 (The Lead DBA):
> *"RCSI caused this disk blowup. Shouldn't we disable RCSI and go back to standard pessimistic locking?"*

**The Principal Defense**:
> *"Disabling RCSI would immediately bring back the lock escalation deadlocks and reader-writer blocking that caused our \$620,000 Cyber Monday outage. The problem here was not the RCSI engine—the problem was an **unbounded, unmonitored human transaction left open for 8 hours**. In high-concurrency systems, transactions must never be left uncommitted. By enforcing automated watchdog termination for idle transactions and separating read-only analytics to a read-replica, we maintain 100% non-blocking OLTP throughput while keeping version store usage under 3 GB."*

---

## 📜 6. The Executive Deliverable: ADR-004

```markdown
# ADR-004: Version Store Governance & Automated Zombie Transaction Termination

## Context
A SEV-1 server crash occurred when an uncommitted 8-hour transaction prevented version store garbage collection, exhausting 280GB of tempdb storage.

## Decision
1. Retain Read Committed Snapshot Isolation (RCSI) as the mandatory concurrency baseline.
2. Deploy an automated watchdog job that kills any snapshot transaction exceeding 15 minutes of idle execution.
3. Route all long-running analytical queries away from the primary OLTP instance to an asynchronous Read Replica.

## Consequences
- **Positive**: Eliminates tempdb disk exhaustion; protects version store garbage collection.
- **Negative**: Unoptimized analytical queries on OLTP will be terminated if they exceed 15 minutes.
```
