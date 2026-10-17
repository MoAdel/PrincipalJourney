# Sprint 06 War Room: Messaging, Outbox & Distributed Saga SEV-1 Incidents

> **Companion Track to**: `06-Messaging/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-Poison-Message-DLQ-Retry-Avalanche.md`](./01-Incident-Poison-Message-DLQ-Retry-Avalanche.md) | `PrefetchCount = 50` expiring broker PeekLocks in memory buffer before slow handler starts. | ERP team blaming duplicate producer publishes. |
| **02** | [`02-Incident-Outbox-Table-Bloat-Lock-Escalation.md`](./02-Incident-Outbox-Table-Bloat-Lock-Escalation.md) | Unfiltered Outbox index + `500k`-row `DELETE` triggering Exclusive (`X`) Table Lock Escalation. | Network/Storage admin citing `0.4ms` disk latency. |
| **03** | [`03-Incident-Saga-Zombie-Compensation-Split-Brain.md`](./03-Incident-Saga-Zombie-Compensation-Split-Brain.md) | Missing `xmin` concurrency + late `PaymentCaptured` arriving after `PaymentTimeoutExpired`. | Warehouse team blaming physical barcode scanner firmware. |
