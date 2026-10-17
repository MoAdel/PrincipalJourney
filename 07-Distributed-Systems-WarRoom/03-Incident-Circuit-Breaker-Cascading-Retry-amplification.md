# Incident 03: The 3-Tier Retry Amplification (`64x`) & Premature Circuit-Breaker Trip

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: 3-Tier Microservice Mesh (BFF $ightarrow$ Order API $ightarrow$ Inventory API $ightarrow$ SQL) / Polly v8 Resilience Pipelines  
> **Business Impact**: A 2% packet loss blip turned into a $64	imes$ internal traffic DDoS (`192,000 RPS`), tripping every Circuit Breaker open simultaneously for 25 minutes  
> **Competencies Mastered**: Multiplicative Retry Amplification ($R^N$), Single-Layer Retry Rule, Polly v8 `MinimumThroughput` & `SamplingDuration`, Hedged Requests vs. Retries

---

## 🚨 1. The 03:45 PM Crisis Briefing

At `15:45:00`, an Azure top-of-rack switch maintenance caused a tiny `2.5%` transient latency spike for 4 seconds. Instead of recovering at `15:45:04`, the entire microservice mesh self-destructed:

```text
[15:45:02] Network Blip: 2.5% of packets between Inventory-API and SQL delayed by 1.2s.
[15:45:05] RED HERRING: Security WAF team pages "Internal East-West traffic just spiked from 3,000 RPS to 192,000 RPS! Internal botnet?!"
[15:45:08] Resilience Alert: Polly BrokenCircuitException across 100% of Order-API and BFF pods!
```

> 📐 **Derive It (Fermi Mode): Multi-Tier Multiplicative Retry Amplification ($4^3 = 64	imes$)**
> - **Inputs**: `BaseIngressRPS = 3000`, `AttemptsPerTier = 4`, `TiersWithRetries = 3`
> - **Formula**: `WorstCaseLeafRPS = BaseIngressRPS * (AttemptsPerTier ^ TiersWithRetries)`
> - **Step-by-Step**:
>   1. Each team independently configured Polly with `MaxRetryAttempts = 3` (`1 initial + 3 retries = 4 total attempts`) at their tier:
>      - **Tier 1 (SPA / Mobile Client)**: 4 attempts
>      - **Tier 2 (BFF Gateway)**: 4 attempts ($4 \times 4 = 16$)
>      - **Tier 3 (Order API $ightarrow$ Inventory API)**: 4 attempts ($16 \times 4 = 64\text{ attempts per user click!}$)
>   2. When Inventory API slowed down past the `1.0s` timeout, `3,000 RPS` at the edge multiplied into $3,000 \times 64 = 192,000\text{ RPS}$ hammering the struggling Inventory API!
>   3. Furthermore, after the circuit breaker tripped open for `30s`, when it entered **Half-Open**, a single probe failed during a low-traffic window because `MinimumThroughput` was set to `2` instead of `100`, locking the circuit permanently open!
> - **What-If Sensitivity**: Enforcing the **Single-Layer Retry Invariant** (retry ONLY at the immediate leaf caller, with `0` retries at upstream pass-through tiers + a global **Token-Bucket Retry Budget capping retries at $\le 10\%$ of total traffic**) reduces peak load from `192,000 RPS` to **`3,300 RPS`** ($58	imes$ reduction)!

