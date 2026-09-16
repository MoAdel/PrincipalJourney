# Principal Engineering Workbench: Environment & Diagnostic Toolchain

> "A craftsman is only as effective as their mastery over their tools. A Principal Engineer does not guess how the runtime behaves; they attach a profiler, collect memory dumps, and verify the physical machine."

---

## 1. Core Runtime & SDK Specifications

To develop, benchmark, and stress-test high-throughput enterprise systems, the environment must mirror modern cloud-native Linux/Windows runtime environments.

| Component | Standard Specification | Verification Command | Purpose |
|---|---|---|---|
| **.NET SDK** | .NET 9.0 LTS (`v9.0.100+`) | `dotnet --version` | Runtime host, C# 13 compiler, DATAS GC engine. |
| **C# Compiler** | C# 13.0 | `dotnet build` | Ref structs, params collections, enhanced lock object. |
| **IDE / Editor** | Visual Studio 2022 Enterprise / VS Code / JetBrains Rider | `code --version` | Memory analysis, SOS debugger, Profiler. |
| **Container Engine** | Docker Desktop / Podman (WSL2 Backend) | `docker --version` | Local infrastructure emulation & multi-node clusters. |
| **Database Engines** | SQL Server 2022 CU14 & PostgreSQL 16 | `docker ps` | Relational storage, RCSI, MVCC, indexing internals. |
| **Cloud Storage** | Azurite v3.33+ | `azurite --version` | Azure Blob, Queue, and Table storage local emulator. |
| **Message Broker** | RabbitMQ 3.13 (Management) / Azure Service Bus Emulator | `docker ps` | AMQP 1.0 protocol, exchange routing, DLQ pipelines. |
| **Distributed Cache** | Redis 7.2 (Redis Stack) | `redis-cli ping` | In-memory caching, distributed locks, pub/sub streams. |

---

## 2. Low-Level Diagnostic & Troubleshooting Toolchain

A Principal Engineer isolates production issues using command-line diagnostic tools that execute on live running processes without stopping the application.

Install the official .NET Global Diagnostic CLI suite:

```bash
# Diagnostic collector tools
dotnet tool install --global dotnet-dump
dotnet tool install --global dotnet-trace
dotnet tool install --global dotnet-gcdump
dotnet tool install --global dotnet-counters
dotnet tool install --global dotnet-stack
dotnet tool install --global dotnet-symbol
dotnet tool install --global dotnet-sos

# Initialize SOS debugging extension
dotnet-sos install
```

### Diagnostic Tooling Matrix

```text
┌─────────────────┬─────────────────────────────────────────────────────────────┐
│ Tool            │ Principal Engineering Use Case                              │
├─────────────────┼─────────────────────────────────────────────────────────────┤
│ dotnet-dump     │ Capture & analyze process crash dumps without a native debugger.│
│ dotnet-trace    │ Sample-based CPU profiling to locate hot execution paths.    │
│ dotnet-gcdump   │ Lightweight GC memory snapshots to detect managed memory leaks. │
│ dotnet-counters │ Real-time terminal telemetry (Gen 0/1/2, ThreadPool queues).│
│ dotnet-stack    │ Instant capture of all active thread stack traces.          │
│ PerfView        │ Windows ETW kernel-level memory allocation & JIT analysis.  │
│ BenchmarkDotNet │ Micro-benchmarking with nanosecond precision & zero GC bias.│
└─────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## 3. Local Cloud & Infrastructure Stack (`docker-compose.yml`)

Run the entire supporting enterprise infrastructure locally in isolated containers:

```yaml
version: '3.8'

services:
  sqlserver:
    image: mcr.microsoft.com/mssql/server:2022-latest
    container_name: principal-sqlserver
    environment:
      - ACCEPT_EULA=Y
      - MSSQL_SA_PASSWORD=PrincipalSecurePassword!2026
    ports:
      - "1433:1433"
    volumes:
      - sqldata:/var/opt/mssql

  postgres:
    image: postgres:16-alpine
    container_name: principal-postgres
    environment:
      POSTGRES_USER: principal
      POSTGRES_PASSWORD: PrincipalSecurePassword!2026
      POSTGRES_DB: principaldb
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis/redis-stack:latest
    container_name: principal-redis
    ports:
      - "6379:6379"
      - "8001:8001"
    volumes:
      - redisdata:/data

  azurite:
    image: mcr.microsoft.com/azure-storage/azurite
    container_name: principal-azurite
    ports:
      - "10000:10000"
      - "10001:10001"
      - "10002:10002"
    volumes:
      - azuritedata:/data

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: principal-rabbitmq
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: principal
      RABBITMQ_DEFAULT_PASS: PrincipalSecurePassword!2026

volumes:
  sqldata:
  pgdata:
  redisdata:
  azuritedata:
```

---

## 4. Automated Architecture Governance

Every solution in this journey integrates automated architecture validation rules to prevent architectural erosion in CI/CD pipelines:

```xml
<ItemGroup>
  <!-- Architectural Invariant Testing -->
  <PackageReference Include="NetArchTest.Rules" Version="1.3.2" />
  <!-- Static Analysis & Threading Traps Prevention -->
  <PackageReference Include="Microsoft.VisualStudio.Threading.Analyzers" Version="17.11.20" PrivateAssets="all" />
  <!-- Micro-benchmarking -->
  <PackageReference Include="BenchmarkDotNet" Version="0.14.0" />
</ItemGroup>
```

---

## 5. Formal & Verified References

* [Microsoft Learn: .NET Diagnostic Tools Overview](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/)
* [Microsoft Learn: Performance Profiling with dotnet-trace and dotnet-dump](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-trace)
* [BenchmarkDotNet Official Documentation](https://benchmarkdotnet.org/)
* [NetArchTest: Architecture Unit Testing for .NET](https://github.com/BenMorris/NetArchTest)

