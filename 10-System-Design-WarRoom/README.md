# Sprint 10 War Room: Large-Scale System Design, Partitioning & Consistency SEV-1 Incidents

> **Companion Track to**: `10-System-Design/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-Hot-Partition-Celebrity-Shard-Meltdown.md`](./01-Incident-Hot-Partition-Celebrity-Shard-Meltdown.md) | Single hot `EventId` hitting 1 physical partition (`5,000 RU/s` cap) while cluster sat at `14%` RU. | Doubling total cluster RUs from `100k` to `200k` expecting `429`s to stop. |
| **02** | [`02-Incident-Global-Replication-Lag-Read-Your-Writes-Bug.md`](./02-Incident-Global-Replication-Lag-Read-Your-Writes-Bug.md) | Blind `GET -> Async Replica` routing returning `404` `80ms` after `POST /checkout` (`950ms` lag). | Frontend suspecting `POST /checkout` returned `201` before SQL commit. |
| **03** | [`03-Incident-Rate-Limiter-Redis-Fail-Closed-Global-Outage.md`](./03-Incident-Rate-Limiter-Redis-Fail-Closed-Global-Outage.md) | Serial fail-closed Redis rate limiter turning a 4-minute Redis maintenance into a 100% HTTP 500 blackout. | On-call believing all 40 backend microservices crashed simultaneously. |
