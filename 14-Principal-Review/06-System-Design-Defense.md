# Principal Systems Design Live Challenge Defense

> "In a Principal technical interview or promotion panel, you are not asked to write code.
>
> You are given an ambiguous, high-scale mission and evaluated on your ability to drive requirements, formulate capacity math, design resilient boundaries, and defend hard trade-offs under interrogation."

---

## The 5-Stage Live Defense Framework

1. **Phase 1: Scope & Non-Functional Boundaries (5 mins)**:
   - Clarify DAU, read/write ratio, latency SLA, consistency requirements (ACID vs Eventual).
2. **Phase 2: Back-of-the-Envelope Calculations (5 mins)**:
   - Compute QPS, write throughput (MB/s), 5-year storage capacity, and network egress bandwidth.
3. **Phase 3: High-Level Solution Topology (10 mins)**:
   - Draw end-to-end data flow: DNS, Anycast CDN, API Gateway, Services, Storage, Caching.
4. **Phase 4: Deep Dive into Critical Bottlenecks (15 mins)**:
   - Detailed schema design, partition/shard keys, concurrency control, caching invalidation algorithms.
5. **Phase 5: Resiliency & Failure Defense (10 mins)**:
   - Address partition splits, regional cloud blackouts, dead-letter storm handling, and blue/green promotion.
