# Sprint 16 War Room: Multi-Region & Disaster Recovery SEV-1 Incidents

> **Companion Track to**: `16-Multi-Region-And-Disaster-Recovery/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-Split-Brain-Geo-Failover-Double-Spend.md`](./01-Incident-Split-Brain-Geo-Failover-Double-Spend.md) | Single-vantage BGP flap triggering unfenced standby promotion (`18s` dual-primary overlap & `$640k` double-spend). | NOC celebrating a "5-second automated failover" while two primaries were active. |
