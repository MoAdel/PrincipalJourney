# Incident 01: The "Taylor Swift" Celebrity Hot-Partition Shard Meltdown

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Azure Cosmos DB / Partitioned NoSQL Cluster (`100,000 RU/s` Provisioned across 20 Physical Partitions)  
> **Business Impact**: 92% of ticket checkouts failing with `HTTP 429 TooManyRequests` even though total cluster RU utilization was at only `14%`!  
> **Competencies Mastered**: Physical Partition Throughput Dilution (`Total RU / Physical Partitions`), Partition Key Design (`EventId` vs. Salted Write-Sharding `EventId#0..15`), Scatter-Gather Read Aggregation

---

## 🚨 1. The 10:00 AM Crisis Briefing

For a major stadium concert on-sale (`EventId = "EVT-9900"`), the team pre-scaled the Cosmos DB collection to `100,000 RU/s` across `20` physical partitions (`PartitionKey = /EventId`). At `10:00:01 AM`, checkouts immediately crashed with `HTTP 429 (RequestRateTooLarge)`:

```text
[10:00:02] App Alert: CosmosException (429): Request rate is large. More Request Units may be needed!
[10:00:10] RED HERRING: SRE scales cluster from 100,000 RU/s to 200,000 RU/s — and 429s DO NOT DROP AT ALL!
[10:00:35] Cloud Portal: Total Database RU Utilization is only 14,200 / 100,000 RU/s (14.2%)!
```

> 📐 **Derive It (Fermi Mode): Single Physical Partition Ceiling vs. Provisioned Cluster RUs**
> - **Inputs**: `TotalClusterRUs = 100000`, `PhysicalPartitions = 20`, `SingleEventDemandRUs = 45000`, `MaxPhysicalPartitionCeilingRUs = 10000`
> - **Formula**: `PerPartitionAllottedRUs = Min(TotalClusterRUs / PhysicalPartitions, MaxPhysicalPartitionCeilingRUs)`
> - **Step-by-Step**:
>   1. In partitioned databases (Cosmos DB, DynamoDB, Cassandra), total provisioned throughput (`100,000 RU/s`) is **divided evenly across all `20` physical partitions**: $\frac{100,000}{20} = 5,000\text{ RU/s per physical partition}$ (with an absolute hardware ceiling of `10,000 RU/s` per physical partition!).
>   2. Because `PartitionKey` was set to `/EventId`, **100% of writes for `"EVT-9900"` (`45,000 RU/s`) hashed to Physical Partition #7**!
>   3. Partitions #1–#6 and #8–#20 sat at `0%` (`95,000 RU/s` wasted idle!), while Partition #7 was hammered at $900\%$ of its `5,000 RU/s` allocation!
>   4. Worse: scaling the database to `400,000 RU/s` triggers partition splits, which **still caps a single logical partition key (`"EVT-9900"`) at the `10,000 RU/s` single-physical-partition hardware ceiling**!
> - **What-If Sensitivity**: Applying **Write-Sharding (Salted Partition Keys: `"EVT-9900#00"` through `"EVT-9900#19"`)** spreads `"EVT-9900"` writes evenly across all `20` physical partitions, unlocking the full **`100,000 RU/s` (`0%` 429 throttling)** immediately!

<!-- TELEMETRY_WIDGET: title="Hot Partition Skew (Partition #7 @ 100% vs Cluster @ 14%)" metric1="Hot Partition #7 RU (%)" metric2="Cluster Average RU (%)" threshold="5000 RU/s Per-Partition Cap" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Expose the "14% Cluster Utilization" Red Herring — query NormalizedRUConsumption by PartitionKeyRangeId!
az monitor metrics list --resource "$COSMOS_RESOURCE_ID"   --metric "NormalizedRUConsumption" --dimension "PartitionKeyRangeId" --interval PT1M
# Output: PartitionKeyRangeId '7' = 100.0% | All other 19 partitions = 1.2%!
```

### Observed Culprit Entity Design
```csharp
// ❌ HOT-SPOT PARTITION KEY: All 500,000 fans buying the same concert hit 1 single partition key!
public sealed record TicketReservation(
    string id,
    string EventId, // <-- PartitionKey = /EventId ("EVT-9900" gets 100% of traffic!)
    string UserId,
    int SeatSection);
```

<!-- PREDICT_GATE: Commit your hypothesis: Why did doubling cluster RUs from 100k to 200k fail to stop the 429s on a single hot `EventId`, and how do you design Salted / Hierarchical Partition Keys without breaking reads? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why a Single Logical Partition Key Can Never Span Multiple Physical Partitions
* Distributed storage engines guarantee atomic transactions and fast range scans *within* a single logical partition key by pinning all documents with `EventId == "EVT-9900"` to a single physical storage replica set (capped at `10,000 RU/s` in Cosmos DB / `1,000 WCU` in DynamoDB).
* No matter how much money you spend scaling the collection, a single logical partition key value can **never** exceed the throughput of 1 physical machine!

### 2. Two Principal Solutions: Write-Sharding (Salting) vs. Hierarchical Partition Keys
1. **Hierarchical Partition Keys (`/EventId`, `/SeatSectionId` or `/UserId`)**: Allows physical partition splits *within* a large `EventId` while still supporting targeted prefix queries!
2. **Calculated Bucket Salting (`{EventId}#{Hash(UserId) % 20}`)**: Deterministically routes a specific user's reservation to bucket `0..19` (so point lookups by `UserId` hit **only 1 partition**, while writes spread evenly across all 20 partitions!).

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.IO.Hashing;
using System.Text;

