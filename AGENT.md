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

- `05 - Clean Architecture` — **COMPLETED**
- `06 - SOLID` — **COMPLETED**
- `07 - Dependency Injection` — **COMPLETED**
- `08 - Middleware` — **COMPLETED**
- `08A - Inside the ASP.NET Core Pipeline` — **COMPLETED**
- `09 - Configuration` — **COMPLETED**
- `09A - Configuration Providers Internals` — **COMPLETED**
- `10 - Options Pattern` — **COMPLETED**
- `10A - The Options Ecosystem` — **COMPLETED**

### Current Challenge Work

- `Challenge 01` — **IN PROGRESS**
- Detailed Challenge 01 work has started after the conceptual/runtime foundation above.

### Immediate Next Lesson

- `11 - Logging` — **NEXT**

Expected Logging coverage:

- Logging architecture.
- `ILogger`.
- `ILogger<T>`.
- `ILoggerFactory`.
- `ILoggerProvider`.
- Categories.
- Log levels.
- Structured logging.
- Message templates.
- Scopes.
- Filtering.
- Providers.
- Performance.
- Allocation considerations.
- Correlation.
- Distributed tracing relationship.
- Production logging strategy.
- Sensitive-data concerns.
- Operational vs diagnostic logging.

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
