# Sprint 04 — Database Performance: The War Room Edition

> **High-Intensity SEV-1 Incident Simulation Track**  
> 5 Production Disasters. 5 Post-Mortems. Real Crash Traces. Instant Refactorings.  
> **Pre-requisite**: Complete the standard curriculum in [`04-Database/`](../04-Database/)

---

## 🎯 The War Room Philosophy

In the standard curriculum, you studied relational database internals systematically.
In this **War Room Track**, you are thrown directly onto the bridge of an active SEV-1 production disaster at Nova Commerce.

You have 60 minutes before leadership pulls the plug:
1. **The 03:00 AM Crisis Briefing**: Real database alerts, error logs, and metrics.
2. **Diagnostic Investigation**: Spot the physical flaw in raw SQL, execution plans, and C# code.
3. **Deep Engine Internals**: Why the database engine physically behaved this way (Page structures, B-Trees, Lock managers, Version stores).
4. **The Architecture Refactor & Scoreboard**: Production-grade code fix with measurable telemetry improvements.
5. **The Socratic Duel**: 3 aggressive questions from DBAs, SRE leads, or the CTO defending your architecture.
6. **The Executive Deliverable**: An Architecture Decision Record (ADR) for your Principal portfolio.

---

## 🗺️ Incident Mapping Matrix

| Incident | Crisis & Symptoms | Engine Internals Mastered | Standard Modules |
|---|---|---|---|
| 🚨 **[Incident 01](01-Incident-TempDb-Sort-Spill.md)** | **The 20M-Row TempDB Sort Spill**: Query CPU 100%, disk write IOPS exhausted, 45s query latency | Cost-Based Optimizer, Cardinality mismatch, Memory Grants, Sort Spills | Modules 05, 05A, 06 |
| 🚨 **[Incident 02](02-Incident-Lock-Escalation-Deadlock-Storm.md)** | **The Lock Escalation Avalanche**: Background job updates 6,200 rows, locks entire table, deadlocks checkout | Lock Escalation thresholds, Deadlock Graphs, Deterministic ordering, `UPDLOCK` | Modules 07, 08 |
| 🚨 **[Incident 03](03-Incident-Connection-Pool-Blackout.md)** | **The 800-Connection Starvation**: Sockets maxed out, 504 Gateway Timeouts, thread pool starvation | ADO.NET/Npgsql pooling, Connection leaks, HTTP calls in transactions | Module 09 |
| 🚨 **[Incident 04](04-Incident-RCSI-TempDb-Bloat-Zombie.md)** | **The RCSI Zombie Transaction**: 200GB `tempdb` version store blowup, 14-byte page split cascade | MVCC Version Store, In-heap tuples, Ghost cleanup, Uncommitted read leaks | Modules 06A, 07A |
| 🚨 **[Incident 05](05-Incident-EFCore-Cartesian-Explosion.md)** | **The Cartesian Explosion & Monolith Lag**: 100,000 duplicated rows over wire, 15s cold starts | EF Core Split Queries, Compiled Models, Dapper Streaming, Postgres Binary COPY | Modules 10, 11, 12 |
