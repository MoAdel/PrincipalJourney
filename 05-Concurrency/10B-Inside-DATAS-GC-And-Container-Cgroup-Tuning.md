# 10B — Inside .NET 9 DATAS GC & Kubernetes Container Cgroup Memory Tuning

> "Why did our 2GB Kubernetes pod crash with `Exit Code 137 (OOMKilled)` when prometheus showed only 400MB of live objects? Because classic Server GC optimized for bare-metal throughput, not container cgroup ceilings."

---

## 1. Workstation vs. Classic Server GC vs. DATAS (Dynamic Adaptation To Application Sizes)

In .NET 8 and .NET 9 (where **DATAS is enabled by default**), the garbage collector dynamically scales both the **number of GC heaps** and the **Gen 0 allocation budget** between bursty traffic and idle troughs:

```text
Classic Server GC (32-Core Host, Pod Limited to 2 Cores / 1GB RAM):
  • Allocates 32 independent GC heaps + 32 dedicated GC threads!
  • Resists triggering Gen 2 GC until heap approaches 75% of container limit.
  • Sudden traffic burst allocates faster than background GC can sweep -> Linux Kernel OOMKiller sends SIGKILL (Exit 137)!

.NET 9 DATAS GC (Dynamic Adaptation To Application Sizes):
  • Tunes heap count and Gen 0 budget dynamically based on live Long-Lived Data Size (LDS).
  • Compacts and releases empty segments back to the OS (`MADV_DONTNEED`) during traffic troughs.
```

| GC Mode | Config Setting | Throughput (Max RPS) | Memory Working Set | Container Density Suitability | Validation & Rollback |
|---|---|---|---|---|---|
| **Workstation GC** | `ServerGarbageCollection=false` | Lowest (1 heap) | Lowest (`~60–120 MB`) | Good for `< 1 vCore` sidecars | Switch back via env var without rebuild. |
| **Classic Server GC** | `ServerGarbageCollection=true`, `GCDynamicAdaptationMode=0` | **Highest** (`+15–25%` raw RPS) | **Highest** (Holds max peak RAM forever) | Dangerous in dense K8s clusters without `GCHeapHardLimit` | Monitor `container_memory_working_set_bytes`; rollback if > 80% limit. |
| **DATAS Server GC (.NET 9 Default)** | `ServerGarbageCollection=true`, `GCDynamicAdaptationMode=1` | High (Within `2–5%` of Classic Server) | **Adaptive** (Shrinks up to `50–70%` at idle) | **Optimal default** for cloud-native microservices | Benchmark $p99$ latency under burst load before disabling. |

> 📐 **Derive It (Fermi Mode): Container Cgroup Memory Budget & `DOTNET_GCHeapHardLimitPercent`**
> - **Inputs**: `ContainerLimitMB = 1024`, `NonGCManagedOverheadMB = 220`, `DefaultHardLimitPercent = 75`
> - **Formula**: `MaxProcessMemoryMB = (ContainerLimitMB * (DefaultHardLimitPercent / 100)) + NonGCManagedOverheadMB`
> - **Step-by-Step**:
>   1. A .NET process consumes more than just the GC Managed Heap: JIT native code cache (`~40 MB`), loaded runtime/assemblies (`~60 MB`), thread stacks ($80\text{ threads} \times 1\text{ MB} = 80\text{ MB}$), and Kestrel/Socket unmanaged buffers (`~40 MB`) total $\approx 220\text{ MB}$ of unmanaged memory.
>   2. By default inside a container, .NET sets the GC heap hard limit to `75%` of the cgroup memory limit: $1,024\text{ MB} \times 0.75 = 768\text{ MB}$.
>   3. Total RSS working set under peak GC pressure: $768\text{ MB (GC Heap)} + 220\text{ MB (Native/Stacks)} = 988\text{ MB}$ (leaving only $36\text{ MB}$ headroom before Linux Kernel OOMKiller fires `SIGKILL`!).
> - **What-If Sensitivity**: If a single code path allocates $50\text{ MB}$ of unmanaged memory (e.g., `SkiaSharp` image buffer or large gRPC native payload), total RSS hits $1,038\text{ MB} > 1,024\text{ MB}$ -> instant `Exit Code 137`! For pods $\le 1\text{ GB}$, explicitly set `DOTNET_GCHeapHardLimitPercent=60` (or `0x3C`).

---

## 2. Production Kubernetes Deployment Configuration for .NET 9 GC

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: high-throughput-order-api
spec:
  template:
    spec:
      containers:
        - name: api
          image: ghcr.io/principal/order-api@sha256:4a8b9c...
          resources:
            requests:
              cpu: "2000m"
              memory: "1024Mi"
            limits:
              cpu: "2000m"       # Match requests=limits to prevent CFS CPU throttling stalls during GC!
              memory: "1024Mi"
          env:
            # 1. Enable DATAS adaptive Server GC (.NET 9 default, explicit for governance clarity)
            - name: DOTNET_GCServer
              value: "1"
            - name: DOTNET_GCDynamicAdaptationMode
              value: "1"
            # 2. Cap managed GC heap at 60% of 1024Mi (~614Mi) to leave 410Mi safe headroom for native/stacks
            - name: DOTNET_GCHeapHardLimitPercent
              value: "3C" # Hex 0x3C = 60%
```
