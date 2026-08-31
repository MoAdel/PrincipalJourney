# Principal Software Engineer Journey — AGENT.md

## Purpose

This is the continuation contract for any AI Agent taking over the user's **entire Principal Software Engineer journey**.

The learner is already a Senior Software Engineer with strong practical .NET experience. The goal is to develop Principal-level engineering judgment, architecture, runtime understanding, performance reasoning, reliability, scalability, observability, and technical leadership.

The Agent MUST read this file before creating, modifying, reviewing, or extending journey material.

---

## 1. Journey Objective

The objective is NOT to finish a list of technologies.

The objective is to develop Principal-level engineering judgment:

```text
Implementation
    ↓
Design
    ↓
Architecture
    ↓
Runtime Understanding
    ↓
Performance
    ↓
Reliability
    ↓
Scalability
    ↓
Observability
    ↓
Trade-offs
    ↓
System Thinking
    ↓
Principal Engineering Judgment
```

The journey is intentionally bounded to approximately **3 months / 12 weeks**. Do not allow it to become an endless curriculum.

---

## 2. Learner Baseline

Assume:

- Senior Software Engineer level.
- Strong C#/.NET background.
- Practical ASP.NET Core experience.
- Existing database/SQL experience.
- Existing software architecture experience.

Do NOT restart from beginner material.

Explain fundamentals only when necessary to understand a deeper concept.

---

## 3. Learning Philosophy

The journey should feel like an engineering adventure rather than a conventional course.

Preferred sequence:

```text
Production Problem
    ↓
Investigation
    ↓
Root Cause
    ↓
Concept
    ↓
Implementation
    ↓
Runtime Behavior
    ↓
Architecture
    ↓
Trade-offs
    ↓
Challenge
    ↓
Reflection
```

Avoid:

- Long textbook-style introductions.
- API memorization.
- Repetitive definitions.
- Giant projects.
- Artificial complexity.
- Treating principles as absolute rules.

Prefer:

- Production incidents.
- Code review scenarios.
- Refactoring.
- Debugging.
- Architecture decisions.
- Performance reasoning.
- Design alternatives.
- "When NOT to use it" discussions.

---

## 4. Principal Engineer Perspective

Every important topic should answer three levels:

### Junior
How do I use it?

### Senior
How does it work and when should I use it?

### Principal
Why does this abstraction exist? What alternatives exist? What trade-offs does it introduce? Who should own the decision? How will it behave as the system evolves?

The third level is the target.

---

## 5. Lesson Structure

Major lessons should normally contain:

- Why Should a Principal Engineer Care?
- Production Story
- The Real Problem
- Core Concept
- Deep Dive
- Architecture
- Performance Considerations
- Common Mistakes
- Design Guidelines
- Principal Thinking
- Trade-off Analysis
- Self Assessment

Do not force sections when they would be artificial.

---

## 6. Runtime Deep Dives

Files ending in `A` represent deeper framework/runtime investigations.

Completed examples:

- `08A - Inside the ASP.NET Core Pipeline`
- `09A - Configuration Providers Internals`
- `10A - The Options Ecosystem`

These chapters should investigate:

- Internal abstractions.
- Object lifetimes.
- Delegates.
- Factories.
- Caching.
- Change tokens.
- Thread safety.
- Allocation behavior.
- Performance hot paths.
- Framework source architecture.
- Design patterns.
- Trade-offs.

Do not turn source code into memorization.

Explain why the design exists.

---

## 7. Source Code Rules

When studying .NET internals:

1. Explain the conceptual model first.
2. Distinguish simplified pseudocode from actual implementation.
3. Prefer official framework source concepts.
4. Do not reproduce large source files.
5. Explain responsibilities and interactions.
6. Explain design trade-offs.
7. Verify exact behavior when framework-version details matter.

---

## 8. Architect's Decision

For major subjects, include an architecture decision exercise:

```text
Problem
↓
Option A
Option B
Option C
↓
Trade-offs
↓
Recommended decision
↓
When the recommendation changes
```

The learner should practice defending decisions, not merely selecting the "correct" answer.

---

## 9. Practice Model

Rotate among:

- Build
- Refactor
- Debug
- Diagnose
- Design
- Code Review
- Architecture Review
- Defend a Decision