<!-- TELEMETRY_WIDGET: title="3-Tier 64x Retry Amplification Storm" metric1="Leaf Service Traffic (RPS)" metric2="Open Circuit Breakers (%)" threshold="6000 RPS Inventory Capacity" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Rule out the "Internal Botnet" Red Herring — group Inventory requests by W3C TraceId!
kubectl logs -n prod -l app=inventory-api --tail=5000 | jq -r '.traceId' | sort | uniq -c | sort -nr | head -n 10
# Output: Single user traceId '4bf92f3577b34da6a3ce929d0e0e4736' appears 64 TIMES in 4 seconds!
```

### Observed Culprit Code Snippet
```csharp
// ❌ CONFIGURED IDENTICALLY IN BFF, ORDER-API, AND INVENTORY-CLIENT (4 * 4 * 4 = 64x!):
services.AddHttpClient("DownstreamClient")
    .AddResilienceHandler("naive-pipeline", builder =>
    {
        builder.AddRetry(new HttpRetryStrategyOptions
        {
            MaxRetryAttempts = 3,
            Delay = TimeSpan.Zero // ❌ Immediate retry without jitter or exponential backoff!
        });
        builder.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
        {
            FailureRatio = 0.1,
            MinimumThroughput = 2, // ❌ Trips entire circuit if just 1 out of 2 requests fails!
            BreakDuration = TimeSpan.FromMinutes(5)
        });
    });
