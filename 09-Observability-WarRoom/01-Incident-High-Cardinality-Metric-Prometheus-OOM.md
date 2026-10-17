# Incident 01: The High-Cardinality Metric Explosion (`18M` Active Time Series) & Prometheus OOM

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: OpenTelemetry .NET 9 SDK + Prometheus / Managed Grafana Mimir Cluster  
> **Business Impact**: Total blindness during a production release — Prometheus cluster OOMKilled (`64GB RAM`) and API pods suffered +420MB Managed Heap bloat from unbounded `Histogram<double>` tag combinations  
> **Competencies Mastered**: Metric Cardinality Multiplication ($\prod |L_i|$), `Meter` Aggregator Memory Cap (`MaxCardinalityLimit`), Bounded `http.route` Templates vs. Raw `Request.Path`, Exemplars (`trace_id`)

---

## 🚨 1. The 03:10 AM Crisis Briefing

A developer added a custom OpenTelemetry `Histogram<double>` to measure API latency per customer and per order (`new KeyValuePair<string, object?>("customer_id", id)` and `("request_path", context.Request.Path)`). Within 25 minutes:

```text
[03:10:05] Observability Alert: Prometheus TSDB Head Block memory exceeded 64 GB -> OOMKilled!
[03:10:30] RED HERRING: SRE suspects "A rogue scrape target is returning a 5GB /metrics HTML response!"
[03:11:15] App Alert: Order-API pods memory jumped +450 MB; OpenTelemetry MetricReader dropping data!
```

> 📐 **Derive It (Fermi Mode): Combinatorial Label Cardinality Explosion**
> - **Inputs**: `UniqueCustomersInHour = 150000`, `HistogramBuckets = 15`, `HttpMethods = 4`, `StatusCodes = 5`, `BytesPerTimeSeriesInTSDB = 3584`
> - **Formula**: `ActiveTimeSeries = UniqueCustomersInHour * HistogramBuckets * HttpMethods * StatusCodes`
> - **Step-by-Step**:
>   1. In Prometheus/OpenTelemetry, every unique combination of label values $	imes$ histogram buckets creates an **independent Time Series** held in memory!
>   2. Total active series created in 1 hour: $150,000\text{ customers} \times 15\text{ buckets} \times 4\text{ methods} \times 5\text{ statuses} = 45,000,000\text{ time series}$ (even at 40% sparsity = **$18,000,000$ active time series**)!
>   3. At $\approx 3.5\text{ KB}$ per active head series in Prometheus TSDB: $18,000,000 \times 3.5\text{ KB} = 63,000,000\text{ KB} \approx 60.1\text{ GB of RAM}$ $ightarrow$ instant OOMKill of the entire monitoring stack!
> - **What-If Sensitivity**: Removing `customer_id` from metric labels (moving it to **Trace Spans / Structured Logs / Metric Exemplars**) and using the route template `/api/orders/{id}` (`25` static routes) instead of raw `/api/orders/98412` drops active time series from **`18,000,000` to `1,500`** (`5.2 MB` RAM — a **$12,000	imes$ reduction**)!