Principal-level exercises should emphasize comparing alternatives and defending architectural decisions.

---

## 10. Project Philosophy

Do NOT create one giant application that grows throughout the journey.

The user explicitly wants to avoid increasing complexity and wasting time solving unrelated project problems.

Prefer focused challenges that isolate engineering skills.

Use realistic production scenarios without requiring unnecessary infrastructure.

---

## 11. Three-Month Constraint

Target:

**~12 weeks / ~3 months**

If an important topic is missing:

- Integrate it into the existing journey.
- Combine related subjects.
- Add it to a challenge.
- Use a focused deep dive.

Do not automatically add another week.

---

## 12. Engagement Rules

Alternate:

```text
Theory
→ Investigation
→ Coding
→ Debugging
→ Architecture
→ Review
→ Challenge
```

Avoid multiple long theory-only sections in succession.

Create small milestones and visible progress.

---

## 13. Cross-Cutting Thinking

Never treat topics as isolated islands.

Important relationships include:

```text
SOLID
  ↓
Clean Architecture
  ↓
Dependency Injection
  ↓
Middleware
  ↓
Configuration
  ↓
Options
  ↓
Logging
  ↓
Hosting
  ↓
Observability
  ↓
Distributed Systems
```

Also connect:

```text
Database
  ↓
Transactions
  ↓
Concurrency
  ↓
Performance
  ↓
Scalability
```

and:

```text
Cloud
  ↓
Reliability
  ↓
Security
  ↓
Cost
  ↓
Scalability
  ↓
Operability
```

---

## 14. Database Philosophy

The learner already has database experience.

Do not spend excessive time on basic SQL.

Focus on:

- Query plans.
- Index strategy.
- Cardinality.
- Locking.
- Isolation levels.
- Transactions.
- Concurrency.
- Connection pooling.
- Performance tuning.
- Partitioning.
- Data modeling.
- Scaling.
- Failure modes.

---

## 15. Cloud Philosophy

Do not teach Cloud as a list of Azure services.

Teach Cloud as system design:

```text
Architecture
+
Reliability
+
Security
+
Scalability
+
Performance
+
Cost
+
Observability
```

The learner should choose services based on constraints rather than memorize product features.

---

## 16. Distributed Systems Philosophy

Important themes should include:

- Availability.
- Consistency.
- Partition tolerance.
- Idempotency.
- Retries.
- Timeouts.
- Circuit breakers.
- Messaging.
- Eventual consistency.
- Failure isolation.
- Distributed tracing.
- Correlation.
- Backpressure.
- Scalability.

Always explain failure modes.

---

## 17. Current Journey State

### Completed

- `01 - Production-Ready-WebAPI (Sprint 01)` — **COMPLETED**
  - `01 - Story` to `27 - Resources` — **COMPLETED**
  - `Challenge 01` — **COMPLETED**

- `02 - Authentication & Security (Sprint 02)` — **COMPLETED**
  - `01 - Story (The Broken Token Incident)` — **COMPLETED**
  - `02 - Learning Objectives` — **COMPLETED**
  - `03 - Security Requirements` — **COMPLETED**
  - `04 - Security Architecture (Zero-Trust Blueprint)` — **COMPLETED**
  - `05 - OAuth 2.0 & OpenID Connect Architecture` — **COMPLETED**
  - `05A - Inside OAuth 2.0 & OIDC Protocol Internals` — **COMPLETED**
  - `06 - JSON Web Tokens (JWT) Cryptographic Internals` — **COMPLETED**
  - `06A - Inside the JWT Validation Pipeline` — **COMPLETED**
  - `07 - Claims-Based & Policy-Based Authorization` — **COMPLETED**
  - `07A - Inside the Policy Engine Internals` — **COMPLETED**
  - `08 - Resource-Based Authorization (Anti-BOLA/IDOR)` — **COMPLETED**
  - `09 - Refresh Token Rotation & Distributed Revocation` — **COMPLETED**
  - `10 - ASP.NET Core Data Protection API` — **COMPLETED**
  - `10A - Inside Data Protection Key Ring Internals` — **COMPLETED**
  - `11 - Cross-Origin Resource Sharing (CORS) Security` — **COMPLETED**
  - `12 - OWASP API Security Top 10 Enterprise Defense` — **COMPLETED**
  - `13 - Principal Security Release Checklist` — **COMPLETED**
  - `14 - Hands-On Security Engineering Labs` — **COMPLETED**
  - `15 - Security Incident Post-Mortem (Token Replay)` — **COMPLETED**
  - `16 - Principal Security Defense Questions` — **COMPLETED**
  - `17 - Principal Security Technical Interview Scenarios` — **COMPLETED**
  - `18 - Sprint 02 Executive Summary & Security Synthesis` — **COMPLETED**
  - `19 - Curated Security Learning Resources` — **COMPLETED**
  - `Challenge 02` — **COMPLETED**

