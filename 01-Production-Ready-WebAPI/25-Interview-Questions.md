# 25 - Principal & Staff Engineer Technical Interview Scenarios

> "In a Principal-level interview, interviewers are not testing whether you know the syntax of a framework.
>
> They are testing your mental models, systems thinking, failure reasoning, and ability to make trade-offs under extreme ambiguity."

---

# Evaluation Rubric for Principal Candidates

| Signal | Senior Candidate | Staff / Principal Candidate |
|---|---|---|
| **Architecture** | Proposes standard 3-tier layering or Clean Architecture dogma. | Evaluates boundary costs, deployment independence, domain cohesion, and team cognitive load. |
| **Resilience** | Mentions `try-catch` blocks and Polly retry policies. | Designs for partial failure, bulkheads, exponential backoff with jitter, idempotency keys, and death-spiral prevention. |
| **Performance** | Suggests "adding Redis cache" or "scaling up servers". | Analyzes GC Gen 0/1 allocations, socket pooling, connection limits, keyset pagination, and async I/O bottlenecks. |
| **Observability** | "We log errors to console or Serilog." | Emphasizes structured logging, W3C distributed tracing, correlation scopes, cardinality cost control, and actionable SLO alerts. |
| **Failure Modes** | Assumes the network and database are mostly reliable. | Designs assuming networks will fail, secrets will rotate, clients will retry, and downstream dependencies will degrade. |

---

# Scenario 1: Designing an Enterprise Payment Ingestion API

### The Prompt:
*"Design a mission-critical payment ingestion API that handles 25,000 requests per second. The downstream banking gateway has a 99.5% availability SLA and occasional 3-second latency spikes. How do you design this API to ensure zero lost transactions and zero double-charges?"*

### Expected Principal Response Structure:
1. **API Ingress Boundary**:
   - Require a client-generated `Idempotency-Key` (UUIDv4) header on all payment submission requests.
   - Store idempotency state in a Redis distributed cache with distributed locks (Redlock or single-node Redis with Lua scripts) and a 24-hour TTL.
2. **Asynchronous Decoupling**:
   - Accept request, validate format via FluentValidation, persist payment intent, publish event to an append-only message bus (Azure Service Bus / Kafka / RabbitMQ), and return `202 Accepted` immediately.
3. **Downstream Gateway Resilience**:
   - Outbound HTTP calls managed via `IHttpClientFactory` with `PooledConnectionLifetime = 2 mins`.
   - Resilience pipeline: Timeout per attempt (2s), 3 Retries with Exponential Backoff + Jitter on 503/504, and a Circuit Breaker configured to open if error rates exceed 30% over a 30s window.
4. **Telemetry & Auditability**:
   - End-to-end W3C `traceparent` propagation across HTTP, Redis, and message queues.
   - Zero PII / PAN (credit card number) logging; strict compliance with PCI-DSS.

---

# Scenario 2: Diagnosing a Silent Production CPU Spike

### The Prompt:
*"Following a minor deployment, your ASP.NET Core API cluster experiences a CPU jump from 25% to 95%. Latency increases from 40ms to 6 seconds. No errors are logged. How do you isolate the root cause in production?"*

### Expected Principal Response:
1. **Initial Telemetry Triage**:
   - Check `dotnet-counters` for `cpu-usage`, `gen-0-gc-rate`, `alloc-rate`, `threadpool-queue-length`, and `lock-contention-count`.
2. **Hypothesis Generation**:
   - If GC allocation rate is high: Transient memory allocation storm in the hot path (e.g. string interpolation in logging or large LINQ queries).
   - If thread-pool queue length is climbing: Thread-pool starvation caused by sync-over-async (`.Result`, `.Wait()`).
   - If lock contention is high: Excessive synchronization around a shared Singleton resource.
3. **Capture Diagnostic Artifacts**:
   - Run `dotnet-dump collect` and `dotnet-trace collect` on a live affected pod.
4. **Analysis**:
   - In `dotnet-dump`, run `dumpheap -stat` and `threads` to inspect call stacks and top allocated object graphs.
5. **Mitigation & Fix**:
   - Shed non-critical traffic via rate limiters, hotfix the offending code path, and verify resolution using load tests in a staging environment.

---

# Scenario 3: Managing a Zero-Downtime Secret Rotation Incident

### The Prompt:
*"Your organization requires automated password rotation for all production SQL databases every 30 days. How do you architect your ASP.NET Core application and infrastructure to support automated rotation with zero downtime and zero dropped customer requests?"*

### Expected Principal Response:
1. **Credential-Less Authentication (Preferred)**:
   - Use **Azure Managed Identities / AWS IAM Roles** with Azure SQL Database / AWS Aurora. The application uses OAuth tokens refreshed automatically by the cloud identity subsystem, eliminating SQL passwords entirely.
2. **Dynamic Key Vault Secret Rotation (If Passwords Required)**:
   - Configure Azure Key Vault Configuration Provider with a periodic reload interval (e.g. 15 minutes).
   - Bind database connection strings using `IOptionsMonitor<DatabaseOptions>`.
   - Implement an interceptor or factory that detects authentication failures, invalidates the existing connection pool, retrieves the latest secret from `IOptionsMonitor.CurrentValue`, and re-establishes connections transparently.
