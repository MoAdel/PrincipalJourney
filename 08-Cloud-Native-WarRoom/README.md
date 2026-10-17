# Sprint 08 War Room: Cloud-Native, Kubernetes & Networking SEV-1 Incidents

> **Companion Track to**: `08-Cloud-Native/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-SNAT-Port-Exhaustion-Outbound-Blackout.md`](./01-Incident-SNAT-Port-Exhaustion-Outbound-Blackout.md) | `new HttpClient()` per request exhausting 1,024 pre-allocated Standard LB SNAT ports (`TIME_WAIT`). | Blaming simultaneous Stripe and Tax API global outages. |
| **02** | [`02-Incident-KEDA-Scale-To-Zero-Cold-Start-Avalanche.md`](./02-Incident-KEDA-Scale-To-Zero-Cold-Start-Avalanche.md) | Missing `startupProbe` + `500m` CPU CFS throttling causing `livenessProbe` to kill cold-JITting pods at `11s`. | Suspecting a SQL connection deadlock in `Program.cs`. |
| **03** | [`03-Incident-KeyVault-Throttling-Startup-CrashLoop.md`](./03-Incident-KeyVault-Throttling-Startup-CrashLoop.md) | 100 rebooting pods fetching 45 unfiltered secrets (`4,600 RPCs/5s`) hitting KeyVault's `2,000/10s` `429` ceiling. | Suspecting Ubuntu node IMDS Managed Identity failure. |
