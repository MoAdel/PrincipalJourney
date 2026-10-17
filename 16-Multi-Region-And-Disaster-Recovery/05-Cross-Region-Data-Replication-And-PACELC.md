# 05 — Cross-Region Data Replication, PACELC & Epoch Fencing Prevents Split-Brain

---

## 1. Preventing "Two Primaries" Split-Brain During Regional Failover

When Region A loses network connectivity to the outside world, Region B promotes itself to Primary (`Epoch = 2`). However, Region A's database might still be running internally and accepting writes from local pods for another 20 seconds!

### The Principal Defense: Epoch / Generation Fencing + Lease Termination

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;

namespace PrincipalJourney.MultiRegion;

public readonly record struct RegionalWriteFence(string RegionId, long FencingEpoch, DateTimeOffset LeaseExpiresUtc);

/// <summary>
/// Enforces that a regional API cell refuses to execute mutations if its regional lease
/// has expired or been superseded by a higher FencingEpoch in the global control plane.
/// </summary>
public sealed class EpochFencedMutationGuard(TimeProvider timeProvider)
{
    private volatile RegionalWriteFence _currentFence = new("us-east-1", FencingEpoch: 0, DateTimeOffset.MinValue);

    public void UpdateFenceFromConsensusLease(RegionalWriteFence freshFence)
    {
        if (freshFence.FencingEpoch >= _currentFence.FencingEpoch)
        {
            _currentFence = freshFence;
        }
    }

    public long EnsureRegionAuthorizedForMutation(string tenantHomeRegion)
    {
        var fence = _currentFence;
        var now = timeProvider.GetUtcNow();

        // 1. If we cannot renew our consensus heartbeat within the lease window, FAIL CLOSED for writes!
        // This guarantees the old primary stops accepting writes BEFORE the standby region promotes!
        if (now >= fence.LeaseExpiresUtc)
        {
            throw new InvalidOperationException(
                $"Region '{fence.RegionId}' write lease expired at {fence.LeaseExpiresUtc:O}. Refusing write to prevent Split-Brain.");
        }

        if (!string.Equals(fence.RegionId, tenantHomeRegion, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Tenant is pinned to '{tenantHomeRegion}', cannot execute primary mutation in '{fence.RegionId}'.");
        }

        return fence.FencingEpoch; // Pass monotonic epoch down to storage layer check!
    }
}
```

### Timeline Mathematics of Lease-Guarded Zero-Split-Brain Failover
$$	ext{Standby Promotion Delay} > 	ext{Primary Lease TTL} + 	ext{Max Clock Drift}$$
If the Primary Region must renew its lease every `5 seconds` and its lease expires after `15 seconds` (stopping all local writes immediately at `T+15.0s`), the Standby Region waits until `T+16.0s` before accepting promoted writes — making concurrent dual-primary writes **mathematically impossible**!
