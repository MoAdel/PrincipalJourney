# Production Hands-On DevOps Labs (5 Scenarios)

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


## Lab 1: Shrinking a 4.2 GB Image to 68 MB
- **Objective**: Refactor a bloated single-stage Dockerfile into a 3-stage hardened build using `chiseled` non-root base images.
- **Verification**: Inspect final image size (`docker images`); verify non-root execution (`docker exec whoami` returns UID 1654).

## Lab 2: Multi-Stage GitHub Actions Pipeline
- **Objective**: Author a `.github/workflows/ci.yml` pipeline with NuGet caching, locked restore, and zero-warning compilation.
- **Verification**: Trigger a commit and verify build execution completes in under 3 minutes with cache hit.

## Lab 3: Automated Trivy Security Gate
- **Objective**: Integrate Trivy container vulnerability scanner in CI, failing the build on High/Critical vulnerabilities.
- **Verification**: Introduce a known vulnerable library; verify pipeline terminates with exit code 1.

## Lab 4: Packaging & Publishing NuGet Libraries
- **Objective**: Package an enterprise contracts project into an immutable `.nupkg` and push to an artifact registry with automated SemVer.

## Lab 5: Blue/Green Traffic Cutover Simulation
- **Objective**: Deploy two container revisions and simulate zero-downtime routing cutover using an Envoy / NGINX reverse proxy.
