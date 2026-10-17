# Sprint 11 War Room: DevOps, Containers & CI/CD SEV-1 Incidents

> **Companion Track to**: `11-DevOps-And-Pipelines/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-PID1-SIGTERM-Blackhole-Dropped-Connections.md`](./01-Incident-PID1-SIGTERM-Blackhole-Dropped-Connections.md) | Shell-form `ENTRYPOINT` (`/bin/sh` as `PID 1`) swallowing `SIGTERM` + `EndpointSlice` removal race condition causing rolling deploy `502`s. | Blaming .NET 9 Kestrel `ShutdownTimeout` ignoring `SIGTERM`. |
