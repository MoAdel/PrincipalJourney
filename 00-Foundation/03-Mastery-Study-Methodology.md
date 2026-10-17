# 03 — Deliberate Practice & The Principal Study Methodology

> "Senior engineers practice until they get it right. Principal engineers practice until they cannot get it wrong, and then build systems that make failure physically impossible for everyone else."

---

## 1. The 5-Stage Deliberate Practice Loop

Every sprint in this curriculum is structured as a high-feedback engineering simulation rather than passive reading:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: Predict Before Reveal (War Room Triage)                       │
│   • Inspect partial 03:00 AM telemetry & spot the Red Herring metric.  │
│   • Formulate and commit a falsifiable hypothesis BEFORE reading RCA.  │
├────────────────────────────────────────────────────────────────────────┤
│ STAGE 2: First-Principles Derivation (Fermi Mode)                      │
│   • Never accept asserted numbers ($1.4M, 42,000ms, 14M series).       │
│   • Derive every capacity, memory, IOPS, and cost figure from math.    │
├────────────────────────────────────────────────────────────────────────┤
│ STAGE 3: Mechanical Internals & RFC Deconstruction                     │
│   • Trace execution from C# source -> IL/JIT -> OS Kernel -> Wire.     │
│   • Verify behavior against formal IETF RFCs and vendor source code.   │
├────────────────────────────────────────────────────────────────────────┤
│ STAGE 4: Chaos Reproduction & Automated Governance                     │
│   • Reproduce the failure locally under cgroup/load constraints.       │
│   • Write NetArchTest or CI gates so the bug can never re-enter main.  │
├────────────────────────────────────────────────────────────────────────┤
│ STAGE 5: Socratic ARB Defense & Spaced Retrieval                       │
│   • Defend the refactor against CTO/CFO cost and failure challenges.   │
│   • Drill spaced-repetition flashcards across all prior sprints.       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. How to Use the Dual-Track Curriculum (Core Sprint + War Room)

Each technical domain (`01` through `16`) consists of two paired tracks:
1. **The Core Architecture Track (`NN-Topic/`)**: Builds the theoretical, protocol, runtime, and implementation foundations from `01-Story.md` through `Hands-On-Labs.md`, `Principal-Defense-Questions.md`, and `Interview-Scenarios.md`.
2. **The SEV-1 War Room Companion (`NN-Topic-WarRoom/`)**: Drops you into realistic 03:00 AM production incidents with misleading metrics, copy-pasteable diagnostic runbooks, Predict-Before-Reveal gates, Socratic cost defenses, and blameless post-mortems.

### Recommended Study Cadence per Sprint

| Phase | Activity | Deliverable | Time Box |
|---|---|---|---|
| **1. Orientation** | Read `01-Story.md` through `04-Architecture.md` | System boundary diagram & SLA envelope | 60 min |
| **2. Deep Internals** | Study `05`–`12` (including `A`/`B` internal deep dives) | Annotated code & Fermi derivations | 180 min |
| **3. Hands-On Lab** | Execute `Hands-On-Labs.md` in local Docker workbench | Passing benchmark & `NetArchTest` suite | 120 min |
| **4. War Room Simulation** | Solve all incidents in `*-WarRoom/` (Predict-Before-Reveal) | Completed Blameless Post-Mortem & ADR | 90 min |
| **5. ARB Defense** | Drill `Principal-Defense-Questions.md` out loud | Zero-hesitation verbal trade-off defense | 45 min |

---

## 3. The 3-Level Evaluation Rubric

| Perspective | Core Question | Focus Area | Example: Distributed Caching |
|---|---|---|---|
| **Junior** | *How do I call the API?* | Syntax & Library Usage | Calling `IDistributedCache.GetStringAsync(key)`. |
| **Senior** | *What are the best practices?* | Patterns & Clean Code | Implementing Cache-Aside with TTL and JSON serialization. |
| **Principal** | *Where does this break at $100\times$ load, and how do we prove it?* | Mechanical Limits, Stampedes, FinOps & Rollback | Preventing hot-key TTL stampedes via single-flight `SemaphoreSlim` + probabilistic early expiration (XFetch), sizing Redis memory against `maxmemory-policy` eviction storms, and validating cache-cold fallback so a Redis reboot doesn't melt the primary SQL cluster. |

---

## 4. Formal & Verified References

* [Anders Ericsson: Peak — Secrets from the New Science of Expertise](https://en.wikipedia.org/wiki/Deliberate_practice)
* [Michael Nygard: Release It! Design and Deploy Production-Ready Software (2nd Ed.)](https://pragprog.com/titles/mnee2/release-it-second-edition/)
* [Brendan Gregg: Systems Performance — Enterprise and the Cloud (2nd Ed.)](https://www.brendangregg.com/systems-performance-2nd-edition-book.html)
