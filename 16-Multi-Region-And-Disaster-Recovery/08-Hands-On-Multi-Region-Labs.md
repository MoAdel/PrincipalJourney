# 08 — Hands-On Labs: Multi-Region Failover, Fencing & Split-Brain Prevention

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


## Lab 1: Simulating Network Partition & Epoch Fencing in .NET 9
1. Launch two instances of the API (`Region=us-east`, `Region=us-west`) alongside Redis (simulating the consensus lease store) and two PostgreSQL containers.
2. Execute concurrent balance transfers while injecting a network partition (`docker network disconnect`) between `us-east` and the consensus lease store.
3. Verify that `EpochFencedMutationGuard` halts writes in `us-east` at `T+15.0s` (`LeaseExpiresUtc`) and `us-west` promotes at `T+16.0s` with `FencingEpoch = 2`, resulting in **zero duplicate balance withdrawals**.

---

## Lab 2: Measuring DNS Caching Traps vs. `PooledConnectionLifetime`
1. Create a client load generator using `new HttpClient()` with default infinite connection pooling vs. `new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromSeconds(30) }`.
2. Switch the upstream IP mapping mid-test and measure how long the un-configured client continues hammering the dead regional IP!
