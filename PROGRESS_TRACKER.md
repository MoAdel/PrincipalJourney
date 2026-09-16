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
| **06** | **Messaging & Background Processing**| Week 6 (7 Days) | 🚀 **READY FOR STUDY** | 100% | Outbox Pattern, Saga Orchestration, MassTransit, DLQ, Idempotent Consumers, System.Threading.Channels |
| **07** | **Distributed Systems Architecture**| Week 7 (7 Days) | 🚀 **READY FOR STUDY** | 100% | CAP / PACELC, Consensus (Raft/Paxos), Redis Engine Internals, XFetch Stampede Prevention, Redlock, CRDTs |
| **08** | **Cloud Native Azure Architecture** | Week 8 (7 Days) | 🚀 **READY FOR STUDY** | 100% | Hub-Spoke VNet, ACA, KEDA & Envoy, Azure Functions v4 Isolated, DTFx, APIM, Front Door, Private Endpoints, Bicep, FinOps |
| **09** | **Advanced Observability & Telemetry**| Week 9 (7 Days) | 🚀 **READY FOR STUDY** | 100% | OpenTelemetry SDK, W3C Distributed Tracing, ActivitySource, System.Diagnostics.Metrics, Tail Sampling, Multi-Burn Alerts |
| **10** | **Large-Scale System Design** | Week 10 (7 Days) | 🚀 **READY FOR STUDY** | 100% | Capacity Modeling, Sharding & Consistent Hashing, 2PC vs Sagas, Caching, E-Commerce, 500k RPS Ingestion, ADRs |
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

### Sprint 06: Messaging & Background Processing Architecture
- **Status**: 🚀 **READY FOR STUDY** (Fully Scaffolded & Formally Verified)
- **Deliverables**: 23 complete modules in `06-Messaging/` covering the Transactional Outbox pattern with `UPDLOCK, READPAST` / `SKIP LOCKED`, AMQP 1.0 protocol and credit-based flow control, prefetch count sizing, Idempotent Consumer engine with relational Inbox deduplication, Dead-Letter Queue (DLQ) redrive automation, exponential backoff with decorrelated jitter, Distributed Sagas with MassTransit Automatonymous state machines, high-throughput in-memory backpressure with `System.Threading.Channels`, and large message offloading via the Claim Check pattern.
- **Key Takeaway**: In a distributed system, network partitions guarantee that Two-Phase Commit is non-viable. A Principal Engineer eliminates the dual-write problem with the Transactional Outbox, designs idempotent consumers, bounds all queues with backpressure, and decouples services with Sagas.

### Sprint 07: Distributed Systems Architecture
- **Status**: 🚀 **READY FOR STUDY** (Fully Scaffolded & Formally Verified)
- **Deliverables**: 23 complete modules in `07-Distributed-Systems/` covering the formal proofs of Brewer's CAP Theorem (Gilbert & Lynch) and Abadi's PACELC, distributed consensus engine mechanics (Raft, Paxos, Quorum arithmetic $Q = \lfloor N/2 \rfloor + 1$), single-threaded Redis event loop internals (`ae.c`), memory eviction algorithms (LRU/LFU), 16,384 cluster slots, probabilistic early expiration cache stampede mitigation (XFetch algorithm), Redlock distributed locking with monotonic Fencing Tokens, Vector Clocks, Conflict-Free Replicated Data Types (PN-Counter, ORSet join-semilattices), Polly v8 zero-allocation resilience pipelines, atomic Redis Lua sliding-window rate limiters, and consistent hashing with virtual nodes.
- **Key Takeaway**: Physical networks drop packets and clocks drift. A Principal Engineer never assumes global locks or physical timestamps can solve distributed concurrency. They design resilient failure boundaries, embrace join-semilattice convergence, and pass monotonic fencing tokens to invalidate zombie partition victims.

### Sprint 08: Cloud Native Azure Architecture
- **Status**: 🚀 **READY FOR STUDY** (Fully Scaffolded & Formally Verified)
- **Deliverables**: 22 complete modules in `08-Cloud-Native/` covering Enterprise Hub-and-Spoke Virtual Network topology, Azure Container Apps (ACA) vs AKS vs App Service, KEDA control loops & Envoy sidecar mTLS internals, Azure Functions v4 Isolated Worker (.NET 9 C# 13) with Flex Consumption, Durable Task Framework (DTFx) orchestrator replay semantics & Saga compensation, Azure API Management (APIM) policy engine & mTLS, Azure Front Door Premium Anycast routing & global WAF, Zero-Trust Private Endpoints & Split-Horizon DNS, Azure Key Vault Managed HSM & User-Assigned Managed Identity, Enterprise Modular Bicep IaC, and FinOps Cloud Cost Engineering with unit economics and egress governance.
- **Key Takeaway**: Cloud-native is not merely moving VMs to someone else's datacenter; it is designing for failure and dynamic scale. A Principal Engineer eliminates public ingress using Private Endpoints, protects the perimeter with Managed Identities, prevents recursive billing avalanches through architectural filters and FinOps anomaly policies, and matches the compute runtime to workload characteristics.

### Sprint 09: Advanced Observability & Telemetry
- **Status**: 🚀 **READY FOR STUDY** (Fully Scaffolded & Formally Verified)
- **Deliverables**: 22 complete modules in `09-Observability/` covering OpenTelemetry .NET 9 SDK architecture, W3C TraceContext (`traceparent`, `tracestate`) and Baggage propagation, CLR runtime internals (`System.Diagnostics.DiagnosticSource`, `ActivitySource`, `Activity`, and `System.Diagnostics.Metrics`), high-performance zero-allocation logging with C# `[LoggerMessage]` source generators, OpenTelemetry Collector pipelines (`memory_limiter`, `batch`, `tail_sampling`), High-Cardinality TSDB inverted index engineering and FinOps unit economics, Google SRE mathematical formulation of SLIs, SLOs, and Error Budgets, Multi-Window Multi-Burn-Rate alerting architecture (14.4x/6x/1x rules), and Grafana RED/USE visualization patterns with exemplars.
- **Key Takeaway**: Observability is the mathematical art of inferring the internal states of a complex distributed system from its external outputs without degrading performance or exhausting budgets. A Principal Engineer avoids high-cardinality label traps, deploys tail-based sampling at collector gateways, and alerts exclusively on customer-facing SLO Error Budget burn rates rather than raw CPU/memory thresholds.

### Sprint 10: Large-Scale System Design
- **Status**: 🚀 **READY FOR STUDY** (Fully Scaffolded & Formally Verified)
- **Deliverables**: 23 complete modules in `10-System-Design/` covering back-of-the-envelope capacity estimation (QPS, bandwidth, storage, memory), the Principal 5-Stage System Design Framework, database partitioning & consistent hashing with virtual nodes, distributed transactions (Two-Phase Commit failure modes vs Orchestrated Sagas & Outbox), multi-tier caching (L1/L2/L3) and dogpiling elimination, storage consensus & quorum math ($R+W>N$), sliding-window rate limiters with atomic Redis Lua scripts, asynchronous event-driven streaming & reactive backpressure, and 4 landmark production case studies: Global E-Commerce Flash Sale (100k RPS), Real-Time 50M User Notification Engine, 500k RPS Financial Telemetry Ingestion, and Distributed Video Streaming CDN (HLS/DASH), alongside Architecture Decision Records (ADR) mastery and ARB governance.
- **Key Takeaway**: A Senior Engineer designs systems that work under ideal conditions. A Principal Engineer designs systems that cannot be broken by traffic surges, withstand catastrophic cross-region network partitions, and empower the entire engineering organization through clear, enduring architectural decisions.







