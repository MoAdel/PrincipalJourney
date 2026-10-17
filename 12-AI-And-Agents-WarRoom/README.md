# Sprint 12 War Room: AI Architecture, Vector Databases & Autonomous Agents SEV-1 Incidents

> **Companion Track to**: `12-AI-And-Agents/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-HNSW-Vector-Index-RAM-OOM-Eviction.md`](./01-Incident-HNSW-Vector-Index-RAM-OOM-Eviction.md) | Unquantized `3,072`-dim `float32` HNSW index growing to `386 GB` on a `64 GB` RAM host (disk thrash). | Suspecting OpenAI returned corrupted `NaN` embedding vectors. |
| **02** | [`02-Incident-ReAct-Agent-Infinite-Tool-Loop-Token-Burn.md`](./02-Incident-ReAct-Agent-Infinite-Tool-Loop-Token-Burn.md) | Unbounded `while(true)` ReAct loop retrying a `500` tool 250 times (`$48,200` quadratic token burn). | FinOps suspecting a leaked OpenAI API key on GitHub. |
| **03** | [`03-Incident-RAG-Cross-Tenant-ACL-Leakage.md`](./03-Incident-RAG-Cross-Tenant-ACL-Leakage.md) | Unscoped Semantic Cache leaking cross-tenant answers + Post-Filtering ANN starving small tenants. | Suspecting LLM inference weights memorized another user's prompt. |
