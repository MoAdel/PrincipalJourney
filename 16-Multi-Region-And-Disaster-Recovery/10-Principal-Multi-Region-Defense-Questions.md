# 10 — Principal Multi-Region & Disaster Recovery Defense Questions

---

### Question 1: The CAP / PACELC Physics Challenge on `RPO = 0` Across Continents
> *"The Board of Directors demands a Multi-Region Active-Active system across New York (`us-east`) and London (`eu-west`) with `RPO = 0` (zero data loss under any circumstance) AND `p99 < 25ms` write latency. How do you respond to the Board?"*

**Principal Defense**:
1. **State the Physical Law Clearly**: New York to London is `5,585 km` (~`3,470 miles`). Light in fiber optic glass travels at $\approx 200\text{ km/ms}$, and submarine cable routing adds ~`30%` path overhead, yielding a hard physical Round-Trip Time (RTT) floor of **`~68–75 ms`**.
2. **Why Both Requirements Cannot Simultaneously Hold Globally**:
   - Achieving `RPO = 0` across NY and London requires synchronous replication (waiting for London to acknowledge disk flush before returning `200 OK` in NY). That mathematically forces write latency $\ge 75\text{ ms}$, violating `p99 < 25ms`!
3. **The Principal Architecture That Satisfies the Business Intent**:
   - **Option A (Regional Synchronous 3-AZ + Nearby DR Region)**: Replicate synchronously across 3 Availability Zones in `us-east-1` (`1.5ms` RTT) OR synchronously between `us-east-1` (Virginia) and `us-east-2` (Ohio — `11ms` RTT), achieving **`RPO = 0` against an entire region loss** while keeping write latency **`< 18ms`**, with asynchronous replication (`RPO < 2s`) to London!
   - **Option B (Tenant-Pinned Cells)**: Pin US customers to the US multi-AZ quorum (`< 15ms` writes) and UK/EU customers to the EU multi-AZ quorum (`< 15ms` writes).

---

### Question 2: The FinOps / Cost Defense Axis — Hot-Hot 100% Standby vs. Pilot Light + Spot/Scale-Set
> *"Keeping an identical 200-node Kubernetes cluster and 64-vCore database running 24/7 in `us-west-2` just in case `us-east-1` goes down costs $52,000/month ($624,000/year). Defend the 80%-good alternative at 25% of the cost."*

**Principal Defense**:
1. **Eliminate Idle Compute Waste via Tenant-Pinned Active-Active OR Warm Scale-Down**:
   - **Strategy 1 (Zero Idle Waste — Tenant Sharding)**: Route `30%` of live West-Coast production traffic to `us-west-2` every day. Now `us-west-2` is earning revenue 24/7 rather than sitting idle, and its caches, JIT code paths, and quotas are continuously proven under live load!
   - **Strategy 2 (If Strictly Active-Passive)**: Keep the **Stateful Tier (Database Geo-Replica)** warm (`$7,500/mo`) because terabytes of data cannot be copied in 2 minutes, but scale the **Stateless Compute Tier (AKS Node Pool)** down to a `10%` Warm Pilot Light (`$4,200/mo`) backed by pre-pulled Chiseled `<70MB` images and Azure VM Scale Set Standby Pools (`< 45s` scale-out), saving **$480,000/year** while maintaining `RTO < 3 minutes` and `RPO < 5 seconds`!
