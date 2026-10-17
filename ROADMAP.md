# The Principal Software Engineer Journey — Complete 17-Sprint & Dual-Track War Room Roadmap

> **Auto-Generated & Verified Against On-Disk Curriculum Tree (`00` through `16` + Companion `*-WarRoom` Tracks + `templates/`)**

---

## 1. Curriculum Overview & Dual-Track Matrix

| Code | Directory | Track Title | Files | Core Competencies & War Rooms |
|---|---|---|---|---|
| **Sprint 00** | [`00-Foundation/`](./00-Foundation/README.md) | Principal Engineering Foundation & First-Principles Workbench | `6` | Mindset, Diagnostic CLI Tooling, Deliberate Practice, RFC Protocol Discipline, Fermi Math |
| **Sprint 01** | [`01-Production-Ready-WebAPI/`](./01-Production-Ready-WebAPI/README.md) | Production-Ready ASP.NET Core 9 Web API Architecture | `34` | Clean Architecture, SOLID, DI Internals, Middleware Pipeline, Options, Logging, RFC 9457 ProblemDetails, HttpClient |
| **War Room 01** | [`01-Production-Ready-WebAPI-WarRoom/`](./01-Production-Ready-WebAPI-WarRoom/README.md) | Web API SEV-1 Incident Simulations (5 War Rooms) | `6` | Liveness Death Spiral, Exception Blizzard, Keyset Pagination Meltdown, Options Secret Leak, PR Gauntlet |
| **Sprint 02** | [`02-Authentication/`](./02-Authentication/README.md) | Zero-Trust Authentication, Cryptography & Identity Architecture | `30` | STRIDE Threat Modeling, OAuth 2.1, OIDC, Device Code Flow (RFC 8628), JWT/JWS Internals, Token Rotation, DataProtection, MFA/TOTP |
| **War Room 02** | [`02-Authentication-WarRoom/`](./02-Authentication-WarRoom/README.md) | Authentication & Identity SEV-1 Incident Simulations (3 War Rooms) | `4` | JWKS Rollover 429 Blackout, Concurrent Refresh Token Reuse Storm, Multi-Pod DataProtection KeyRing Desync |
| **Sprint 03** | [`03-Storage/`](./03-Storage/README.md) | Cloud Storage, High-Throughput I/O Pipelines & CDN Streaming | `20` | Blob Storage Internals, System.IO.Pipelines, Zero-Allocation Span/Memory, Resumable Uploads, HTTP 206 Range Streaming, Valet Key SAS |
| **War Room 03** | [`03-Storage-WarRoom/`](./03-Storage-WarRoom/README.md) | Storage & Streaming SEV-1 Incident Simulations (3 War Rooms) | `4` | LOH MemoryStream Multipart OOM, SAS Clock-Skew & Over-Scoped Valet Key, CDN Origin Shield Range Storm |
| **Sprint 04** | [`04-Database/`](./04-Database/README.md) | Database Storage Engines, Indexing & Query Optimization | `24` | 8KB Page Internals, B-Tree & Covering Indexes, Execution Plans, Parameter Sniffing, RCSI Version Store, Deadlocks, Materialized Views |
| **War Room 04** | [`04-Database-WarRoom/`](./04-Database-WarRoom/README.md) | Database Performance SEV-1 Incident Simulations (5 War Rooms) | `6` | 20M-Row TempDB Sort Spill, Lock Escalation Deadlock Storm, Connection Pool Blackout, RCSI Version Store Bloat, EF Core Cartesian Explosion |
| **Sprint 05** | [`05-Concurrency/`](./05-Concurrency/README.md) | Runtime Concurrency, Memory Model & Garbage Collector Internals | `25` | Async State Machines, ExecutionContext Flow, ThreadPool Hill-Climbing, Sync-Over-Async, CPU Cache False Sharing, LOH/DATAS GC & Cgroups |
| **War Room 05** | [`05-Concurrency-WarRoom/`](./05-Concurrency-WarRoom/README.md) | Concurrency & Runtime SEV-1 Incident Simulations (5 War Rooms) | `6` | Sync-Over-Async ThreadPool Collapse, LOH Gen2 Stall, False Sharing CPU Meltdown, AsyncLocal Leak, ConcurrentDictionary Factory Storm |
| **Sprint 06** | [`06-Messaging/`](./06-Messaging/README.md) | Event-Driven Architecture, Brokers, Outbox & Distributed Sagas | `25` | AMQP/Kafka Internals, Transactional Outbox, Idempotent Consumers, DLQ Retry Storms, Saga State Machines, System.Threading.Channels, Schedulers |
| **War Room 06** | [`06-Messaging-WarRoom/`](./06-Messaging-WarRoom/README.md) | Messaging & Saga SEV-1 Incident Simulations (3 War Rooms) | `4` | Visibility-Timeout Poison Message Avalanche, Outbox Table Lock Escalation, Out-of-Order Saga Zombie Compensation |
| **Sprint 07** | [`07-Distributed-Systems/`](./07-Distributed-Systems/README.md) | Distributed Systems, Consensus, Caching & Resilience Engineering | `23` | CAP/PACELC, Raft/Paxos Consensus, Redis Engine Internals, Cache Stampede, Redlock & Fencing Tokens, CRDTs, Polly Circuit Breakers |
| **War Room 07** | [`07-Distributed-Systems-WarRoom/`](./07-Distributed-Systems-WarRoom/README.md) | Distributed Systems SEV-1 Incident Simulations (3 War Rooms) | `4` | Hot-Key TTL Cache Stampede, Redlock GC/CFS Pause Split-Brain, 3-Tier 64x Retry Amplification Storm |
| **Sprint 08** | [`08-Cloud-Native/`](./08-Cloud-Native/README.md) | Cloud-Native Architecture, Kubernetes, Serverless & FinOps | `22` | AKS vs ACA, KEDA & Envoy Internals, Durable Functions, APIM Gateway, Front Door Anycast, Private Endpoints, Workload Identity, Bicep, FinOps |
| **War Room 08** | [`08-Cloud-Native-WarRoom/`](./08-Cloud-Native-WarRoom/README.md) | Cloud-Native & Kubernetes SEV-1 Incident Simulations (3 War Rooms) | `4` | Outbound SNAT Port Exhaustion, KEDA Cold-Start Liveness Probe Death Spiral, 100-Pod KeyVault 429 Boot Cascade |
| **Sprint 09** | [`09-Observability/`](./09-Observability/README.md) | OpenTelemetry, Distributed Tracing, Metrics & SLO Burn-Rate Alerting | `22` | OTel SDK, Activity & DiagnosticSource, W3C Trace Context, OTel Collector Pipelines, High-Cardinality Engineering, Multi-Window Burn Rates |
| **War Room 09** | [`09-Observability-WarRoom/`](./09-Observability-WarRoom/README.md) | Observability & Telemetry SEV-1 Incident Simulations (3 War Rooms) | `4` | 18M Series High-Cardinality Prometheus OOM, Synchronous Log Sink ThreadPool Blockade, Load-Balanced Tail-Sampling Split Trace |
| **Sprint 10** | [`10-System-Design/`](./10-System-Design/README.md) | Large-Scale System Design, Sharding & Reference Architectures | `23` | Fermi Capacity Math, Sharding & Partitioning, 2PC vs Saga, Read-Heavy Caching, Global E-Commerce, Real-Time Notifications, Telemetry Ingestion |
| **War Room 10** | [`10-System-Design-WarRoom/`](./10-System-Design-WarRoom/README.md) | System Design & Scale SEV-1 Incident Simulations (3 War Rooms) | `4` | Celebrity Hot-Partition Shard Meltdown, Read-Replica Lag Double-Payment Bug, Fail-Closed Redis Rate-Limiter Global Outage |
| **Sprint 11** | [`11-DevOps-And-Pipelines/`](./11-DevOps-And-Pipelines/README.md) | DevOps, Chiseled Containers, SLSA Supply-Chain & GitOps Delivery | `17` | DORA SLAs, SLSA/SBOM/Cosign, 68MB Chiseled Dockerfiles, PID 1 Lifecycle, GitHub Actions, ArgoCD GitOps, NetArchTest Gates, Canary Rollouts |
| **War Room 11** | [`11-DevOps-And-Pipelines-WarRoom/`](./11-DevOps-And-Pipelines-WarRoom/README.md) | DevOps & Container Lifecycle SEV-1 Incident Simulations | `2` | Shell-Form PID 1 SIGTERM Blackhole & Rolling Deploy 502 Storm |
| **Sprint 12** | [`12-AI-And-Agents/`](./12-AI-And-Agents/README.md) | AI Architecture, Vector Databases, Production RAG & Autonomous Agents | `16` | Embeddings Geometry, HNSW/IVF/PQ Indexing, Hybrid RRF & Cross-Encoder RAG, ReAct Agent Loops, Model Context Protocol (MCP) C#, RAG ACL Security |
| **War Room 12** | [`12-AI-And-Agents-WarRoom/`](./12-AI-And-Agents-WarRoom/README.md) | AI, Vector DB & Agent SEV-1 Incident Simulations (3 War Rooms) | `4` | 3072-Dim HNSW Index RAM OOM, ReAct Agent Infinite Tool-Error Loop ($48k Burn), Semantic Cache Cross-Tenant Leak & Post-Filter Starvation |
| **Sprint 13** | [`13-Frontend-Architecture/`](./13-Frontend-Architecture/README.md) | Modern Frontend Architecture, RxJS Concurrency & State Machines | `14` | RxJS Higher-Order Streams, TC39 Decorators, Micro-Frontends (Module Federation), Single-Flight 401 Interceptors, FSM State Machines, Signals/Fiber |
| **War Room 13** | [`13-Frontend-Architecture-WarRoom/`](./13-Frontend-Architecture-WarRoom/README.md) | Frontend Architecture & RxJS SEV-1 Incident Simulations | `2` | Out-of-Order mergeMap Search Race & Detached Component V8 Memory Leak |
| **Sprint 14** | [`14-Principal-Review/`](./14-Principal-Review/README.md) | Principal Architecture Review, Org Governance & Capstone Defense | `12` | ARB Governance, RFC Evaluation, Tech-Debt Valuation, Influence Without Authority, Align-5-Teams Doc, System Sunsetting, FinOps Unit Economics |
| **Sprint 15** | [`15-Zero-Downtime-Data-Evolution/`](./15-Zero-Downtime-Data-Evolution/README.md) | Zero-Downtime Data Evolution & Billion-Row Migrations | `13` | 5-Phase Expand/Contract, Sch-M & ACCESS EXCLUSIVE Lock Internals, Keyset Billion-Row Backfills, Dual-Write/CDC & Shadow-Read Cutovers |
| **War Room 15** | [`15-Zero-Downtime-Data-Evolution-WarRoom/`](./15-Zero-Downtime-Data-Evolution-WarRoom/README.md) | Zero-Downtime Data Migration SEV-1 Incident Simulations | `2` | Black Friday Sch-M FIFO Lock Queue Freeze on 1.4B-Row Orders Table |
| **Sprint 16** | [`16-Multi-Region-And-Disaster-Recovery/`](./16-Multi-Region-And-Disaster-Recovery/README.md) | Multi-Region Architecture, Geo-Replication & Disaster Recovery | `12` | RPO/RTO Math, Active-Active Tenant-Pinned Cells vs Warm Standby, PACELC Replication, Monotonic Lease Fencing, Anycast Routing, DR GameDays |
| **War Room 16** | [`16-Multi-Region-And-Disaster-Recovery-WarRoom/`](./16-Multi-Region-And-Disaster-Recovery-WarRoom/README.md) | Multi-Region & Failover SEV-1 Incident Simulations | `2` | Unfenced Auto-Failover Split-Brain & $640k Double-Spend |

