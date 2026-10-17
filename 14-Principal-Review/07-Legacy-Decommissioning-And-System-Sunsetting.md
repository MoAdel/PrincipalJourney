# 07 — Legacy System Decommissioning, Strangler Fig & Zero-Risk Sunsetting

> "Anyone can build a greenfield microservice. A Principal Engineer proves their worth by safely turning off a 12-year-old $500M/year legacy monolith without dropping a single webhook, cron job, or undocumented partner integration."

---

## 1. The 6-Phase Strangler Fig & Dark-Traffic Decommissioning Protocol

```text
[Client Traffic]
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ YARP / Envoy Strangler Proxy                                │
│  Phase 1: 100% Legacy                                       │
│  Phase 2: 100% Legacy + Async Dark-Traffic Mirror to New    │
│  Phase 3: Shadow Diff Engine (Compare Status & JSON Body)   │
│  Phase 4: Canary Read Cutover (1% -> 10% -> 50% -> 100%)    │
│  Phase 5: Dual-Write / CDC Reverse Sync (Rollback Insurance)│
│  Phase 6: Scream Test -> Freeze -> Archive -> Decommission  │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
     [Legacy Monolith]               [New Modern Service]
```

### Phase 3 Deep Dive: Automated Dark-Traffic Shadow Diffing in C#

Before routing a single live customer response from the new service, mirror production `GET` requests asynchronously and compare payloads in the background (stripping non-deterministic timestamps/UUIDs):

```csharp
public sealed class ShadowTrafficDiffWorker(
    IHttpClientFactory httpClientFactory,
    ILogger<ShadowTrafficDiffWorker> logger)
{
    public async Task CompareReadResponseAsync(
        string requestPath,
        string legacyJsonPayload,
        int legacyStatusCode,
        CancellationToken ct)
    {
        try
        {
            using var client = httpClientFactory.CreateClient("CandidateNewService");
            using var response = await client.GetAsync(requestPath, ct);
            var candidateJson = await response.Content.ReadAsStringAsync(ct);

            if ((int)response.StatusCode != legacyStatusCode ||
                !JsonSemanticComparer.AreEquivalent(legacyJsonPayload, candidateJson, ignoreFields: ["traceId", "generatedAt"]))
            {
                logger.LogWarning(
                    "Shadow Diff Mismatch on {Path}: LegacyStatus={LegacyStatus}, CandidateStatus={CandidateStatus}",
                    requestPath, legacyStatusCode, (int)response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            // Shadow failures MUST NEVER impact the primary customer request path
            logger.LogDebug(ex, "Shadow comparison suppressed error on {Path}", requestPath);
        }
    }
}
```

---

## 2. The Legacy Sunsetting Checklist (Finding Hidden Consumers)

Before powering down legacy infrastructure:
1. **Inspect Network Flow Logs (`VNet Flow Logs` / `VPC Flow Logs`)**: Never trust tribal knowledge ("nobody calls that server anymore"). Check 30 days of TCP connection logs for the quarterly finance batch job that runs on the last Sunday of the month!
2. **Execute the "Scream Test" (Controlled Brownout)**:
   - Temporarily block ingress traffic via firewall/NSG rule for 15 minutes during low-traffic business hours while keeping the server hot and ready to un-block in `< 5 seconds`.
3. **Database Read-Only Freeze & Final Snapshot**:
   - Set `ALTER DATABASE LegacyDb SET READ_ONLY`, retain an immutable cold-storage snapshot (`Azure Archive Blob` at `$0.00099/GB/month`) for regulatory retention, and delete the compute instances.
