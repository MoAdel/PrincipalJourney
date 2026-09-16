# Principal Technical Interview Scenarios: Distributed Systems

> "In a Staff/Principal interview, the interviewer tests whether you think in isolated algorithms or holistic, fault-tolerant distributed topologies."

---

### Interview Challenge 1: Design a Globally Distributed Shopping Cart
**Requirements**: Users travel internationally and switch between mobile and web. Cart items must never be lost. Zero distributed locks across regions.

**Principal Whiteboard Architecture**:
1. **Model State as an ORSet (CRDT)**: Each added item receives an immutable UUID tag. Deletes record the observed tag set.
2. **Local Regional Writes**: Users write to their closest region (sub-10ms response time).
3. **Asynchronous Cross-Region Gossip**: Regions exchange CRDT state vectors via background message broker channels.
4. **Deterministic Merge**: When states converge, the semilattice merge resolves additions and removals mathematically with zero lock contention.

---

### Interview Challenge 2: Diagnosing Sudden Database Connection Exhaustion
**Scenario**: Traffic increased by only 10%, but database active connections jumped from 50 to 1,000 (maximum pool ceiling), causing widespread timeouts. Redis CPU is at 2%.

**Principal Diagnostic Sequence**:
1. **Identify Cache Stampede**: Check if a single high-traffic cache key expired, causing thousands of concurrent worker threads to query the database simultaneously.
2. **Inspect Slow Query Logs**: Verify if lock contention on a shared table row caused query latency to climb from 10ms to 2 seconds. When query latency increases by $10	imes$, connection pool occupancy increases by $10	imes$ for the same request rate ($L = \lambda W$ — Little's Law).
3. **Remediation**: Deploy the XFetch probabilistic early expiration algorithm and wrap database calls in a Bulkhead semaphore.
