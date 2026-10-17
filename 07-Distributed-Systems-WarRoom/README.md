# Sprint 07 War Room: Distributed Caching, Locking & Resilience SEV-1 Incidents

> **Companion Track to**: `07-Distributed-Systems/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-Redis-Cache-Stampede-DB-Death-Spiral.md`](./01-Incident-Redis-Cache-Stampede-DB-Death-Spiral.md) | 15-minute hot-key TTL expiration causing 9,000 concurrent SQL cache-miss queries in `250ms`. | DBA suspicion of a malicious 15-minute cron job. |
| **02** | [`02-Incident-Redlock-GC-Pause-Fencing-Token-Split-Brain.md`](./02-Incident-Redlock-GC-Pause-Fencing-Token-Split-Brain.md) | GC + CFS CPU throttling pause exceeding 5s Redis lock TTL without monotonic Fencing Tokens. | Assuming 5-node Redlock prevents post-pause zombie writes. |
| **03** | [`03-Incident-Circuit-Breaker-Cascading-Retry-amplification.md`](./03-Incident-Circuit-Breaker-Cascading-Retry-amplification.md) | Nested 3-tier retries ($4^3 = 64	imes$) amplifying `3,000 RPS` into `192,000 RPS` internal DDoS. | SecOps alert claiming an internal East-West botnet attack. |
