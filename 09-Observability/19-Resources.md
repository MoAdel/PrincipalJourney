# Curated Resources & Official References: Advanced Observability

This directory contains the authoritative, formal standards, specifications, and reference implementations used to design enterprise observability systems.

---

## 1. Official Standards & Specifications
- **W3C TraceContext Specification**: [https://www.w3.org/TR/trace-context/](https://www.w3.org/TR/trace-context/)
  - Official specification for `traceparent` and `tracestate` header formats.
- **W3C Baggage Specification**: [https://www.w3.org/TR/baggage/](https://www.w3.org/TR/baggage/)
  - Standard for cross-cutting application context propagation.
- **OpenTelemetry Specification (CNCF)**: [https://opentelemetry.io/docs/specs/otel/](https://opentelemetry.io/docs/specs/otel/)
  - API, SDK, semantic conventions, and OTLP wire protocols.
- **Semantic Conventions for CloudEvents & HTTP**: [https://opentelemetry.io/docs/specs/semconv/](https://opentelemetry.io/docs/specs/semconv/)
  - Standardized attribute names (`http.response.status_code`, `db.statement`).

---

## 2. Google SRE & Reliability Engineering
- **Site Reliability Engineering: How Google Runs Production Systems**: [https://sre.google/sre-book/table-of-contents/](https://sre.google/sre-book/table-of-contents/)
  - Chapter 4: Service Level Objectives
  - Chapter 6: Monitoring Distributed Systems
- **The Site Reliability Workbook**: [https://sre.google/workbook/table-of-contents/](https://sre.google/workbook/table-of-contents/)
  - Chapter 2: Implementing SLOs
  - Chapter 5: Alerting on SLOs (Multi-Window Multi-Burn-Rate mathematical derivation)

---

## 3. Microsoft .NET Diagnostics & Runtime Internals
- **.NET Diagnostics Documentation**: [https://learn.microsoft.com/en-us/dotnet/core/diagnostics/](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/)
  - `ActivitySource`, `Activity`, and `DiagnosticSource` APIs.
- **High-Performance Logging with Source Generators**: [https://learn.microsoft.com/en-us/dotnet/core/extensions/logger-message-generator](https://learn.microsoft.com/en-us/dotnet/core/extensions/logger-message-generator)
  - Compile-time zero-allocation `[LoggerMessage]` pattern.
- **System.Diagnostics.Metrics Specification**: [https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/metrics)
  - Instruments, listeners, and aggregation mechanics.
- **GitHub: dotnet/runtime Diagnostics Source Code**: [https://github.com/dotnet/runtime/tree/main/src/libraries/System.Diagnostics.DiagnosticSource](https://github.com/dotnet/runtime/tree/main/src/libraries/System.Diagnostics.DiagnosticSource)

---

## 4. Time-Series & Visualization Specifications
- **Prometheus Storage & TSDB Architecture**: [https://prometheus.io/docs/prometheus/latest/storage/](https://prometheus.io/docs/prometheus/latest/storage/)
  - Head chunk allocation, block compaction, and inverted index posting lists.
- **The USE Method (Brendan Gregg)**: [https://www.brendangregg.com/usemethod.html](https://www.brendangregg.com/usemethod.html)
  - Utilization, Saturation, and Errors methodology for resource analysis.
- **The RED Method (Tom Wilkie)**: [https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/)
  - Rate, Errors, and Duration methodology for microservices.
