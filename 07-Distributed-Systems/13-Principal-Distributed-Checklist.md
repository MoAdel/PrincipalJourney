# Principal Distributed Systems Production Release Checklist

> "An architect does not sign off on a multi-region deployment because it works in staging; they sign off when partition failovers, clock skews, and split-brain scenarios are tested under chaos."

---

## 1. Network Partition & Consensus Invariants
- [ ] **Quorum Verification**: All consensus clusters (Raft / Redis Sentinel / Zookeeper) have an odd number of voting nodes ($N \ge 3$) and require $Q = \lfloor N/2 floor + 1$ to elect leaders or commit state.
- [ ] **Split-Brain Prevention**: Nodes isolated in a minority partition are strictly configured to refuse writes or shut down gracefully.
- [ ] **Fencing Token Enforcement**: All distributed locks pass monotonically increasing tokens to downstream databases to reject stale writes from paused/zombie workers.

## 2. Distributed Caching & Memory Sizing
- [ ] **Stampede Mitigation**: High-frequency hot keys use probabilistic early expiration (XFetch) or single-flight mutexes.
- [ ] **Eviction Policy Aligned**: `maxmemory-policy` matches workload requirements (`volatile-lru` for mixed, `allkeys-lfu` for power-law).
- [ ] **Hash Tag Validation**: Multi-key Redis commands and Lua scripts use `{...}` hash tags to avoid cross-slot errors in Redis Cluster.

## 3. Consistency & Replication Boundaries
- [ ] **PACELC Classification Documented**: Every database workload is classified (e.g., Financial transactions = PC/EC; Product reviews = PA/EL).
- [ ] **No Raw Wall-Clock Conflict Resolution**: Physical timestamps (`DateTime.UtcNow`) are banned as the sole conflict resolver across independent master nodes.
- [ ] **CRDT Semilattice Verification**: Concurrent merge operations are proven Commutative, Associative, and Idempotent.

## 4. Resilience & Traffic Shaping
- [ ] **Circuit Breakers Armed**: Downstream HTTP and microservice calls are wrapped in circuit breakers with calibrated minimum throughput and sampling windows.
- [ ] **Bulkheads Isolated**: Slow external APIs have bounded semaphores to prevent ThreadPool starvation.
- [ ] **Distributed Rate Limiting**: APIs enforce atomic sliding-window rate limits via Redis Lua scripts with RFC-compliant HTTP 429 headers.