```

<!-- PREDICT_GATE: Commit your hypothesis: Why did a single `traceId` appear 64 times at the leaf service, why must inner/outer timeouts obey a strict decreasing budget, and how does a Retry Budget stop self-DDoS? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. The Three Laws of Distributed Retries
1. **Retry at One Layer Only**: Only the direct caller of the flaky dependency retries (max 2 retries with decorrelated jitter backoff). Upstream pass-through gateways (BFF, API Gateway) must set `MaxRetryAttempts = 0` (or propagates `x-retry-attempt` header so downstream layers refuse nested retries).
2. **Enforce a Server-Wide Retry Budget (`<= 10%`)**: Every pod maintains a sliding ratio of `retries / normal_requests`. If retries exceed `10%` of baseline traffic, the dependency is experiencing a systemic outage (not random packet loss) — **stop retrying immediately and fail fast**!
3. **Timeout Nesting Hierarchy**: Outer Timeout (`BFF = 3.5s`) $>$ Middle Timeout (`Order = 3.0s`) $>$ Leaf Per-Try Timeout (`Inventory = 0.8s`).

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Net.Http;
using System.Threading;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http.Resilience;
using Polly;

namespace PrincipalJourney.DistributedSystems.WarRoom;

public static classRetryBudgetResilienceSetup
{
    private static long _activeRequests;
    private static long _activeRetries;

    public static IHttpClientBuilder AddLeafResilienceWithRetryBudget(this IHttpClientBuilder clientBuilder)
    {
        clientBuilder.AddResilienceHandler("principal-leaf-pipeline", builder =>
        {
            // 1. Total Outer Timeout covering all attempts
            builder.AddTimeout(TimeSpan.FromSeconds(2.5));

            // 2. Decorrelated Jitter Retry with 10% Global Retry Budget Gate
            builder.AddRetry(new HttpRetryStrategyOptions
            {
                MaxRetryAttempts = 2,
                BackoffType = DelayBackoffType.Exponential,
                UseJitter = true,
                Delay = TimeSpan.FromMilliseconds(150),
                ShouldHandle = args =>
                {
                    // Never retry if upstream caller already marked this as a nested retry!
                    if (args.Context.Properties.TryGetValue(new ResiliencePropertyKey<bool>("IsNestedRetry"), out bool isNested) && isNested)
                        return new ValueTask<bool>(false);

                    // Enforce 10% Retry Budget: if >10% of calls are retrying, stop amplifying load!
                    long reqs = Math.Max(100, Interlocked.Read(ref _activeRequests));
                    long retries = Interlocked.Read(ref _activeRetries);
                    if ((double)retries / reqs > 0.10)
                        return new ValueTask<bool>(false);

                    bool shouldRetry = HttpClientResiliencePredicates.IsTransient(args.Outcome);
                    if (shouldRetry) Interlocked.Increment(ref _activeRetries);
                    return new ValueTask<bool>(shouldRetry);
                }
            });

            // 3. Statistically sound Circuit Breaker (MinimumThroughput >= 100)
            builder.AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
            {
                FailureRatio = 0.25,
                SamplingDuration = TimeSpan.FromSeconds(30),
                MinimumThroughput = 100, // Requires at least 100 requests in 30s before tripping!
                BreakDuration = TimeSpan.FromSeconds(15)
            });

            // 4. Inner Per-Attempt Timeout (0.8s)
            builder.AddTimeout(TimeSpan.FromMilliseconds(800));
        });

        return clientBuilder;
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (3-Tier Unbounded Retries) | After (Single-Layer + 10% Retry Budget) | Validation & Rollback Procedure |
|---|---|---|---|
| **Leaf Traffic During 5% Fault** | `192,000 RPS` ($64	imes$ amplification) | **`3,150 RPS`** ($1.05	imes$ bounded) | Chaos test injects 50% HTTP 503 on Inventory; assert leaf RPS never exceeds `1.10x` ingress RPS. |
| **Recovery Time After 4s Blip** | `25 minutes` (Manual pod restart) | **`0.4 seconds`** (Self-healing) | Automated Toxiproxy latency test in staging. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Instead of writing Polly C# pipelines, why not turn on Envoy / Istio Service Mesh default retries AND keep Polly retries in the app for double protection?"*

**The Principal Defense**:
> *"Enabling retries in **both** the Envoy sidecar (`x-envoy-max-retries: 3`) AND application Polly (`MaxRetryAttempts: 3`) creates a hidden **$16	imes$ retry multiplier per hop** without developers even seeing it in C# code! Pick **one** owner: either Envoy manages network-level retries for idempotent routes (with `retry_budget` configured) OR Polly manages them in-process — never both!"*

### Question 2 (The Second-Order Failure Mode):
> *"When a Circuit Breaker trips OPEN on all 40 Order-API pods, how do we prevent all 40 pods from slamming the recovering Inventory-API at the exact same millisecond when `BreakDuration` (15s) expires?"*

**The Principal Defense**:
> *"In Polly v8, when `BreakDuration` elapses, the breaker transitions to **Half-Open** and permits **only 1 single probe request per pod** while continuing to fast-fail other requests until that probe succeeds! Furthermore, adding $\pm 20\%$ random jitter to `BreakDuration` across pods desynchronizes the 40 half-open probes across a 6-second window."*

### Question 3 (The FinOps / Cost Axis):
> *"To survive 64x retry storms without changing code, the infrastructure lead proposed keeping all downstream services over-provisioned at 10x normal CPU capacity ($32,000/month). Defend the 80%-good alternative."*

**The Principal Defense**:
> *"Over-provisioning hardware by $10	imes$ ($384,000/year) to absorb self-inflicted retry bugs is financially reckless — and $10	imes$ hardware still dies against a $64	imes$ retry storm! Enforcing a **10% Token-Bucket Retry Budget + Single-Layer Retries** costs **$0/month** and mathematically caps retry traffic at $+10\%$ overhead."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0703 — 3-Tier 64x Retry Amplification Storm

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 2 minutes | **Mitigation Latency (TTM)**: 25 minutes

## Five Whys Root Cause Chain
1. **Why did Inventory-API crash during a 2.5% network blip?** -> Traffic jumped from 3,000 RPS to 192,000 RPS.
2. **Why did traffic multiply by 64x?** -> Client (4x), BFF (4x), and Order-API (4x) all executed nested retries ($4^3 = 64$).
3. **Why did retries fire immediately without backoff?** -> `Delay = TimeSpan.Zero` and `UseJitter = false`.
4. **Why did Circuit Breakers stay locked open after traffic dropped?** -> `MinimumThroughput = 2` tripped on single probe failures.
5. **Why did SecOps suspect an internal botnet?** -> East-West RPS exploded without corresponding external ingress increase.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Remove retries from pass-through BFF/Gateways; add 10% Retry Budget at leaf clients | Platform Team | Chaos test verifies max `1.10x` amplification under 100% downstream failure |
| P1 | Enforce `MinimumThroughput >= 50` on all Polly Circuit Breakers | Arch Review | Roslyn / config analyzer rule added |
```
