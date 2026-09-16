# Learning Objectives & Distributed Systems Competencies

> "A Senior Engineer designs for the happy path where nodes respond in 2 milliseconds. A Principal Engineer designs for the adversarial physical universe where networks partition, clocks drift, and GC pauses create zombie masters."

---

## 1. Core Competencies Matrix

| Competency Area | Junior / Mid | Senior Engineer | Principal Software Engineer |
|---|---|---|---|
| **CAP & PACELC** | Recites "Pick any two". | Understands CP vs AP trade-offs in cloud databases. | Formally evaluates systems using Abadi's PACELC; designs hybrid boundaries where financial paths are CP and catalog views are PA/EL. |
| **Distributed Consensus** | Thinks leader election is just an if-statement. | Knows Raft / Paxos basics and cluster quorums. | Analyzes split-brain quorum math ($N/2 + 1$), term epochs, log divergence, and Byzantine fault boundaries. |
| **Distributed Caching** | Uses memory cache without invalidation strategy. | Implements Cache-Aside with Redis. | Eliminates Cache Stampedes (Thundering Herds) using probabilistic early expiration (XFetch) and single-flight mutexes; tunes Redis event-loop memory mechanics. |
| **Distributed Locking** | Uses basic Redis `SETNX`. | Implements Redlock with TTL. | Evaluates Martin Kleppmann's critique of Redlock; defends against clock drift, hypervisor pauses, and GC stalls using monotonic Fencing Tokens. |
| **Consistency & CRDTs** | Assumes eventual consistency means "eventually correct". | Uses Last-Write-Wins (LWW) with timestamps. | Proves why NTP clock drift corrupts LWW; models state mutations as bounded semilattices using Conflict-free Replicated Data Types (PN-Counters, ORSets). |
| **Fault Resilience** | Wraps HTTP calls in generic retries. | Configures basic Polly retry policies. | Engineers multi-tiered resilience pipelines: adaptive circuit breakers, bulkhead thread compartmentalization, and distributed sliding-window rate limiters. |

---

## 2. Sprint Milestones & Deliverables

By the end of Sprint 07, you will have designed, implemented, and defended:

1. **Probabilistic Early Expiration Engine (XFetch)**: Eliminating the Cache Stampede (Thundering Herd) problem under 50,000 RPS without global locking.
2. **Redlock with Monotonic Fencing Tokens**: A mutual exclusion harness that prevents zombie worker writes during process pauses and network delays.
3. **Conflict-Free Replicated Data Type (CRDT)**: A state-based PN-Counter and Observed-Removed Set (ORSet) for multi-region cart synchronization without distributed locks.
4. **Polly v8 Production Resilience Pipeline**: Combining rate limiters, circuit breakers, hedging, and bulkhead isolation into a zero-allocation .NET 9 pipeline.
5. **Distributed Sliding Window Rate Limiter**: High-precision token/sliding-window traffic shaper executed atomically via Redis Lua scripts.

---

## 3. Formal & Verified References

* [Eric Brewer (2000, 2012): CAP Twelve Years Later: How the "Rules" Have Changed (IEEE Computer)](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/)
* [Seth Gilbert & Nancy Lynch (2002): Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services (ACM SIGACT)](https://groups.csail.mit.edu/tds/papers/Lynch/MIT-LCS-TR-858.pdf)
* [Daniel Abadi (2012): Consistency Tradeoffs in Modern Distributed Database System Design: CAP is Only Part of the Story (IEEE Computer)](https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf)
* [Martin Kleppmann: Designing Data-Intensive Applications (O'Reilly)](https://dataintensive.net/)
* [Marc Shapiro et al. (2011): Conflict-Free Replicated Data Types (INRIA Research Report)](https://inria.hal.science/inria-00609399/document)
