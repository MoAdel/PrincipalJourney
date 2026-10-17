# Incident 02: The KEDA Scale-Up JIT Cold-Start & Aggressive Liveness Probe Death Spiral

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Azure Container Apps / AKS + KEDA Autoscaler (.NET 9 Order Worker)  
> **Business Impact**: Every morning at 09:00 AM traffic ramp, newly scaled pods enter an infinite `Killing -> Restarting` loop (`Exit 137`) and zero new capacity comes online for 22 minutes  
> **Competencies Mastered**: Kubernetes `startupProbe` vs. `livenessProbe`, .NET 9 Tiered PGO / ReadyToRun (R2R) JIT Compilation CPU Spike, KEDA `cooldownPeriod` & `minReplicaCount`

---

## 🚨 1. The 09:02 AM Crisis Briefing

To save money overnight, the team configured KEDA to scale the API from `minReplicaCount: 1` to `maxReplicaCount: 40` based on HTTP request concurrency (`> 50`). At `09:00 AM`, traffic jumped to `3,500 RPS`. KEDA requested 35 new pods, **none of which ever survived past 15 seconds**:

```text
[09:00:15] KEDA Event: Scaled deployment order-api from 1 to 36 replicas.
[09:00:32] Kubelet Warning: Liveness probe failed: HTTP probe timed out after 1s. Container order-api failed liveness probe, will be restarted!
[09:00:48] RED HERRING: Developer claims "There is a deadlock in Program.cs startup when connecting to SQL!"
[09:01:20] Cluster Status: 35 pods stuck in CrashLoopBackOff; 1 surviving pod crushed under 3,500 RPS!
```

> 📐 **Derive It (Fermi Mode): Cold-Boot JIT CPU Contention vs. Liveness Probe Deadline**
> - **Inputs**: `MethodsToJitOnWarmup = 4200`, `JitCpuTimeMs = 6800`, `PodCpuLimitCores = 0.5`, `LivenessDeadlineSec = 12`
> - **Formula**: `WallClockBootAndJitSec = (JitCpuTimeMs / 1000) / PodCpuLimitCores`
> - **Step-by-Step**:
>   1. When a cold pod starts without **ReadyToRun (R2R)** pre-compilation and immediately receives live traffic before warmup completes, RyuJIT must compile `4,200` framework/EF Core/JSON methods on the fly (`6,800ms` of CPU work).
>   2. Because the pod was throttled to `limits.cpu: 500m` (`0.5 vCore`), `6.8s` of CPU work took $\frac{6.8}{0.5} = 13.6\text{ seconds}$ of wall-clock time!
>   3. The Kubernetes `livenessProbe` was configured with `initialDelaySeconds: 5, periodSeconds: 3, failureThreshold: 2, timeoutSeconds: 1` (killing the pod at $5 + 6 = 11\text{ seconds}$!).
>   4. Every pod was **killed by `kubelet` at `11.0s` — just `2.6 seconds` before it would have finished JITting**!
> - **What-If Sensitivity**: Adding a dedicated **`startupProbe`** (`failureThreshold: 30, periodSeconds: 2` = `60s` startup budget) + enabling **`PublishReadyToRun=true`** + removing `limits.cpu` (or setting CPU Startup Boost) reduces cold-start readiness to **`2.1 seconds`** with **zero premature liveness kills**!

<!-- TELEMETRY_WIDGET: title="Liveness Probe vs Cold-Start JIT Race" metric1="Pod Startup Duration (s)" metric2="Liveness Kills / min" threshold="11.0s Misconfigured Liveness Kill Line" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Check kubelet events to prove pods are killed by LivenessProbe, NOT crashing on an exception
kubectl get events -n prod --field-selector reason=Unhealthy --sort-by='.lastTimestamp'
# Output: Liveness probe failed: Get "http://10.244.1.45:8080/healthz": context deadline exceeded (Client.Timeout exceeded)

# Step 2: Inspect the pod spec for missing startupProbe and tight CPU limits
kubectl get deploy order-api -n prod -o jsonpath='{.spec.template.spec.containers[0].livenessProbe}'
```

### Observed Culprit Kubernetes YAML
```yaml
# ❌ FATAL PROBE & CPU LIMIT ANTI-PATTERN:
resources:
  limits:
    cpu: "500m" # Throttles cold-start JIT compilation by 4x!
livenessProbe:  # ❌ No startupProbe! Liveness starts ticking immediately!
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 3
  timeoutSeconds: 1
  failureThreshold: 2 # Kills pod at T+11s during JIT warmup!
