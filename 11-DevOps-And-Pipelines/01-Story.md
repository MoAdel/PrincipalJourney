# The Incident: The Broken Pipeline & The 4GB Fat Image Meltdown

On December 4, 2026, during a critical pre-holiday release window, Nova Commerce suffered a severe delivery gridlock.

A junior developer merged a feature branch containing an unoptimized single-stage Dockerfile that copied the entire repository, including `bin/`, `obj/`, temporary test databases, and the full .NET SDK tooling into the final runtime image. 

Within two hours, the following cascading failures brought engineering to an absolute standstill:
1. **The 4.2 GB Image Registry Denial-of-Service**: Each build produced an uncompressed 4.2 GB container image. When the Kubernetes cluster triggered an auto-scaling event across 20 nodes, all 20 nodes attempted to pull 4.2 GB concurrently over the container network, exhausting the Azure Container Registry (ACR) network bandwidth quota and triggering image pull back-offs (`ImagePullBackOff`).
2. **The 45-Minute CI Pipeline Gridlock**: Because layer caching had been broken by placing `COPY . .` before `RUN dotnet restore`, every tiny commit forced a full package restoration and recompilation, ballooning build times from 3 minutes to 45 minutes and exhausting GitHub Actions runner concurrency limits.
3. **The Unreviewed Hotfix Push to Production**: Panicking developers bypassed the staging approval gate using administrative credentials and pushed an untagged `latest` container image directly to production, which failed health probes due to root permission conflicts and took down the checkout service for 28 minutes.

---

## 1. Root Cause Analysis

```mermaid
flowchart TD
    Dev[Developer Commit] -->|Single-Stage Dockerfile with SDK| FatImage[4.2 GB Fat Image Built]
    FatImage -->|Pushed to Registry| ACR[(Azure Container Registry)]
    
    subgraph ClusterFailure ["Production Cluster Auto-Scale Event"]
        K8sNode1[Worker Node 1] -->|Pull 4.2 GB Image| ACR
        K8sNode2[Worker Node 2] -->|Pull 4.2 GB Image| ACR
        K8sNode3[Worker Node 3] -->|Pull 4.2 GB Image| ACR
        Note over ACR: ACR Egress Bandwidth Exhausted! 504 Gateway Timeout
        K8sNode1 & K8sNode2 & K8sNode3 -->|ImagePullBackOff| PodCrash[Checkout Service Down!]
    end
```

---

## 2. The Principal Engineer Intervention

The Principal DevOps Architect established five mandatory operational standards:
1. **Strict Multi-Stage Builds**: Compile using the heavy SDK image; run using the minimal `chiseled` / `distroless` runtime image (shrinking image size from 4.2 GB to **68 MB**).
2. **Deterministic Layer Caching**: Order Dockerfile instructions from least-frequently-changing (base OS, dependencies) to most-frequently-changing (application code).
3. **Immutable Semantic Tagging**: Ban the `latest` tag in production; enforce immutable tags combining SemVer and Git commit SHA (`v1.4.2-b9e4a12`).
4. **Declarative Pipeline Promotion**: Multi-stage GitHub Actions / Azure Pipelines with mandatory automated testing gates (`dotnet test`, `NetArchTest`, Trivy container vulnerability scanning) and manual environment approvals for Production.
