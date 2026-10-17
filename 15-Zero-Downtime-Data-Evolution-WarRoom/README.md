# Sprint 15 War Room: Zero-Downtime Data Evolution SEV-1 Incidents

> **Companion Track to**: `15-Zero-Downtime-Data-Evolution/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-SchM-Lock-Queue-Black-Friday-Freeze.md`](./01-Incident-SchM-Lock-Queue-Black-Friday-Freeze.md) | Metadata-only `ALTER TABLE` (`Sch-M`) queueing behind a 3m BI query (`Sch-S`) and blocking 100% of subsequent `NOLOCK`/RCSI OLTP traffic. | Suspecting SQL Server was physically rewriting 1.4B rows on disk. |
