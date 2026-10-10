# Principal DevOps & Continuous Delivery Competency Matrix

> "Anyone can run `docker build` on their laptop.
>
> A Principal Engineer designs hardened container lifecycle pipelines, multi-stage layer caching, artifact publishing registries, and zero-downtime release workflows that allow hundreds of developers to deploy safely fifty times a day."

---

## 1. The 5-Level DevOps Mastery Matrix

```text
┌───────┬───────────────────────────┬─────────────────────────────────────────────────────────────┐
│ Level │ Title                     │ Architectural Capabilities                                  │
├───────┼───────────────────────────┼─────────────────────────────────────────────────────────────┤
│ L1    │ Script Runner             │ Runs docker commands manually, edits basic YAML files.      │
│ L2    │ Container Practitioner    │ Writes basic Dockerfiles, builds CI jobs on push.          │
│ L3    │ Pipeline Engineer         │ Multi-stage builds, layer caching, automated test gates.   │
│ L4    │ Staff DevOps Architect    │ Monorepo path-filtering, artifact publishing, security scans│
│ L5    │ Principal Delivery Leader │ Enterprise GitOps governance, zero-downtime promotion gates,│
│       │                           │ container supply chain security, FinOps runner optimization.│
└───────┴───────────────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Competency Pillars

### Pillar 1: Production Containerization
- **Multi-Stage Dockerfiles**: Separating build environment (SDK) from runtime environment (ASP.NET Chiseled / Distroless).
- **Layer Caching Architecture**: Invariant ordering of instructions to maximize Docker build cache hit ratios.
- **Container Hardening**: Running as non-root users (`USER app`), read-only root filesystems, dropping Linux capabilities.
- **Container Lifecycle Management**: Signal propagation (`SIGTERM` graceful shutdown vs `SIGKILL`), health probes, and resource constraints.

### Pillar 2: Declarative CI/CD Pipelines
- **Pipeline Topologies**: GitHub Actions, Azure Pipelines YAML, and GitLab CI/CD.
- **Trigger Strategies**: Path-based filtering (`paths: ['src/**']`), tag filters, pull request validations, and scheduled runs.
- **Matrix Builds & Parallelism**: Testing across multiple operating systems (.NET on Linux/Windows) and runtime configurations concurrently.
- **Dependency & Cache Management**: Caching NuGet / npm packages across runner executions to achieve sub-3-minute pipeline runs.

### Pillar 3: Automated Quality & Security Gates
- **Continuous Testing**: Executing unit tests, integration tests, and architectural integrity tests (`NetArchTest`).
- **Static Analysis & Security Scanning**: SAST (SonarQube) and Container Vulnerability Scanning (Trivy, Grype) with build-failing thresholds.
- **Artifact Management**: Versioning and publishing enterprise packages to NuGet feeds, npm registries, and container registries (ACR/ECR).

### Pillar 4: Multi-Environment Release & Promotion
- **Promotion Flow**: Dev $ightarrow$ Staging $ightarrow$ Production environment progression.
- **Environment Protection**: Required reviewer approvals, deployment branch policies, and deployment protection rules.
- **Deployment Strategies**: Blue/Green deployments, Canary releases, and automated health-rollback loops.
