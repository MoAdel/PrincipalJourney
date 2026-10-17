# Sprint 09 War Room: Observability, OpenTelemetry & TSDB SEV-1 Incidents

> **Companion Track to**: `09-Observability/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-High-Cardinality-Metric-Prometheus-OOM.md`](./01-Incident-High-Cardinality-Metric-Prometheus-OOM.md) | `customer_id` + raw `Request.Path` in Histogram tags generating `18M` time series & `60GB` TSDB OOM. | Suspecting a rogue scrape target returning huge HTML. |
| **02** | [`02-Incident-Sync-Log-Sink-Thread-Pool-Blockade.md`](./02-Incident-Sync-Log-Sink-Thread-Pool-Blockade.md) | Synchronous network `ILogger` sink blocking all 64 Kestrel threads when Elasticsearch stalled. | Suspecting a Payment Database lock/outage. |
| **03** | [`03-Incident-Tail-Sampling-OTel-Collector-Split-Trace.md`](./03-Incident-Tail-Sampling-OTel-Collector-Split-Trace.md) | Round-Robin `ClusterIP` scattering spans of the same `TraceId` across 8 stateful `tail_sampling` collectors. | Blaming `HttpClient` W3C `traceparent` header propagation. |