**Total Indexed Curriculum Chapters & War Rooms**: `396` Markdown Files across `17` Core Sprints (`00`–`16`) and `14` SEV-1 War Room Companion Modules.

---

## 2. Reusable Principal Engineering Templates (`templates/`)

| Template | Path | Purpose |
|---|---|---|
| **War Room 6-Part Arc** | [`templates/WARROOM-TEMPLATE.md`](./templates/WARROOM-TEMPLATE.md) | Canonical SEV-1 War Room simulation blueprint (Red Herring, Predict Gate, Fermi Math, Scoreboard, Socratic Cost Duel, Post-Mortem). |
| **Blameless Post-Mortem** | [`templates/POSTMORTEM-TEMPLATE.md`](./templates/POSTMORTEM-TEMPLATE.md) | Standardized Five-Whys, Fermi impact summary, detection timeline, and CI gate action items. |
| **Architecture Decision Record** | [`templates/ADR-TEMPLATE.md`](./templates/ADR-TEMPLATE.md) | Principal ADR with Trade-Off Valuation Matrix, Validation/Rollback procedures, and Invalidation Criteria. |
| **Fermi `📐 Derive It` Convention** | [`templates/DERIVE-IT-CONVENTION.md`](./templates/DERIVE-IT-CONVENTION.md) | Authoring specification for interactive Back-of-Envelope capacity & unit-cost derivations. |
