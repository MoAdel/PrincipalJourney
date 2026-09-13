# Sprint 01 — War Room Edition (Incident-Driven Track)

> **"Theory without a crisis is easily forgotten. Architecture forged in a crisis is never lost."**

---

## 🎯 What is this Track?

This is the **high-engagement, incident-driven companion track** for **Sprint 01: Production-Ready Web API**. 
While the original track provides a 27-chapter comprehensive textbook, the **War Room Edition** compresses those same 27 architectural competencies into **5 high-stakes production crises**.

Instead of passively reading about patterns, you step into the shoes of the newly hired **Principal Software Engineer** at *Nova Commerce*. The systems are failing in production, customers are screaming, and you must diagnose, dissect the runtime internals, architect the fix, and defend your decisions to executive leadership.

---

## ⚖️ Side-by-Side Comparison: Which Track Should You Use?

| Dimension | Standard Track (`01-Production-Ready-WebAPI`) | War Room Edition (`01-Production-Ready-WebAPI-WarRoom`) |
|---|---|---|
| **Structure** | 27 individual chapters + deep dives | 5 high-intensity Production Incidents |
| **Pacing** | Conventional study: Read $\rightarrow$ Take Notes | 60-Minute Tactical Sprints (Crisis $\rightarrow$ Internals $\rightarrow$ Refactor $\rightarrow$ Duel) |
| **Engagement** | Structured, reference-heavy | Adrenaline-fueled, crime-scene detective work |
| **Cognitive Load** | High reading volume; requires strong self-discipline | High active problem-solving; instant dopamine loops |
| **Deliverables** | Checkbox completion | 5 Production Post-Mortems + 5 Architecture Decision Records (ADRs) |
| **Role Assumed** | Senior Student | Principal Engineer resolving SEV-1 incidents |

---

## 🗺️ The 5 Combat Incidents Matrix

Each incident targets a cluster of core architectural competencies from the 27 standard chapters:

| Incident | Crisis Name | Core Competencies Covered | Standard Chapters Mapped |
|---|---|---|---|
| **Incident 01** | **[The Black Friday Liveness Death Spiral](01-Incident-Liveness-Death-Spiral.md)** | • Kubernetes/App Service Health Probes<br>• `SocketsHttpHandler` & DNS Refresh<br>• DI Captive Dependencies & Scope Trees | Ch 07, 08, 08A, 15, 15A, 19, 23 |
| **Incident 02** | **[The 30GB Memory Leak & Exception Blizzard](02-Incident-Memory-Leak-Exception-Blizzard.md)** | • Zero-Allocation Structured Logging (`[LoggerMessage]`)<br>• Two-Pass CLR Exception Unwinding<br>• RFC 9457 `ProblemDetails` & Domain `Result<T>`<br>• Invariant Validation vs ReDoS | Ch 11, 11A, 12, 12A, 13, 16 |
| **Incident 03** | **[The Silent Database Meltdown & 20-Minute Query](03-Incident-Database-Meltdown-Keyset-Pagination.md)** | • Keyset Pagination vs Offset `Skip/Take`<br>• ASP.NET Core Middleware Pipeline Mechanics<br>• Idempotency-Key & Distributed Double-Charge Defense | Ch 08, 08A, 14, 22 |
| **Incident 04** | **[The Secret Leak & The Config Reload Phantom](04-Incident-Secret-Leak-Options-Phantom.md)** | • Configuration Providers & Layered Trees<br>• `IOptions` vs `IOptionsSnapshot` vs `IOptionsMonitor`<br>• Azure Key Vault & Zero-Trust Secrets<br>• `IChangeToken` GC Memory Leaks | Ch 09, 09A, 10, 10A, 20 |
| **Incident 05** | **[The Monolith Architectural Rot & PR Gauntlet](05-Incident-Architectural-Rot-PR-Gauntlet.md)** | • Clean Architecture Boundary Inversion<br>• SOLID at Enterprise Scale<br>• API Versioning Lifecycle (RFC 8594 Sunset)<br>• Architecture Decision Records (ADR) & PR Governance | Ch 04, 05, 06, 17, 18, 21, 24, 25, 26 |

---

## ⏱️ The 60-Minute Incident Formula

Follow this exact formula for each incident to achieve maximum retention in minimal time:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. The 03:00 AM Crisis Briefing (10 min)                               │
│    • Read symptoms, error logs, and customer impact.                   │
│    • Formulate your initial diagnostic hypothesis BEFORE reading on.   │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Deep Internals & Root Cause (20 min)                                │
│    • Unpack the exact CLR, memory, or pipeline mechanics.             │
│    • Understand WHY it failed under concurrency/load.                  │
├────────────────────────────────────────────────────────────────────────┤
│ 3. The Architecture Refactor & Scoreboard (20 min)                     │
│    • Study the Before vs After production-grade C# code.               │
│    • Benchmark the difference (0B allocations, sub-millisecond p99).   │
├────────────────────────────────────────────────────────────────────────┤
│ 4. The Socratic Duel & Executive Defense (10 min)                      │
│    • Defend your engineering trade-offs against 3 hostile questions    │
│      from Staff Engineers, Auditors, or the CTO.                       │
└────────────────────────────────────────────────────────────────────────┘
```
