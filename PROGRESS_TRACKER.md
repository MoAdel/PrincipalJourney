# Principal Software Engineer Journey — Progress Tracker

> "Discipline is choosing between what you want now and what you want most."

---

## 🎯 12-Sprint Journey Overview & Status

| Sprint | Theme | Target Duration | Status | Completion Score | Key Focus & Milestones |
|---|---|---|---|---|---|
| **01** | **Production-Ready Web API** | Week 1 (7 Days) | ✅ **COMPLETED** | 100% | Clean Architecture, Lifetimes, Logging, ProblemDetails, Keyset Pagination, SocketsHttpHandler, Probes |
| **02** | **Authentication & Security** | Week 2 (7 Days) | ✅ **COMPLETED** | 100% | OAuth2/OIDC, PKCE, JWT Crypto, Policy/Resource Auth, Session Versioning, Dual-Rail Real-Time, RFC 6238 TOTP, Data Protection, OWASP Top 10 |
| **03** | **Storage & Streaming** | Week 3 (7 Days) | ✅ **COMPLETED** | 100% | Blob Storage, System.IO.Pipelines, Chunked Uploads, Range Streaming, SAS Tokens, Edge Caching |
| **04** | **Database Performance** | Week 4 (7 Days) | ✅ **COMPLETED** | 100% | Execution Plans, Index Seek/Scan, B-Tree Pages, RCSI/MVCC, Deadlocks, Connection Pools, EF Core 9, Dapper |
| **05** | **Concurrency & .NET Runtime** | Week 5 (7 Days) | ✅ **COMPLETED** | 100% | GC Internals (Gen 0/1/2/LOH/POH), ThreadPool Starvation, Async State Machines, dotnet-dump, Lock-free |
| **06** | **Messaging & Background Processing**| Week 6 (7 Days) | 🚀 **NEXT UP** | 0% | Outbox Pattern, Saga Orchestration, MassTransit, DLQ, Idempotent Consumers, System.Threading.Channels |
| **07** | **Distributed Systems Architecture**| Week 7 (7 Days) | ⬜ PENDING | 0% | CAP / PACELC, Distributed Caching (Redis), Cache Stampede, Redlock, Eventual Consistency, Rate Limiting |
| **08** | **Cloud Native Azure Architecture** | Week 8 (7 Days) | ⬜ PENDING | 0% | Azure Container Apps, APIM AI Gateway, Front Door, Private Endpoints, Bicep IaC, FinOps Cost Modeling |
| **09** | **Advanced Observability & Telemetry**| Week 9 (7 Days) | ⬜ PENDING | 0% | OpenTelemetry SDK, ActivitySource Tracing, System.Diagnostics.Metrics, SLI/SLO Budgets, Grafana/Prometheus |
| **10** | **Large-Scale System Design** | Week 10 (7 Days) | ⬜ PENDING | 0% | Global E-Commerce, 500k RPS Ingestion, Notification Platform, Capacity Estimation, ADRs |
| **11** | **Principal Architecture Review** | Week 11 (7 Days) | ⬜ PENDING | 0% | Architecture Review Board (ARB), RFC Evaluation, Tech Debt Valuation, Standards Governance, Guilds |
| **12** | **Principal Mock Interview & Defense**| Week 12 (7 Days) | ⬜ PENDING | 0% | Staff/Principal System Design Mock Defense, Failure Triage Defense, CTO Behavioral Defense, Capstone |

---

## 🖥️ Interactive HTML Dashboard

An interactive, dark-mode, zero-dependency dashboard is available at [`dashboard.html`](dashboard.html).

### Features:
- **Real-Time Progress Tracking**: Check off topics and watch the overall completion percentage and sprint counters update dynamically.
- **Local Persistence (`localStorage`)**: Your checkmarks, streak, and journal notes remain saved in your browser across sessions.
- **JSON Export & Backup**: Export your journey progress as JSON anytime or import previous states.
- **Daily Reflection Journal**: Record daily architectural insights, trade-offs discovered, and lab notes.

---

