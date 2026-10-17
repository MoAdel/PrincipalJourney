# Incident NN: <Evocative Incident Title>

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: <Cloud / Kubernetes / Runtime / DB Hardware Spec>  
> **Business Impact**: <Derived $ impact / SLO burn / User blast radius>  
> **Competencies Mastered**: <Comma-separated deep technical competencies>

---

## 🚨 1. The 0X:XX AM Crisis Briefing

<Narrative hook describing the trigger event, partial telemetry signals, and ONE misleading red-herring metric that tempts a naive diagnosis.>

```text
[Timestamp] <Alert 1: Symptom>
[Timestamp] <Alert 2: Red Herring Metric>
[Timestamp] <Alert 3: Secondary Cascade>
```

> 📐 **Derive It (Fermi Mode)**
> - **Inputs**: `RPS = <X>`, `Payload/Row Size = <Y>`, `Concurrency/Timeout = <Z>`
> - **Derivation**: $\text{Resource Consumption} = \text{RPS} \times \text{Latency} \times \text{Unit Cost}$
> - **Result**: Matches observed exhaustion threshold at `<Derived Value>`.
> - **What-If**: Now change input `<X>` by $5\times$ — does your mitigation still hold, or does a secondary bottleneck trigger first?

<!-- TELEMETRY_WIDGET: title="<Incident Telemetry>" metric1="<Primary Metric>" metric2="<Secondary Metric>" threshold="<Critical Limit>" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
Run these exact commands to isolate the fault and rule out the red herring:

```bash
# Step 1: Inspect live runtime / OS / socket / container state
<copy-pasteable command 1>

# Step 2: Capture targeted counters / stack / DMV state
<copy-pasteable command 2>

# Step 3: Verify why the red herring metric was misleading
<copy-pasteable command 3>
```

### Observed Telemetry & Culprit Code Snippet
```csharp
// Culprit production code or query
```

<!-- PREDICT_GATE: Formulate your root-cause hypothesis and identify why the initial alert was a red herring before unlocking Section 3. -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Primary Mechanical Failure
<Explain the exact runtime, kernel, storage engine, or protocol state-machine mechanics.>

### 2. Why the Red Herring Fooled On-Call
<Explain why the misleading metric appeared and why treating it directly would have worsened the outage.>

### 3. Second-Order Cascade Effects
<Explain how the local fault amplified across retry loops, thread pools, connection pools, or downstream dependencies.>

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

### Production Refactor
```csharp
// Production-grade, zero-regression refactored implementation
```

### Minimal Chaos Repro Lab (`docker-compose` / Load Script)
```bash
# Repro & verification command sequence
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (The Incident) | After (Principal Refactor) | Validation & Rollback Procedure |
|---|---|---|---|
| **Primary Latency (p99)** | `<Before>` | `<After>` | Validate via canary shadow traffic; rollback via feature flag if `<Metric>` exceeds `<Threshold>`. |
| **Resource / Memory / IOPS** | `<Before>` | `<After>` | Monitor `<Counter>` for 30m under 2x peak load; revert deployment if saturation > 60%. |
| **Throughput / Error Rate** | `<Before>` | `<After>` | Automated SLO burn-rate gate halts rollout if 5m error rate > 0.1%. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"<Aggressive question proposing a naive config tweak or hardware scale-up>"*

**The Principal Defense**:
> *"<Mechanical explanation of why the naive fix fails or shifts the bottleneck, backed by math.>"*

### Question 2 (The Second-Order Failure Mode):
> *"<Challenge on what happens when a downstream dependency or network partition occurs under the new design>"*

**The Principal Defense**:
> *"<Defense detailing failure containment, bulkhead isolation, and deterministic fallback behavior.>"*

### Question 3 (The FinOps / Cost Axis):
> *"This textbook architecture is technically pure, but we are killing it because it costs $X/month. Defend the 80%-good alternative at 20% of the cost."*

**The Principal Defense**:
> *"<Pragmatic unit-economics defense comparing the $X/month textbook solution against the 80%-good architecture, specifying the exact scale inflection point where upgrading becomes financially justified.>"*

---

## 📜 6. Deliverable: Blameless Post-Mortem & ADR

```markdown
# Post-Mortem: <Incident ID & Title>

- **Date / Severity**: 2026-XX-XX | SEV-1
- **Detection Latency (TTD)**: <X> minutes | **Mitigation Latency (TTM)**: <Y> minutes
- **SLO Burn**: <Z>% of 30-day error budget consumed

## Five Whys Root Cause Chain
1. **Why did customer requests fail?** -> <Immediate symptom>
2. **Why did that resource saturate?** -> <Proximate technical cause>
3. **Why did the runtime/engine behave that way?** -> <Deep mechanical cause>
4. **Why didn't staging/CI catch it?** -> <Testing/load-profile gap>
5. **Why did on-call lose 15 minutes at the start?** -> <Red-herring observability gap>

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | <Immediate code/index/config fix> | Principal Eng | NetArchTest / CI Linter rule added |
| P1 | <Alerting update to eliminate red herring> | SRE Lead | Burn-rate alert wired to PagerDuty |
| P2 | <Chaos repro test added to release pipeline> | Platform Team | Nightly k6 load test gate |
```
