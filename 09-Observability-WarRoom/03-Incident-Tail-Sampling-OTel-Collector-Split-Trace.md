# Incident 03: The Load-Balanced OTel Collector Tail-Sampling Split-Trace Bug

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: 8-Replica OpenTelemetry Collector Gateway (`tail_sampling` processor) / 30 Microservices  
> **Business Impact**: 87.5% (`7/8`) of spans belonging to failed HTTP 500 traces were silently discarded, leaving broken orphan fragments in Grafana Tempo during incident triage  
> **Competencies Mastered**: Head Sampling vs. Tail Sampling, TraceID-Aware Load Balancing Exporter (`loadbalancingexporter`), OTel Collector 2-Tier Topology (DaemonSet Agent $ightarrow$ TraceID-Routed Gateway)

---

## 🚨 1. The 11:15 AM Crisis Briefing

To capture 100% of error traces while sampling only 1% of successful traces, the team deployed 8 replicas of the **OpenTelemetry Collector** behind a standard Kubernetes Round-Robin Service (`ClusterIP`) with the `tail_sampling` processor enabled. During a production bug, engineers opened Grafana Tempo and found every single error trace was missing 7 out of 8 microservice hops!

```text
[11:15:10] Triage Complaint: "Trace 7a9f... shows API-Gateway (200 OK) -> [MISSING] -> [MISSING] -> Payment-DB (Error)!"
[11:15:30] RED HERRING: Developer claims "HttpClient is forgetting to propagate the W3C traceparent header 87.5% of the time!"
[11:16:05] Architecture Reality: 8 OTel Collector replicas behind Round-Robin ClusterIP = 7/8 of spans land on collectors that never saw the error span!
```

> 📐 **Derive It (Fermi Mode): Probability of Complete Trace Under Round-Robin Tail Sampling**
> - **Inputs**: `CollectorReplicas = 8`, `SpansInTrace = 6`, `ErrorSpanCount = 1`, `BaseSampleRate = 0.01`
> - **Formula**: `SingleSpanCoLocationProb = 1 / CollectorReplicas`
> - **Step-by-Step**:
>   1. **Tail Sampling** must hold all spans of a `TraceId` in memory for `decision_wait: 10s` and check if **any** span in that trace had `status == ERROR`.
>   2. With 8 Collector pods behind a standard Round-Robin load balancer, when 6 microservices emit 6 spans for `TraceId = X`, each span is routed randomly to 1 of the 8 collectors!
>   3. Collector #3 receives the `Payment-Service` span (which has `status == ERROR`) and keeps it.
>   4. Collectors #1, #2, #4, #5, #6, #7, #8 receive the other 5 upstream spans (`status == OK`). Because those 7 collectors **never saw the error span on Collector #3**, they evaluate the trace as `100% OK` and **drop `99%` of those upstream spans (`7/8 = 87.5%` missing spans)**!
>   5. Probability that all 6 spans randomly land on the same collector: $\left(\frac{1}{8}\right)^{5} = \frac{1}{32,768} = 0.003\%$!
> - **What-If Sensitivity**: Adding a Tier-1 **OTel Collector Agent DaemonSet** using the **`loadbalancing` exporter (`routing_key: traceID`)** hashes `TraceId` deterministically via consistent hashing so **100% of spans for `TraceId = X` land on the exact same Tail-Sampling Collector replica**!

<!-- TELEMETRY_WIDGET: title="Round-Robin Tail Sampling Trace Fragmentation" metric1="Complete Error Traces (%)" metric2="Orphaned Spans Dropped (%)" threshold="100% Trace Completeness Target" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Rule out the "Missing W3C traceparent" Red Herring — inspect outbound headers in tcpdump/logs
kubectl logs -n prod -l app=order-api --tail=20 | grep "traceparent"
# Output: 100% of requests carry valid '00-4bf92f3577b34da6a3ce929d0e0e4736-...' headers!