<!-- TELEMETRY_WIDGET: title="High-Cardinality TSDB Memory Explosion" metric1="Active Time Series (Millions)" metric2="Prometheus Head RAM (GB)" threshold="2.0M Series Safe Ceiling" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Query Prometheus TSDB status API to identify the top offending metric & label names!
curl -s http://prometheus:9090/api/v1/status/tsdb | jq '.data.seriesCountByMetricName[:5], .data.labelValueCountByLabelName[:5]'
# Output: "http_server_custom_duration_bucket": 17840000 | "customer_id": 149200 | "request_path": 310400
```

### Observed Culprit Code Snippet
```csharp
// ❌ CATASTROPHIC CARDINALITY BOMB: Unbounded IDs and raw URLs in Metric Tags!
RequestDurationHistogram.Record(elapsedMs,
    new("customer_id", userId),               // ❌ 150,000+ unique values!
    new("request_path", context.Request.Path) // ❌ /api/orders/1, /api/orders/2 -> infinite values!
);
```

<!-- PREDICT_GATE: Commit your hypothesis: Why do high-cardinality fields belong in Traces/Logs/Exemplars but NEVER in Metric Labels, and how do we link a p99 metric spike to a specific `customer_id` without putting `customer_id` in the metric? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Metrics vs. Logs/Traces Storage Physics
* **Metrics (TSDB)**: Indexed by **Label Set**. Designed for fast mathematical aggregation across time, requiring every unique label combination to live in an in-memory inverted index. Every label must have a small, finite domain (`< 100` values).
* **Traces & Structured Logs**: Indexed by **Timestamp / TraceId / Inverted Columnar Store**. Designed for infinite cardinality (`user_id`, `order_id`, `request_id`).
* **The Bridge — OpenTelemetry Exemplars**: When `RequestDurationHistogram.Record(elapsedMs)` runs inside an active `Activity` (Trace Span), OpenTelemetry automatically attaches a sampled **Exemplar (`trace_id`, `span_id`)** to the histogram bucket at zero cardinality cost! Clicking the $p99$ dot in Grafana jumps straight to the exact customer's distributed trace!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System.Diagnostics;
using System.Diagnostics.Metrics;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace PrincipalJourney.Observability.WarRoom;

public sealed class CardinalitySafeTelemetryMiddleware(RequestDelegate next, IMeterFactory meterFactory)
{
    private readonly Histogram<double> _durationHistogram = meterFactory
        .Create("PrincipalJourney.Api")
        .CreateHistogram<double>("http.server.request.duration", unit: "ms");

    public async Task InvokeAsync(HttpContext context)
    {
        long start = Stopwatch.GetTimestamp();
        try
        {
            await next(context);
        }
        finally
        {
            double elapsedMs = Stopwatch.GetElapsedTime(start).TotalMilliseconds;

            // 1. High-cardinality context goes onto the Activity (Trace Span), NEVER the Metric!
            Activity.Current?.SetTag("enduser.id", context.User.Identity?.Name);

            // 2. Metric uses strictly bounded Route Pattern ("/api/orders/{id}"), fallback to "UNMATCHED" (blocks 404 URL scanner attacks!)
            var routePattern = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? "UNMATCHED_ROUTE";

            var tags = new TagList
            {
                { "http.request.method", context.Request.Method },
                { "http.route", routePattern },
                { "http.response.status_code", context.Response.StatusCode }
            };

            _durationHistogram.Record(elapsedMs, tags);
        }
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (`customer_id` + `Request.Path`) | After (Bounded `http.route` + Trace Exemplars) | Validation & Rollback Procedure |
|---|---|---|---|
| **Active Time Series Count** | `18,000,000` (Prometheus OOM) | **`1,480`** (Constant $O(1)$ memory) | OTel Collector `filter/cardinality` processor + Prometheus `sample_limit: 10000` per scrape. |
| **404 Bot Scanner Resilience** | Creates 1M series on random `/wp-admin/xyz` | **Collapses all 404s into `1` series (`UNMATCHED_ROUTE`)** | Run fuzz scanner against staging; assert active series increases by `<= 1`. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"What happens if an attacker runs `gobuster` against our public API sending 500,000 requests to random non-existent URLs (`/hack1`, `/hack2`), and our middleware records `context.Request.Path` when `GetEndpoint()` is null?"*

**The Principal Defense**:
> *"That is a classic **Observability Denial-of-Service (Metrics Bomb)**! For `404 Not Found` requests, `context.GetEndpoint()` returns `null`. If you fall back to `context.Request.Path`, a simple `404` scanner creates 500,000 time series and crashes your monitoring stack! You must ALWAYS fall back to a constant string literal `"UNMATCHED_ROUTE"` when no route template matched."*

### Question 2 (The Second-Order Failure Mode):
> *"How do we protect the shared central Prometheus/Mimir cluster so a junior developer on one microservice can never crash observability for the whole company?"*

**The Principal Defense**:
> *"Enforce **Two-Tier Cardinality Quotas**: (1) In-process on the .NET OTel SDK, set `MeterProviderBuilder.SetMaxMetricStreams(2000)` so an offending service caps its own memory at 2,000 streams and emits an `otel.sdk.metric_overflow` warning. (2) On the Prometheus scrape config / OTel Collector, set `sample_limit: 15000` per pod so a runaway pod's scrape is rejected in isolation without OOMing the central TSDB!"*

### Question 3 (The FinOps / Cost Axis):
> *"Datadog / New Relic is billing us $44,000/month for custom metrics because someone tagged `pod_name` and `container_id` on 200 application histograms across ephemeral autoscaling pods. Defend the 80%-good fix."*

**The Principal Defense**:
> *"Application business/SLI metrics (`http.server.request.duration`) only need `service.name`, `deployment.environment`, `http.route`, and `status_code` for SLO alerting! Dropping ephemeral `pod_name`/`container_id` labels from high-bucket histograms in the **OpenTelemetry Collector `metricstransform` processor** before SaaS export cuts custom metric series volume by **92%**, saving **$40,480/month** immediately while keeping node/pod infrastructure metrics in low-cost local Prometheus!"*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0901 — High-Cardinality Metric Explosion & Prometheus OOM

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 5 minutes | **Mitigation Latency (TTM)**: 18 minutes

## Five Whys Root Cause Chain
1. **Why did Prometheus crash with OOM?** -> Active time series count exploded from 45,000 to 18,000,000 in 25 minutes.
2. **Why did 18M series get created?** -> A histogram recorded `customer_id` and raw `Request.Path` as metric labels.
3. **Why wasn't the scrape rejected before crashing the server?** -> `sample_limit` was not configured on the Prometheus scrape job.
4. **Why did the developer put `customer_id` on a metric?** -> They wanted to find slow customer requests and didn't know about OpenTelemetry Exemplars (`trace_id`).
5. **Why didn't staging catch it?** -> Staging load test used a single static test user (`customer_id = "test-1"`).

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Remove unbounded tags; use `RouteEndpoint.RoutePattern.RawText ?? "UNMATCHED"` | All Teams | Roslyn analyzer bans `Request.Path` inside `Histogram.Record` / `Counter.Add` |
| P0 | Configure `SetMaxMetricStreams(2000)` in .NET SDK & `sample_limit: 15000` in Prometheus | SRE Team | Verified in staging metric bomb test |
```
