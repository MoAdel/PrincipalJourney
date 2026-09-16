# Compute Architecture: Azure Container Apps (ACA) vs. AKS vs. App Service

> "Do not deploy a full Kubernetes cluster (AKS) simply because you need to run Docker containers. A Principal Engineer balances operational maintenance overhead against customization power."

---

## 1. Architectural Selection Matrix

```text
┌───────────────────────────┬─────────────────────┬──────────────────────┬──────────────────────┐
│ Evaluation Dimension      │ Azure App Service   │ Azure Container Apps │ Azure Kubernetes Svc │
│                           │ (Containers)        │ (ACA)                │ (AKS)                │
├───────────────────────────┼─────────────────────┼──────────────────────┼──────────────────────┤
│ Underlying Infrastructure │ Managed VM Cluster  │ Serverless MicroK8s  │ Full Kubernetes (K8s)│
│ Control Plane Management  │ 100% Microsoft      │ 100% Microsoft       │ Customer owns worker │
│                           │                     │ (Hidden control plane│ node lifecycle, OS   │
│ Operational Overhead      │ Minimal             │ Low                  │ High (Cluster admin, │
│                           │                     │                      │ upgrades, CNI, helm) │
│ Autoscaling Engine        │ CPU / Memory / Sched│ KEDA (Events, Queues,│ HPA + KEDA +         │
│                           │                     │ HTTP RPS, cron)      │ Cluster Autoscaler   │
│ Scale to Zero             │ No (VM always runs) │ YES (0 replicas)     │ Yes (Virtual Nodes/  │
│                           │                     │                      │ Keda on K8s)         │
│ Built-in Ingress Proxy    │ Front-end load bal  │ Envoy (mTLS, splits, │ Ingress Controller   │
│                           │                     │ traffic shifting)    │ (NGINX, Traefik, AGIC│
│ Dapr Integration          │ Manual / None       │ Native 1st-Class     │ Dapr Helm Chart      │
│ Best For                  │ Traditional Web APIs│ Modern Microservices,│ Massive enterprise   │
│                           │ and monoliths       │ Event-driven workers │ clusters (>500 pods) │
└───────────────────────────┴─────────────────────┴──────────────────────┴──────────────────────┘
```

---

## 2. Why Azure Container Apps (ACA) is the Default for .NET Microservices

Azure Container Apps abstracts away Kubernetes operational toil while preserving its best architectural innovations:
1. **No Cluster Upgrades**: Microsoft automatically patches the Kubernetes control plane, Linux kernel, and underlying worker nodes.
2. **KEDA Native**: Out-of-the-box scaling based on Azure Service Bus queue depth, Kafka consumer lag, or incoming HTTP request rate.
3. **Envoy Traffic Splitting**: Execute canary deployments and blue-green releases natively with declarative percentage weighting:
   * 90% traffic to `revision-v1`
   * 10% traffic to `revision-v2`
4. **Built-in Dapr (Distributed Application Runtime)**: Service invocation, state management, and pub/sub abstractions without managing Dapr daemonsets.

---

## 3. Sizing CPU & Memory Limits: The cgroup v2 Throttling Trap

In containerized Linux environments (ACA & AKS), CPU limits are enforced by the Linux kernel using **Completely Fair Scheduler (CFS) quotas** (`cgroup v2`):
* **CPU Request**: The guaranteed minimum CPU reservation used for pod scheduling.
* **CPU Limit**: The hard ceiling. If a .NET application exceeds its CPU quota within a 100ms CFS period, the Linux kernel **hard-throttles the CPU**, causing latency to spike by $1,000	imes$!

### The Principal Sizing Rule
For high-throughput .NET 9 Web APIs:
* Set **Memory Limit == Memory Request** to prevent sudden Linux Out-Of-Memory (`OOMKilled`) termination.
* **Avoid aggressive CPU limits** on multi-threaded workloads, or set CPU limits at least $2	imes - 3	imes$ CPU requests to accommodate bursty JIT compilation and garbage collection sweeps.

---

## 4. Formal & Verified References

* [Microsoft Learn: Azure Container Apps Overview](https://learn.microsoft.com/en-us/azure/container-apps/overview)
* [Microsoft Learn: Comparing Container Apps with other Azure container options](https://learn.microsoft.com/en-us/azure/container-apps/compare-options)
* [Kubernetes Documentation: Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
