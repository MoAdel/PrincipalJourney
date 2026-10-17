# Incident 01: The Azure Load Balancer SNAT Port Exhaustion Blackout

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Azure Kubernetes Service (AKS, 20 Nodes) / Outbound Payment & Tax Webhook Calls  
> **Business Impact**: 84% of outbound HTTPS calls failing with `SocketException (99): Cannot assign requested address` after 23 seconds of flash-sale traffic  
> **Competencies Mastered**: Ephemeral TCP 4-Tuple, Azure Standard LB Pre-Allocated SNAT Ports (`1,024/node`), Azure NAT Gateway (`64,512` Dynamic SNAT Ports/IP), `IHttpClientFactory` / `SocketsHttpHandler` Pooling

---

## 🚨 1. The 08:00 AM Crisis Briefing

Twenty-three seconds into the `08:00 AM` flash sale (`1,800 checkouts/sec`), outbound calls to Stripe and Avalara Tax APIs began failing with connection timeouts across all pods on AKS Node #1 through Node #20:

```text
[08:00:23] App Exception: System.Net.Sockets.SocketException (99): Cannot assign requested address (api.stripe.com:443).
[08:00:35] RED HERRING: Incident Commander declares "Stripe and Avalara are both having a simultaneous global outage!"
[08:01:05] Azure Monitor Alert: Standard Load Balancer AllocatedSNATPorts = 1024/1024 (SNATPortExhaustion)!
```

> 📐 **Derive It (Fermi Mode): Standard Load Balancer SNAT Port Exhaustion Time**
> - **Inputs**: `NodeCount = 20`, `SnatPortsPerNode = 1024`, `SocketChurnPerSec = 1800`, `TcpTimeWaitFinSec = 240`
> - **Formula**: `TimeToExhaustSnatSec = (NodeCount * SnatPortsPerNode) / SocketChurnPerSec`
> - **Step-by-Step**:
>   1. Without an **Azure NAT Gateway**, an AKS cluster with a single outbound public IP on a Standard Load Balancer pre-allocates **only `1,024` SNAT ports per node** ($20 \times 1,024 = 20,480$ total ports).
>   2. A helper class instantiated `using var client = new HttpClient()` per request, opening a new outbound TCP socket on every call (`1,800 sockets/sec`) and closing it immediately (putting the SNAT port into `TIME_WAIT` / `240s` idle hold).
>   3. Time to exhaust all `20,480` SNAT ports: $\frac{20,480}{1,800\text{ ports/s}} = 11.38\text{ seconds}$ per destination IP!
> - **What-If Sensitivity**: Fixing the code to reuse a singleton `SocketsHttpHandler` (`IHttpClientFactory`) drops socket churn from `1,800/sec` to **`2` persistent HTTP/2 multiplexed sockets per pod** (`40` SNAT ports total across the entire cluster!), AND attaching an **Azure NAT Gateway** provides `64,512` dynamic non-preallocated ports per IP!

<!-- TELEMETRY_WIDGET: title="AKS Outbound SNAT Port Exhaustion" metric1="Allocated SNAT Ports / Node" metric2="Outbound SocketExceptions/sec" threshold="1024 Pre-Allocated Node Limit" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Rule out the "Stripe is Down" Red Herring — check Azure LB SNAT Port Exhaustion metrics!
az monitor metrics list --resource "$AKS_LB_RESOURCE_ID"   --metric "UsedSNATPorts" "AllocatedSNATPorts" "SnatConnectionCount" --interval PT1M