```

<!-- PREDICT_GATE: Commit your hypothesis: Why is `initialDelaySeconds` a fragile guessing game under variable node CPU load, and how do `startupProbe` + `readinessProbe` + `livenessProbe` work together? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. The Distinct Responsibilities of the 3 Kubernetes Probes
1. **`startupProbe` (Gates all other probes until boot + warmup finish)**: Disables `livenessProbe` and `readinessProbe` until `startupProbe` succeeds once! Executes an internal warmup path (pre-JITting EF Core `DbContext` model compilation and JSON serializers) before opening the floodgates.
2. **`readinessProbe` (Controls Service Endpoint Slice membership)**: If a pod is temporarily overloaded, `readinessProbe` removes it from the load balancer without restarting it.
3. **`livenessProbe` (Last-resort deadlock recovery)**: Must ONLY check `() => HealthCheckResult.Healthy()` in-memory (`timeoutSeconds: 3, failureThreshold: 3`) and only runs *after* `startupProbe` has succeeded!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-api
spec:
  template:
    spec:
      containers:
        - name: api
          image: ghcr.io/principal/order-api@sha256:9f8e7d... # Built with -p:PublishReadyToRun=true
          resources:
            requests:
              cpu: "1000m"
              memory: "1024Mi"
            limits:
              # Omit CPU limit (or use K8s InPlacePodVerticalScaling / Startup CPU Boost) so cold-start JIT uses burst cores!
              memory: "1024Mi"
          startupProbe:
            httpGet:
              path: /health/startup # Warms up EF Core model & serializers before returning 200 OK
              port: 8080
            periodSeconds: 2
            failureThreshold: 30    # Allows up to 60s on heavily loaded nodes; finishes in ~2s normally
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            periodSeconds: 5
            timeoutSeconds: 2
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /health/live    # Pure in-process liveness check (zero DB/network calls!)
              port: 8080
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (No `startupProbe`, `500m` CPU Limit) | After (`startupProbe` + `ReadyToRun` + Uncapped CPU Burst) | Validation & Rollback Procedure |
|---|---|---|---|
| **Pod Cold-Start Time to Ready** | `Infinite` (Killed at `11s` in loop) | **`2.1 seconds`** | Scale deployment from `1` to `30` under `3,500 RPS` load; assert `0` probe restarts. |
| **First-Request Latency on New Pod** | `4,200 ms` (Cold JIT + EF Model Build) | **`6.4 ms`** (Pre-warmed in `/health/startup`) | Verify p99 latency during scale-out event stays `< 25ms`. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why add a `startupProbe` when we can just change `livenessProbe.initialDelaySeconds` from `5` to `60`?"*

**The Principal Defense**:
> *"Setting `initialDelaySeconds: 60` forces Kubernetes to wait a full 60 seconds on every single deployment or scale-out before checking pod health, even when the pod actually finishes booting in `2 seconds`! Worse, with `startupProbe` (`periodSeconds: 2, failureThreshold: 30`), a fast pod becomes ready in **`2 seconds`**, while a pod booting on a congested node during a cluster upgrade still gets up to **`60 seconds`** of protection without dying!"*

### Question 2 (The Second-Order Failure Mode):
> *"Why did you remove `limits.cpu` from the container spec while keeping `requests.cpu` and `limits.memory`? Won't one noisy pod starve the node?"*

**The Principal Defense**:
> *"In Linux cgroups, **`requests.cpu` sets `cpu.shares` (CFS proportional weight)**, which guarantees every pod on the node is strictly guaranteed its requested CPU share whenever contention occurs! By contrast, **`limits.cpu` sets `cpu.cfs_quota_us`**, which artificially throttles a multi-threaded .NET GC or JIT startup even when 90% of the node's CPU cores are sitting completely idle! We always enforce strict `limits.memory` and `requests.cpu`, while leaving `limits.cpu` uncapped (or using K8s `PodLevelResources` / Startup CPU Boost) so JIT and GC never stall on idle cores."*

### Question 3 (The FinOps / Cost Axis):
> *"Management wants `minReplicaCount: 0` (Scale-to-Zero) on all 25 customer-facing production APIs to save $1,800/month overnight. Defend the 80%-good alternative."*

**The Principal Defense**:
> *"Scale-to-Zero (`minReplicaCount: 0`) is great for asynchronous queue workers and dev/staging environments, which saves 75% of our non-prod bill! However, scaling synchronous customer-facing Tier-1 APIs to `0` means the first customer at 06:00 AM waits for container scheduling + cold boot (`3–15s`), and you have zero availability zone redundancy until scale-out finishes. Keep `minReplicaCount: 2` across 2 AZs on Tier-1 APIs (using Azure Reserved Instances at 60% discount = `$380/month`), and apply Scale-to-Zero strictly to async KEDA queue consumers and non-prod clusters."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0802 — KEDA Scale-Out Liveness Probe Death Spiral

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 2 minutes | **Mitigation Latency (TTM)**: 16 minutes

## Five Whys Root Cause Chain
1. **Why did 35 newly scaled pods crash in a loop?** -> `kubelet` killed them at T+11s due to failed `livenessProbe`.
2. **Why did `livenessProbe` time out during boot?** -> Pods were pinned at 100% CPU compiling JIT methods and EF Core models while already receiving live traffic.
3. **Why did JIT compilation take >11s?** -> Container had `limits.cpu: 500m` (CFS throttling) and lacked `PublishReadyToRun=true`.
4. **Why was traffic routed to pods before EF Core finished compiling its model?** -> `/health/ready` did not verify warmup completion, and `startupProbe` was missing.
5. **Why did `minReplicaCount: 1` collapse?** -> A single pod cannot absorb a sudden 09:00 AM jump to 3,500 RPS while waiting for scale-out.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Add `startupProbe` with EF/JSON warmup endpoint + `PublishReadyToRun=true` | Platform Team | Kyverno policy rejects Deployments missing `startupProbe` |
| P1 | Set scheduled KEDA cron scaler to pre-scale to `10` replicas at `08:50 AM` before `09:00 AM` spike | SRE Team | Verified in load test |
```