## 📅 Daily Study Formula (330 min / 5.5 hours)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Theory & Specifications (90 min)                         │
│    • Deep read of RFCs, Microsoft Learn, and architectural docs │
├─────────────────────────────────────────────────────────────┤
│ 2. Implementation & Hands-On Labs (120 min)                 │
│    • Build the lab, write architecture tests, verify code   │
├─────────────────────────────────────────────────────────────┤
│ 3. Runtime Internals & Deep Dive (60 min)                   │
│    • Inspect source code, GC allocations, and thread pools  │
├─────────────────────────────────────────────────────────────┤
│ 4. One-Page Architecture Summary (30 min)                   │
│    • Synthesize trade-offs, decision criteria, failure modes│
├─────────────────────────────────────────────────────────────┤
│ 5. Daily Self-Review & Journaling (30 min)                  │
│    • Answer Principal Defense Questions and log reflections │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Sprint Milestones Summary

### Sprint 01: Production-Ready Web API
- **Status**: ✅ Completed
- **Deliverables**: 27 complete chapters, 8 hands-on architecture labs, SEV-1 production post-mortem, Principal defense Q&A, and authoritative reference library.
- **Key Takeaway**: A Principal Engineer does not just make code work; they protect business invariants, eliminate hot-path allocations, prevent socket starvation, and design failure-safe error boundaries.

### Sprint 02: Authentication & Security Architecture
- **Status**: ✅ Completed
- **Deliverables**: 27 complete modules, OAuth2/OIDC PKCE flows, asymmetric JWT verification (RS256/ES256), imperative resource-based authorization (Anti-BOLA/IDOR), refresh token family replay defense, monotonic `sessionVersion` instant multi-device invalidation, Dual-Rail Web/API + WebSocket/SignalR security, RFC 6238/4226 TOTP mathematical engine, direct credential defense & constant-time protection, distributed Data Protection Key Ring, CORS origin isolation, and OWASP API Top 10 systematic mitigations.
- **Key Takeaway**: Authentication verifies identity; authorization verifies resource ownership. Security boundaries must never rely on client trust.

### Sprint 03: Storage & Streaming Architecture
- **Status**: ✅ Completed
- **Deliverables**: 18 complete modules, Direct Client-to-Storage upload delegation with User Delegation SAS, zero-allocation streaming with `System.IO.Pipelines`, Resumable chunked block uploads, HTTP 206 Partial Content range requests for video scrubbing, and CDN edge caching with automated 4-tier lifecycle rules.
- **Key Takeaway**: The fastest and most scalable storage system is one where application servers are completely removed from the heavy binary transfer path.

### Sprint 04: Database Performance & Relational Internals
- **Status**: ✅ Completed
- **Deliverables**: 23 complete modules in standard track + 5 SEV-1 incident post-mortems in War Room track (`04-Database-WarRoom/`). Deep coverage of SQL Server & PostgreSQL Query Optimizer internals, B-Tree physical 8KB page layout, RCSI/MVCC version store mechanics, lock escalation thresholds, deadlock graphs, connection pool starvation, EF Core 9 compiled models, split queries, and high-speed Dapper streaming.
- **Key Takeaway**: Relational databases are physical memory caches managing 8KB pages backed by an append-only transaction log. A Principal Engineer does not guess; they read execution plans, eliminate sort spills, enforce non-blocking reader-writer isolation, and size connection pools against hardware thread limits.

### Sprint 05: Concurrency, Threading & .NET Runtime Internals
- **Status**: ✅ Completed
- **Deliverables**: 24 complete modules in standard track + 5 SEV-1 incident post-mortems in War Room track (`05-Concurrency-WarRoom/`). Deep coverage of modern .NET 9 CLR internals: asynchronous state machine struct decompilation, ThreadPool work-stealing deques, Hill Climbing algorithm, IOCP vs Worker threads, CPU cache line false sharing (64-byte padding), Gen 0/1/2 Garbage Collection with .NET 9 DATAS, Large Object Heap (LOH) hygiene with `ArrayPool<byte>.Shared`, and lock-free CAS primitives (`Interlocked`).
- **Key Takeaway**: Concurrency is not about syntax keywords; it is about the physical machine. A Principal Engineer does not block ThreadPool threads, avoids LOH fragmentation, pads hot multi-core counters to 64 bytes, and bounds every queue with backpressure.