# Step 2: Count TCP sockets in TIME_WAIT inside the failing pod's network namespace
kubectl exec -n prod deploy/checkout-api -- ss -tan state time-wait | wc -l
# Output: 1021 sockets in TIME_WAIT!
```

### Observed Culprit Code Snippet
```csharp
// ❌ CATASTROPHIC SNAT KILLER: Instantiating and disposing HttpClient per request!
public async Task<TaxResult> CalculateTaxAsync(OrderDto order, CancellationToken ct)
{
    using var client = new HttpClient(); // Opens brand new TCP + TLS handshake + burns 1 SNAT port per call!
    var response = await client.PostAsJsonAsync("https://api.taxprovider.com/v2/calc", order, ct);
    return await response.Content.ReadFromJsonAsync<TaxResult>(cancellationToken: ct)!;
}
```

<!-- PREDICT_GATE: Commit your hypothesis: Why does `using var client = new HttpClient()` NOT release the underlying OS TCP socket when `Dispose()` runs, and why did the AKS node hit the wall at 1,024 ports instead of 64,512? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why `HttpClient.Dispose()` Leaves Sockets Locked in `TIME_WAIT`
* When `HttpClient.Dispose()` closes a TCP connection actively, the Linux kernel TCP state machine transitions the socket `(LocalIP, LocalPort, RemoteIP, RemotePort)` into **`TIME_WAIT` for $2 	imes 	ext{MSL}$ (`60–240 seconds`)** to prevent delayed packets from a previous connection from corrupting a new connection reusing the same 4-tuple.
* During `TIME_WAIT`, that SNAT port cannot be reused to connect to the same destination IP:Port!

### 2. Standard Load Balancer Pre-Allocation vs. Azure NAT Gateway
* **Standard LB Outbound Rules**: Statically carves the 64,000 ports of 1 public IP into fixed buckets of `1,024` ports per node. Even if 19 nodes are idle (`0` ports used), Node #1 crashes at port `1,025`!
* **Azure NAT Gateway**: Dynamically pools all `64,512` SNAT ports per public IP across all nodes on demand (up to 16 IPs = `1,032,192` ports).

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Net;
using System.Net.Http;
using Microsoft.Extensions.DependencyInjection;

namespace PrincipalJourney.CloudNative.WarRoom;

public static class SnatSafeHttpClientSetup
{
    public static IServiceCollection AddPooledHttp2Clients(this IServiceCollection services)
    {
        services.AddHttpClient("TaxProviderClient", client =>
            {
                client.BaseAddress = new Uri("https://api.taxprovider.com");
                client.DefaultRequestVersion = HttpVersion.Version20;
                client.DefaultVersionPolicy = HttpVersionPolicy.RequestVersionOrLower;
            })
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                // 1. Rotate pooled connections every 2 minutes to respect DNS TTL updates without socket churn
                PooledConnectionLifetime = TimeSpan.FromMinutes(2),
                PooledConnectionIdleTimeout = TimeSpan.FromMinutes(1),
                // 2. Allow multiplexing multiple HTTP/2 streams over a handful of persistent TCP sockets
                EnableMultipleHttp2Connections = true,
                MaxConnectionsPerServer = 16
            });

        return services;
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (`new HttpClient()` + LB Outbound) | After (`SocketsHttpHandler` Pool + NAT Gateway) | Validation & Rollback Procedure |
|---|---|---|---|
| **Active SNAT Ports Used (`1,800 RPS`)** | `20,480 / 20,480` (`100%` Exhausted) | **`48 ports`** across 20 nodes (`0.07%` utilization) | Roslyn analyzer `CA2000` / custom rule blocks `new HttpClient()` in CI. |
| **TLS Handshake CPU Overhead** | `1,800 handshakes/sec` (`+35ms` latency) | **`0.2 handshakes/sec`** (`0ms` reused TLS session) | Monitor `UsedSNATPorts` alert at `> 40%` capacity. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why bother refactoring C# code if attaching an Azure NAT Gateway with 16 Public IPs gives us 1,032,192 SNAT ports in 2 minutes via Terraform?"*

**The Principal Defense**:
> *"Attaching a NAT Gateway stops the immediate bleeding during an incident, which is why we do it first! However, leaving `new HttpClient()` in code means **every single request still pays a full 3-way TCP handshake + TLS 1.3 cryptographic handshake (`+30ms to +80ms` tail latency)** and burns customer-facing latency and CPU! NAT Gateway is the infrastructure safety net; `SocketsHttpHandler` pooling is the mechanical fix."*

### Question 2 (The Second-Order Failure Mode):
> *"If we switches from `new HttpClient()` to a single `static readonly HttpClient` singleton that lives forever, what breaks during a Blue/Green DNS failover of our downstream provider?"*

**The Principal Defense**:
> *"A naive `static readonly HttpClient` with default infinite connection lifetime caches the resolved DNS IP on its open TCP sockets forever! When the downstream provider flips their DNS record during an outage, our singleton keeps sending traffic to the dead IP. Setting `SocketsHttpHandler.PooledConnectionLifetime = TimeSpan.FromMinutes(2)` (or using `IHttpClientFactory`) gracefully drains and recreates underlying sockets every 2 minutes so DNS updates take effect automatically."*

### Question 3 (The FinOps / Cost Axis):
> *"Azure NAT Gateway charges $0.045 per GB of data processed. Our media worker pods download and upload 400 TB/month of blobs to Azure Storage in the same region, adding $18,000/month in NAT Gateway data processing fees! Defend the 80%-good fix at $0 data cost."*

**The Principal Defense**:
> *"Traffic from AKS to Azure Storage in the same region should **never traverse the public internet or the NAT Gateway**! By enabling a **Gateway VPC Endpoint / Azure VNet Service Endpoint (or Private Endpoint)** for `Microsoft.Storage` on the AKS subnet, 100% of the 400 TB/month routes directly over the Azure private backbone, bypassing the NAT Gateway completely and dropping that **$18,000/month fee to $0.00**!"*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0801 — AKS Outbound SNAT Port Exhaustion

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 2 minutes | **Mitigation Latency (TTM)**: 14 minutes

## Five Whys Root Cause Chain
1. **Why did 84% of Stripe/Tax calls fail?** -> Linux kernel could not allocate an outbound ephemeral SNAT port (`SocketException 99`).
2. **Why were all 1,024 SNAT ports per node exhausted?** -> `CheckoutService` instantiated `using var client = new HttpClient()` per request.
3. **Why didn't `Dispose()` free the ports?** -> Closed TCP sockets remain in `TIME_WAIT` for 60–240 seconds.
4. **Why was each node capped at only 1,024 ports?** -> AKS cluster used default Load Balancer outbound rules instead of Azure NAT Gateway.
5. **Why did Incident Commander think Stripe was down?** -> Logs only showed outbound connection failure to `api.stripe.com` without SNAT telemetry.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Replace `new HttpClient()` with `IHttpClientFactory` + `PooledConnectionLifetime = 2m` | Checkout Team | Banned `new HttpClient` via `Microsoft.CodeAnalysis.BannedApiAnalyzers` |
| P0 | Attach Azure NAT Gateway + VNet Service Endpoints for Azure Storage/SQL | Cloud Infra | Bicep policy enforces NAT Gateway on all prod AKS subnets |
```