# Step 2: Check OTel Collector Gateway service type and missing loadbalancing exporter
kubectl get svc otel-collector-gateway -n monitoring -o yaml
# Output: Standard ClusterIP round-robin service! Each pod receives random spans of the same TraceId!
```

### Observed Culprit OTel Architecture
```text
❌ BROKEN ROUND-ROBIN TAIL-SAMPLING TOPOLOGY:
[App Pod 1 (Span A: OK)]    ──┐
[App Pod 2 (Span B: OK)]    ──┼──► [K8s ClusterIP (Round-Robin)] ──► [Collector #1 (Sees only Span A -> DROPS!)]
[App Pod 3 (Span C: ERROR)] ──┘                                  ──► [Collector #3 (Sees only Span C -> KEEPS!)]
```

<!-- PREDICT_GATE: Commit your hypothesis: Why does stateful `tail_sampling` mathematically require `routing_key: traceID` consistent hashing across collector replicas, and how do we build the 2-Tier Collector topology? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why Head Sampling Is Stateless but Tail Sampling Is Stateful
* **Head Sampling (`ParentBased(TraceIdRatioBased)`)**: The decision (`sampled = 01` or `00` in the W3C `traceparent` flags byte) is made at the very first ingress hop and propagated in the HTTP header to all downstream services. Stateless, cheap, **but cannot know in advance if hop #6 will throw an exception 200ms later**!
* **Tail Sampling**: Waits until the trace finishes (`decision_wait: 10s`) to keep 100% of errors and high-latency traces. Because the decision is made *after* spans are emitted by 6 different pods, **all spans sharing the same `trace_id` MUST be routed to the same Collector memory space** via consistent hashing!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```yaml
# Tier 1: Node-Local DaemonSet OTel Agent (Routes by TraceID Consistent Hash!)
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317

exporters:
  loadbalancing:
    routing_key: "traceID" # CRITICAL: Consistent-hashes 100% of spans for a TraceId to the SAME Gateway Pod!
    protocol:
      otlp:
        tls:
          insecure: true
    resolver:
      dns:
        hostname: otel-tail-sampler-headless.monitoring.svc.cluster.local
        interval: 5s

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [loadbalancing]
---
# Tier 2: Stateful Tail-Sampling Gateway Collector (Receives complete traces!)
processors:
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    policies:
      - name: keep-all-errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: keep-slow-p99-traces
        type: latency
        latency: { threshold_ms: 500 }
      - name: sample-1-percent-happy-path
        type: probabilistic
        probabilistic: { sampling_percentage: 1.0 }
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (Round-Robin ClusterIP) | After (`loadbalancing` Exporter `routing_key: traceID`) | Validation & Rollback Procedure |
|---|---|---|---|
| **Multi-Hop Error Trace Completeness** | `0.003%` (`87.5%` spans missing) | **`100.0%`** (All spans co-located) | Synthetic 6-hop error probe verifies all 6 spans present in Tempo. |
| **Trace Storage Cost vs. 100% Head Sampling** | N/A | **`-94%` Storage Cost** (`100%` errors + `1%` happy path) | Fallback to `10%` Head Sampling if Gateway memory > 80%. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why run a 2-tier Collector topology when we can just scale the Tail-Sampling Collector down to `replicas: 1` on a giant 64-core VM so all spans go to one box?"*

**The Principal Defense**:
> *"A single collector instance (`replicas: 1`) is a Single Point of Failure across 30 microservices and hits vertical lock contention at ~50,000 spans/sec. With the `loadbalancing` exporter (`routing_key: traceID`) + a Headless Kubernetes Service, we scale horizontally to 8, 16, or 32 stateless/stateful collector pods across 3 AZs: if Collector #4 dies, consistent hashing automatically re-routes only $rac{1}{N}$ of in-flight traces to surviving pods in `< 5 seconds`."*

### Question 2 (The Second-Order Failure Mode):
> *"What happens if a background batch job creates a single root trace and attaches 500,000 child spans to the same `TraceId`?"*

**The Principal Defense**:
> *"A 500,000-span 'Mega-Trace' routed by `traceID` will pin a single Tail-Sampling Collector pod's memory and overflow its buffer! Two defenses: (1) Batch loops must **never** create 500,000 child spans under one `TraceId` — each batch item should start a new root trace linked back to the batch parent via **`ActivityLink` (`SpanLink`)**! (2) Set `max_spans_per_trace: 2000` in the OTel Collector config."*

### Question 3 (The FinOps / Cost Axis):
> *"Our commercial SaaS APM vendor wants us to ship 100% of unsampled spans from our cluster across the internet to their cloud so their cloud can do tail sampling (charging us $0.09/GB in cloud NAT egress + ingest fees = $19,000/month). Defend the in-cluster alternative."*

**The Principal Defense**:
> *"Shipping `99%` of routine `200 OK` spans out of our cloud VPC just so a SaaS vendor can throw them away on their servers burns `$19,000/month` in pure cloud egress bandwidth! Running the `tail_sampling` processor inside our own cluster drops the `99%` happy-path noise **before a single byte leaves our VPC**, cutting egress and SaaS ingest bills by **94%**!"*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0903 — Load-Balanced Tail-Sampling Split-Trace Bug

- **Date / Severity**: 2026-10-17 | SEV-2
- **Detection Latency (TTD)**: 15 minutes | **Mitigation Latency (TTM)**: 28 minutes

## Five Whys Root Cause Chain
1. **Why were error traces missing 87.5% of their spans?** -> 7 out of 8 collector replicas dropped the non-error spans of those traces.
2. **Why didn't those 7 collectors know the trace had an error?** -> The error span landed on Collector #3, while upstream spans landed on Collectors #1–#8.
3. **Why were spans of the same TraceId scattered across replicas?** -> App pods exported directly to a Round-Robin Kubernetes `ClusterIP` service.
4. **Why did Round-Robin break Tail Sampling?** -> Tail sampling is stateful per `TraceId` and requires consistent hashing (`routing_key: traceID`).
5. **Why did developers suspect broken W3C header propagation?** -> Tempo UI rendered broken parent-child trees identical in appearance to missing `traceparent` headers.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Deploy `loadbalancingexporter` (`routing_key: traceID`) + Headless Service for Tail Sampling | Observability Team | Synthetic multi-hop trace test verifies 100% span retention on error |
```
