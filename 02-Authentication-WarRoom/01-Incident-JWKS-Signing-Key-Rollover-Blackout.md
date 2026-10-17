# Incident 01: The Automated JWKS Signing-Key Rollover Blackout

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: ASP.NET Core 9.0 Microservices (45 Pods) / Microsoft Entra ID / Duende IdentityServer  
> **Business Impact**: 100% HTTP `401 Unauthorized` across all authenticated APIs for 18 minutes; $412,000 lost GMV; 82% monthly error budget burned  
> **Competencies Mastered**: OIDC Discovery (`/.well-known/openid-configuration`), `ConfigurationManager<OpenIdConnectConfiguration>`, JWKS `kid` Matching, Single-Flight Refresh Throttling, Custom `HttpClient` Backchannel Resilience

---

## 🚨 1. The 02:14 AM Crisis Briefing

At `02:00:00 UTC`, the enterprise Identity Provider (IdP) executed an automated 90-day cryptographic RSA signing-key rollover (`kid: "key-2026-Q3"` $ightarrow$ `kid: "key-2026-Q4"`).

Within 3 seconds, PagerDuty triggered a global SEV-1 storm:

```text
[02:00:03] Edge Alert: API Gateway HTTP 401 rate jumped from 0.04% to 94.8%!
[02:00:12] RED HERRING ALERT: Redis Session Cluster CPU rose from 8% to 79% (Clients hammering /login retry!)
[02:00:25] Identity Alert: Outbound NAT / IdP Discovery Endpoint (/.well-known/jwks) returning HTTP 429 Too Many Requests!
[02:01:10] Pod Health: 18 of 45 Order-API pods failing readiness probes due to thread pool queueing on JwtBearerHandler!
```

The on-call SRE immediately shouts in Slack:
> *"Redis CPU spiked to 79% at 02:00 AM right when auth broke! Our Redis session cache is corrupting tokens — scale up Redis and flush the session keys!"*

> 📐 **Derive It (Fermi Mode): Unthrottled JWKS Metadata Refresh Storm**
> - **Inputs**: `IncomingRPS = 6000`, `PodCount = 45`, `CacheBypassOnUnknownKid = 1`, `IdPRateLimitPerIP = 50`
> - **Formula**: `OutboundJwksRequestsPerSec = IncomingRPS * CacheBypassOnUnknownKid`
> - **Step-by-Step**:
>   1. A developers' custom `IssuerSigningKeyResolver` fetched `https://idp.principal.io/.well-known/jwks.json` whenever a JWT header contained an unrecognized `kid` (`"key-2026-Q4"`), without a local refresh cooldown mutex.
>   2. At `6,000 RPS`, all 45 pods shared a single Azure NAT Gateway public IP and fired $6,000\text{ outbound HTTPS GETs/sec}$ at the IdP's JWKS endpoint!
>   3. The IdP's WAF rate-limited the NAT IP (`> 50 req/sec` $ightarrow$ `HTTP 429` for 15 minutes). Because the JWKS fetch threw `HttpRequestException (429)`, none of the 45 pods could download `"key-2026-Q4"`, causing 100% of newly minted JWTs to fail signature validation with `IDX10501: Signature validation failed. Unable to match key`!
> - **What-If Sensitivity**: Change `RefreshInterval` cooldown lock to `5 minutes` per pod (`1 request / 300s` per pod) — 45 pods emit at most $45\text{ requests}$ total during a key rollover ($0.15\text{ req/s}$), staying $99.7\%$ below the WAF rate limit!

<!-- TELEMETRY_WIDGET: title="JWKS Key Rollover & 429 Lockout Storm" metric1="HTTP 401 Failure Rate (%)" metric2="Outbound JWKS HTTP 429s/sec" threshold="50 req/s IdP WAF Limit" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
Run these exact commands to isolate the fault and rule out the Redis red herring:

```bash
# Step 1: Rule out the Redis Red Herring (Check actual Redis command latency in microseconds)
redis-cli --latency-history -i 1
# Output: avg 0.18ms (Redis is completely healthy; high CPU is just login retry symptom!)

# Step 2: Inspect live .NET exception counters & outbound HTTP failures inside the pod
dotnet-counters monitor -p 1 --counters System.Runtime,System.Net.Http --refresh-interval 1

# Step 3: Filter structured Kestrel logs for IDX* Microsoft.IdentityModel error codes
kubectl logs -n prod -l app=order-api --tail=200 | grep -E "IDX10501|IDX20803|429"
```

### Observed Culprit Code Snippet
```csharp
// ❌ CATASTROPHIC ANTI-PATTERN in Program.cs:
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            // Custom resolver makes a synchronous network call on EVERY unknown 'kid' without rate-limiting!
            IssuerSigningKeyResolver = (token, securityToken, kid, validationParameters) =>
            {
                using var client = new HttpClient(); // Also exhausts ephemeral SNAT sockets!
                var jwksJson = client.GetStringAsync("https://idp.principal.io/.well-known/jwks.json").GetAwaiter().GetResult();
                return new JsonWebKeySet(jwksJson).GetSigningKeys();
            }
        };
    });
```

<!-- PREDICT_GATE: Commit your hypothesis: Why did Redis CPU spike, why did all 45 pods get locked out of the IdP simultaneously, and what built-in ASP.NET Core state machine solves this natively? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. How `ConfigurationManager<OpenIdConnectConfiguration>` Actually Works
ASP.NET Core's built-in `JwtBearerHandler` uses `ConfigurationManager<OpenIdConnectConfiguration>` which maintains two distinct timers governed by a `SemaphoreSlim` single-flight lock:
* **`AutomaticRefreshInterval` (Default: `24 hours`)**: Background refresh of OIDC metadata and JWKS keys.
* **`RefreshInterval` (Default: `5 minutes`, minimum `1 second`)**: Minimum cooldown required between **on-demand refreshes** triggered when `IDX10501` encounters an unknown `kid`.
* When the developer replaced `ConfigurationManager` with a naive custom `IssuerSigningKeyResolver` (or set `RefreshInterval = TimeSpan.Zero`), they destroyed the single-flight `SemaphoreSlim` and cooldown gate!

### 2. Why the Red Herring Fooled On-Call
When `94.8%` of API calls returned `401 Unauthorized`, mobile and SPA clients immediately triggered their automatic re-authentication flows, hitting the session/refresh-token endpoints at $15	imes$ normal volume. Flushing Redis would have destroyed the remaining valid refresh tokens and doubled the outage duration.

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

### Production Refactor: Resilient OIDC `ConfigurationManager` + Pre-Published Overlapping Keys

