# 11 — Sprint 16 Executive Summary & The 10 Laws of Multi-Region Architecture

---

## The 10 Invariant Laws

1. **Law 1 (Physics Beats Slides)**: Cross-continental synchronous replication pays a `70–150ms` speed-of-light tax on every write. Never promise `RPO = 0` and `< 20ms` global writes across oceans without local regional pinning.
2. **Law 2 (Pin Writes by Tenant/Cell)**: Prefer **Tenant-Pinned Active-Active Cells** over unpinned multi-master writes to eliminate distributed lock contention and split-brain conflicts.
3. **Law 3 (Fence Old Primaries with Leases)**: A standby region must never promote to primary until the old primary's consensus write lease has mathematically expired (`PromotionTime > LeaseTTL + ClockDrift`).
4. **Law 4 (Bypass DNS TTLs with Anycast Edge)**: Use BGP Anycast L7 Global Load Balancers (Front Door / CloudFront / Cloudflare) for sub-30-second failover; enforce `PooledConnectionLifetime` on all internal HTTP clients.
5. **Law 5 (Enforce Regional Quota Parity)**: Automated monitoring must verify that the DR region's cloud vCore, IOPS, and rate-limit quotas can absorb 100% of peak global traffic.
6. **Law 6 (Protect Cold Caches on Failover)**: Guard databases behind single-flight request coalescing and shed Tier-2 load automatically during regional failover so cold caches don't melt the surviving database.
7. **Law 7 (Never Depend on Control Planes During Data-Plane Recovery)**: Never require calling Azure ARM / AWS Control Plane APIs or fetching cold KeyVault secrets per request to survive a failover.
8. **Law 8 (Test Failback as Rigorously as Failover)**: Failing over to DR is only half the battle; returning to the primary region after recovery requires deterministic reverse synchronization.
9. **Law 9 (Tier Services by Business Impact)**: Reserve multi-region Active-Active for Tier-0/Tier-1 systems; use IaC + geo-redundant backups (`GRS`) for Tier-2 batch/internal systems.
10. **Law 10 (Untested RTO is Infinite)**: Run automated quarterly DR GameDays in production to prove `RTO` and `RPO` empirically.
