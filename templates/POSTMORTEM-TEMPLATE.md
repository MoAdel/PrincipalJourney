# Blameless Post-Mortem Template (Principal Standard)

> **Incident ID**: `INC-2026-XXXX`  
> **Severity**: `SEV-1`  
> **Incident Commander**: `<Role/Name>`  
> **Lead Architect**: `<Role/Name>`

---

## 1. Executive Impact Summary (Fermi Verified)
- **Duration**: `XX minutes` (`HH:MM UTC` to `HH:MM UTC`)
- **Customer Blast Radius**: `XX.X%` of active requests on `<Service/Tier>`
- **Financial & SLA Impact**:
  > 📐 **Derive It**: $\text{Lost Revenue} = \text{Peak RPS} \times \text{Duration (s)} \times \text{Conversion Rate} \times \text{Avg Order Value}$
- **Error Budget Consumed**: `XX%` of monthly `99.95%` availability budget (`21.6m` total monthly allowance).

---

## 2. Detection & Recovery Timeline
| Timestamp (UTC) | Signal / Event | Actor | Notes / Misdirection |
|---|---|---|---|
| `T+00m` | Trigger event deployed or traffic pattern shifted | System | Silent degradation begins |
| `T+03m` | Multi-window burn-rate alert fires (2% budget in 1h) | Alerting | On-call paged |
| `T+07m` | Initial hypothesis formed (`<Red Herring>`) | On-Call | Disproved via `<Diagnostic Command>` |
| `T+14m` | True root cause isolated via `<Tool/DMV/Trace>` | Principal | Confirmed mechanical bottleneck |
| `T+19m` | Mitigation deployed (`<Rollback / Feature Flag / Config>`) | On-Call | p99 latency returns to baseline |

---

## 3. Root Cause Analysis & The Five Whys
1. **Why did the customer experience errors?**
2. **Why did the service exhaust `<Resource>`?**
3. **Why did the underlying engine/runtime enter that state?**
4. **Why did pre-production load testing miss this vector?**
5. **Why did telemetry initially point toward `<Red Herring>`?**

---

## 4. Mitigation Trade-Off & Validation Matrix
| Option Considered | Latency Impact | Monthly Cost | Validation in Prod | Rollback Trigger |
|---|---|---|---|---|
| **Option A (Chosen)** | `<Impact>` | `$<Cost>` | `<Canary/Shadow check>` | `<Metric > Threshold>` |
| **Option B (80% Good / Low Cost)** | `<Impact>` | `$<Cost>` | `<Canary/Shadow check>` | `<Metric > Threshold>` |
| **Option C (Rejected Naive Fix)** | `<Impact>` | `$<Cost>` | N/A | N/A |

---

## 5. Preventative Action Items (CI & Architecture Gates)
- [ ] **P0 (Code/Infra)**: `<Concrete fix>` — *Owner: `<Team>`* — *Gate: `<Automated Test>`*
- [ ] **P1 (Observability)**: `<Replace symptom alert with causal saturation alert>` — *Owner: `<Team>`*
- [ ] **P2 (Governance)**: `<NetArchTest / Linter rule preventing anti-pattern>` — *Owner: `<Team>`*