```csharp
using System;
using System.Net.Http;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace PrincipalJourney.Authentication.WarRoom;

public static class ResilientJwtBearerSetup
{
    public static IServiceCollection AddPrincipalJwtAuthentication(this IServiceCollection services, string authorityUrl)
    {
        services.AddHttpClient("OidcBackchannel")
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                PooledConnectionLifetime = TimeSpan.FromMinutes(5),
                ConnectTimeout = TimeSpan.FromSeconds(3)
            });

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = authorityUrl;
                options.RequireHttpsMetadata = true;

                // 1. Automatic background refresh every 6 hours (picks up pre-published 'next' keys BEFORE signing cutover!)
                options.AutomaticRefreshInterval = TimeSpan.FromHours(6);

                // 2. Enforce strict 5-minute cooldown between on-demand 'kid'-miss refreshes per pod
                options.RefreshInterval = TimeSpan.FromMinutes(5);

                // 3. Explicit algorithm pinning (blocks alg:none and RS256->HS256 confusion)
                options.TokenValidationParameters.ValidAlgorithms = ["RS256", "ES256"];
            });

        return services;
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (The Incident) | After (Principal Refactor) | Validation & Rollback Procedure |
|---|---|---|---|
| **Outbound JWKS Calls During Rollover** | `6,000 req/sec` (WAF 429 Blackout) | **`0 req/sec` on cutover** (Pre-cached via 24h overlap) or max `45 req / 5m` | Simulate unplanned `kid` rotation in staging under `2,000 RPS` k6 load; assert `< 1` outbound call per pod. |
| **Auth Validation Latency ($p99$)** | `15,000 ms` (Blocked on sync HTTP) | **`0.08 ms`** (In-memory RSA verification) | Monitor `http.server.request.duration`; revert config if auth middleware > `1ms`. |
| **Ephemeral Socket Usage** | `28,000 TIME_WAIT` sockets | **`1` pooled socket per pod** | Check `ss -tan` during key rotation drill. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why don't we just hardcode the RSA public key PEM into `appsettings.Production.json` or Kubernetes Secrets so pods never have to call the IdP over the network?"*

**The Principal Defense**:
> *"Hardcoding public keys in config files turns a routine cryptographic compromise or scheduled rotation into an emergency 45-microservice redeployment. If a signing key is compromised at 03:00 AM, the IdP must revoke the old `kid` and publish a new `kid` in `/.well-known/jwks.json`. The RFC 7517 standard solves this cleanly: publish the **new public key (`kid-next`)** in the JWKS document **48 hours before** the IdP starts signing tokens with it. That way, every pod's `AutomaticRefreshInterval` (6h) caches the new key in memory days before the first token signed with `kid-next` ever arrives!"*

### Question 2 (The Second-Order Failure Mode):
> *"What happens if a pod cold-boots during a scale-out event while the IdP's discovery endpoint is experiencing a 30-second transient outage?"*

**The Principal Defense**:
> *"If a pod cold-boots while the IdP metadata endpoint is down, `ConfigurationManager` holds the last known good configuration once loaded, or fails fast on initial fetch and retries after `RefreshOnIssuerKeyNotFound`. For Tier-0 ultra-high availability, we cache the signed OIDC discovery + JWKS document in our local regional Redis/ConfigMap via a background singleton watcher, serving as a read-through fallback proxy for booting pods."*

### Question 3 (The FinOps / Cost Axis):
> *"Our security vendor wants to sell us a dedicated Enterprise API Gateway Introspection Cluster ($9,500/month) that validates every token at the edge by calling the IdP per request. Defend the 80%-good alternative at 5% of the cost."*

**The Principal Defense**:
> *"Per-request RFC 7662 Token Introspection over the network adds `8–15ms` latency to every API call, creates a single point of failure, and costs $9,500/month. Instead, we use **Stateless Asymmetric JWT Validation (RS256/ES256) with 5-minute Access Token TTLs** + a lightweight **Revocation Bloom Filter / Session Version check in our existing Redis cluster ($300/month)**. We get `< 0.5ms` validation, 97% lower infrastructure cost, and immediate revocation capability."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0201 — JWKS Key Rollover & WAF 429 Lockout

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 1 minute | **Mitigation Latency (TTM)**: 18 minutes
- **SLO Burn**: 82% of 30-day error budget consumed

## Five Whys Root Cause Chain
1. **Why did 94.8% of API calls return 401?** -> Pods could not verify tokens signed with rotated key `key-2026-Q4`.
2. **Why couldn't pods download `key-2026-Q4`?** -> The IdP WAF blocked our NAT Gateway IP with HTTP 429.
3. **Why did our pods send 6,000 req/s to the IdP?** -> A custom `IssuerSigningKeyResolver` bypassed `ConfigurationManager`'s 5-minute single-flight cooldown and called `new HttpClient().GetStringAsync().Result` on every request.
4. **Why wasn't `key-2026-Q4` already cached before 02:00 UTC?** -> The IdP activated signing and published the public key at the exact same millisecond instead of publishing the public key 48h in advance.
5. **Why did on-call waste 7 minutes investigating Redis?** -> Alerting lacked an outbound dependency 429 alert and paged on downstream Redis login-retry CPU first.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Remove custom `IssuerSigningKeyResolver`; use native `ConfigurationManager` with `RefreshInterval = 5m` | Identity Eng | `NetArchTest` bans setting `IssuerSigningKeyResolver` with network calls |
| P0 | Configure IdP key rotation policy to publish `next` public key 48h before signing activation | IAM Team | Automated key-rollover chaos drill in staging weekly |
| P1 | Add Prometheus alert on `IDX10501` / OIDC metadata fetch failures | SRE Lead | Alert fires on > 1 metadata fetch failure in 5m |
```
