# 02 — Principal Engineering Workbench: Environment & Diagnostic Toolchain

> "A craftsman is only as effective as their mastery over their tools. A Principal Engineer does not guess how the runtime behaves; they attach a profiler, collect memory dumps, and verify the physical machine."

---

## 1. Core Runtime & SDK Specifications

To develop, benchmark, and stress-test high-throughput enterprise systems, the local workbench must mirror production Linux container cgroups and cloud infrastructure.

| Component | Standard Specification | Verification Command | Purpose | Validation & Rollback |
|---|---|---|---|---|
| **.NET SDK** | .NET 9.0 LTS (`v9.0.100+`) | `dotnet --version` | Runtime host, C# 13 compiler, DATAS GC engine. | Pin exact SDK in `global.json` with `rollForward: latestFeature`. |
| **C# Compiler** | C# 13.0 | `dotnet build -warnaserror` | `allows ref struct`, `System.Threading.Lock`, `params ReadOnlySpan<T>`. | Enforce `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` in `Directory.Build.props`. |
| **Container Engine** | Docker Engine 27+ (WSL2 / Linux) | `docker info` | Local cgroup v2 CPU/Memory limit emulation (`--memory`, `--cpus`). | Test OOM (`Exit 137`) behavior locally using `--memory=256m` before K8s deploy. |
| **Database Engines** | SQL Server 2022 CU14 & PostgreSQL 16 | `docker compose ps` | Relational storage, RCSI version store, MVCC, B-Tree & GIN indexing. | Verify execution plans with `SET STATISTICS IO, TIME ON` and `EXPLAIN (ANALYZE, BUFFERS)`. |
| **Cloud Storage** | Azurite v3.33+ | `azurite --version` | Azure Blob, Queue, and Table storage local emulator. | Validate multipart block commits and SAS clock-skew handling locally. |
| **Message Broker** | RabbitMQ 3.13 / Kafka (KRaft) | `docker compose logs rabbitmq` | AMQP 0-9-1 / 1.0, consumer prefetch, DLQ & Poison message routing. | Chaos-test broker restarts under active publishing to verify Outbox resilience. |
| **Distributed Cache** | Redis 7.2 (Redis Stack) | `redis-cli info memory` | Single-threaded event loop, Lua atomicity, Redlock, HNSW vector search. | Monitor `evicted_keys` and `blocked_clients` under `maxmemory-policy` stress. |

---

## 2. Low-Level Diagnostic & Live-Triage Toolchain

A Principal Engineer isolates production issues using non-invasive EventPipe and kernel tools that attach to live processes without halting traffic.

```bash
# Install the official .NET Global Diagnostic CLI suite
dotnet tool install --global dotnet-dump
dotnet tool install --global dotnet-trace
dotnet tool install --global dotnet-gcdump
dotnet tool install --global dotnet-counters
dotnet tool install --global dotnet-stack
dotnet tool install --global dotnet-symbol
dotnet tool install --global dotnet-sos

# Initialize SOS native debugging extension for lldb / windbg
dotnet-sos install
```

### Live Incident Triage Command Cheat Sheet (Copy-Paste Ready)

```bash
# 1. Watch real-time GC pauses, LOH size, ThreadPool queue length, and lock contention (1s refresh)
dotnet-counters monitor --refresh-interval 1 --counters System.Runtime,Microsoft.AspNetCore.Hosting -p <PID>

# 2. Capture 30-second CPU & ThreadPool starvation flamegraph without restarting the pod
dotnet-trace collect --profile cpu-sampling --duration 00:00:30 -p <PID> -o trace_incident.nettrace

# 3. Capture lightweight GC heap graph (safe on prod when full 16GB dump would trigger liveness timeout)
dotnet-gcdump collect -p <PID> -o heap_leak.gcdump

# 4. Instant thread stack snapshot across all managed threads (detect sync-over-async / deadlocks in <500ms)
dotnet-stack report -p <PID>

# 5. Linux Socket & Ephemeral Port Triage (detect SNAT / TIME_WAIT socket exhaustion)
ss -tan | awk '{print $1}' | sort | uniq -c | sort -nr
```

> 📐 **Derive It (Fermi Mode): Full Dump vs. GCDump Pod Eviction Risk**
> - **Inputs**: `HeapSizeGB = 12`, `DiskWriteThroughputMBps = 250`, `K8sLivenessTimeoutSec = 15`
> - **Formula**: `FreezeDurationSec = (HeapSizeGB * 1024) / DiskWriteThroughputMBps`
> - **Step-by-Step**:
>   1. Writing a full $12\text{ GB}$ `dotnet-dump` to network-attached block storage at $250\text{ MB/s}$ freezes the process for $\frac{12,288\text{ MB}}{250\text{ MB/s}} = 49.15\text{ seconds}$.
>   2. Kubernetes `livenessProbe` (`periodSeconds: 5, failureThreshold: 3` = $15\text{s}$) marks the pod dead at $T+15\text{s}$ and sends `SIGKILL`, destroying the dump mid-write!
>   3. By contrast, `dotnet-gcdump` streams only object reference headers ($pprox 2\%$ of heap size = $245\text{ MB}$), completing in $<1.0\text{ second}$ without tripping liveness probes.
> - **What-If Sensitivity**: If you MUST capture a full `dotnet-dump` on a $16\text{ GB}$ pod, temporarily patch the pod label out of the Service endpoint slice and suspend `livenessProbe` first, or write to a memory-backed `emptyDir: { medium: Memory }` volume ($>4\text{ GB/s}$).

---

## 3. Local Enterprise Infrastructure Stack (`docker-compose.yml`)

```yaml
services:
  sqlserver:
    image: mcr.microsoft.com/mssql/server:2022-latest
    container_name: principal-sqlserver
    environment:
      - ACCEPT_EULA=Y
      - MSSQL_SA_PASSWORD=PrincipalSecurePassword!2026
    ports:
      - "1433:1433"
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 4G

  postgres:
    image: pgvector/pgvector:pg16
    container_name: principal-postgres
    environment:
      POSTGRES_USER: principal
      POSTGRES_PASSWORD: PrincipalSecurePassword!2026
      POSTGRES_DB: principaldb
    ports:
      - "5432:5432"

  redis:
    image: redis/redis-stack:latest
    container_name: principal-redis
    ports:
      - "6379:6379"
      - "8001:8001"

  azurite:
    image: mcr.microsoft.com/azure-storage/azurite
    container_name: principal-azurite
    ports:
      - "10000:10000"
      - "10001:10001"
      - "10002:10002"

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: principal-rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: principal
      RABBITMQ_DEFAULT_PASS: PrincipalSecurePassword!2026
```

---

## 4. Formal & Verified References

* [Microsoft Learn: .NET Diagnostic Tools Overview](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/)
* [Brendan Gregg: Linux Crisis Tools & USE Method](https://www.brendangregg.com/usemethod.html)
* [BenchmarkDotNet Official Documentation](https://benchmarkdotnet.org/)
