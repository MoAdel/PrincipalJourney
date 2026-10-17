# Sprint 13 War Room: Frontend Architecture, RxJS Concurrency & Memory SEV-1 Incidents

> **Companion Track to**: `13-Frontend-Architecture/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-RxJS-SwitchMap-vs-MergeMap-Race-Condition.md`](./01-Incident-RxJS-SwitchMap-vs-MergeMap-Race-Condition.md) | `mergeMap` out-of-order HTTP responses overwriting fresher UI state + missing `takeUntilDestroyed` leaking `3.3 GB` of detached components. | Suspecting backend Redis/SQL of returning mismatched portfolio records. |