namespace PrincipalJourney.SystemDesign.WarRoom;

public static class HotPartitionShardingRouter
{
    private const int ShardBucketCount = 20;

    /// <summary>
    /// Deterministically computes a salted partition key from (EventId + UserId).
    /// - Writes spread uniformly across 20 physical partitions (unlocking 20x throughput!).
    /// - Point lookups for a User's ticket in an Event are O(1) single-partition reads (NO scatter-gather needed!).
    /// </summary>
    public static string ComputeDeterministicShardKey(string eventId, string userId)
    {
        uint hash = Crc32.HashToUInt32(Encoding.UTF8.GetBytes(userId));
        uint bucket = hash % ShardBucketCount;
        return $"{eventId}#b{bucket:D2}";
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (`PartitionKey = /EventId`) | After (`{EventId}#b{00..19}` Deterministic Sharding) | Validation & Rollback Procedure |
|---|---|---|---|
| **Max Sustainable Event Throughput** | `5,000 RU/s` (`92%` HTTP 429s) | **`100,000 RU/s`** (`0%` HTTP 429s across 20 shards) | Load test single `EventId` at 50k RU/s; assert max `NormalizedRUConsumption` skew `< 15%`. |
| **User Ticket Lookup Cost** | `1 RU` | **`1 RU`** (Deterministic bucket from `UserId` avoids scatter-gather!) | Verify point-read RU charge in response headers (`x-ms-request-charge < 1.5`). |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Instead of salting with `Hash(UserId) % 20`, why not use `Random.Shared.Next(0, 20)` when inserting the ticket?"*

**The Principal Defense**:
> *"Using a random number on write spreads the write load, **but destroys your read path**! When the user refreshes their page (`GET /events/EVT-9900/my-ticket`), you wouldn't know which of the 20 random buckets holds their ticket, forcing a **20-partition Scatter-Gather fan-out query** on every single read ($20	imes$ read RU cost and $p99$ tail latency)! Deterministically hashing `UserId % 20` gives you uniform distribution across writes AND $O(1)$ single-partition lookups for user reads!"*

### Question 2 (The Second-Order Failure Mode):
> *"If the ticket records are sharded across 20 partitions, how do we prevent overselling when only 50 seats remain in Section A?"*

**The Principal Defense**:
> *"Never count remaining seats by running `SELECT COUNT(*)` across 20 document shards! Partition inventory naturally by the physical constraint: **`SeatSection` or `Row`** (e.g., `EVT-9900#Sec-104` holds 200 seats in a single partition or atomic Redis Lua decrement slot per section), so atomic seat claiming happens within a single physical boundary while stadium-wide load spreads across 250 sections!"*

### Question 3 (The FinOps / Cost Axis):
> *"Keeping Cosmos DB provisioned at `100,000 RU/s` 24/7 just for two 10-minute concert drops per week costs $5,840/month. Defend the 80%-good alternative at 15% of the cost."*

**The Principal Defense**:
> *"First, enable **Cosmos DB Autoscale** (scales dynamically between `10%` baseline = `10,000 RU/s` during idle hours and `100,000 RU/s` during drops). Second, put a **Virtual Waiting Room / Token Queue at the Edge (Cloudflare / Front Door + Redis)** that meters admission into the checkout funnel at a steady `2,500 RU/s` pace. Smoothing a 30-second spike into a 4-minute fair FIFO queue cuts peak database provisioning cost by **85%** ($850/month)!"*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-1001 — Hot-Partition Celebrity Shard Meltdown

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 1 minute | **Mitigation Latency (TTM)**: 28 minutes

## Five Whys Root Cause Chain
1. **Why did 92% of checkouts fail with 429?** -> Physical Partition #7 throttled all requests exceeding 5,000 RU/s.
2. **Why did Partition #7 only have 5,000 RU/s when the DB had 100,000 RU/s?** -> Provisioned RUs are divided evenly across all 20 physical partitions (`100k / 20 = 5k`).
3. **Why did 100% of traffic hit Partition #7?** -> The partition key was `/EventId`, and 100% of buyers wanted the same concert (`EVT-9900`).
4. **Why didn't scaling to 200,000 RU/s fix it?** -> A single logical partition key cannot exceed the throughput of 1 physical partition (`10,000 RU/s` max).
5. **Why did the SRE think capacity was fine initially?** -> Dashboards showed average database RU (14%) instead of `MAX(NormalizedRUConsumption)` per `PartitionKeyRangeId`.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Migrate to Hierarchical Partition Keys (`/EventId`, `/SectionId`) + Deterministic User Bucketing | Ticketing Team | Load test single EventId at 50k RU/s in staging |
| P1 | Alert on `MAX(NormalizedRUConsumption) by (PartitionKeyRangeId) > 75%` | SRE Team | Deployed to Azure Monitor / Grafana |
```