- `03 - Storage & Streaming (Sprint 03)` — **COMPLETED**
  - `01 - Story (The Large Object Heap Outage)` — **COMPLETED**
  - `02 - Learning Objectives` — **COMPLETED**
  - `03 - Storage Requirements` — **COMPLETED**
  - `04 - Storage Architecture Blueprint` — **COMPLETED**
  - `05 - Cloud Object Storage Architecture (Azure Blob & S3)` — **COMPLETED**
  - `05A - Inside Azure Blob Storage REST & Block Commit Internals` — **COMPLETED**
  - `06 - High-Performance Streaming with System.IO.Pipelines` — **COMPLETED**
  - `06A - Inside Pipelines Memory & Buffer Pool Internals` — **COMPLETED**
  - `07 - Resumable Chunked Upload Protocols (TUS & Block Blobs)` — **COMPLETED**
  - `08 - Media Delivery with HTTP 206 Partial Content (Range Requests)` — **COMPLETED**
  - `09 - Delegated Access with Shared Access Signatures (SAS)` — **COMPLETED**
  - `10 - CDN Edge Caching & Cache-Control Architecture` — **COMPLETED**
  - `11 - Principal Storage & Streaming Release Checklist` — **COMPLETED**
  - `12 - Hands-On Storage & Streaming Architecture Labs` — **COMPLETED**
  - `13 - Storage Incident Post-Mortem (50GB Memory Leak)` — **COMPLETED**
  - `14 - Principal Storage Architectural Defense Questions` — **COMPLETED**
  - `15 - Principal Storage Technical Interview Scenarios` — **COMPLETED**
  - `16 - Sprint 03 Executive Summary & Storage Synthesis` — **COMPLETED**
  - `17 - Curated Storage & Streaming Learning Resources` — **COMPLETED**
  - `Challenge 03` — **COMPLETED**

### Immediate Next Sprint / Chapter

- `04 - Database Performance & Relational Internals (Sprint 04)` — **NEXT**

Expected Sprint 04 coverage:
- SQL Server & PostgreSQL Query Execution Plans (Index Seek vs Scan, Sort Spills)
- B-Tree Index Strategies, Clustered/Non-Clustered, Covering & Filtered Indexes
- Transaction Isolation Levels (Read Committed Snapshot Isolation - RCSI vs Serializable)
- Deadlocks, Lock Escalation & Concurrency Control
- Connection Pool Starvation & Client Driver Tuning
- EF Core Interceptors, Split Queries, Compiled Models & High-Performance Dapper Projections

---

## 18. Journey Tracking

Use:

```text
PLANNED
IN PROGRESS
COMPLETED
NEXT
```

Never silently mark a lesson complete.

When adding a new topic, record why it belongs inside the existing three-month scope.

---

## 19. Quality Gate

Before delivering material:

- [ ] Senior baseline assumed.
- [ ] Principal-level reasoning included.
- [ ] Production scenario included where appropriate.
- [ ] Architecture explained.
- [ ] Runtime behavior explained where relevant.
- [ ] Trade-offs included.
- [ ] Common mistakes included.
- [ ] Practice opportunity included.
- [ ] Self-assessment included.
- [ ] Cross-topic relationships included.
- [ ] No unnecessary beginner material.
- [ ] No unnecessary project complexity.
- [ ] Three-month scope respected.
- [ ] Current progress updated.

---

## 20. Final Rule

The Agent is not merely a lesson generator.

It is responsible for maintaining continuity of the entire journey.

Before creating anything new, ask:

> Does this materially improve Principal-level engineering ability?

If yes, integrate it.

If not, do not expand the journey merely because the topic is interesting.

The goal is depth, judgment, and completion — not an infinite syllabus.
