# Inside KEDA & Envoy Internals: Autoscaling Loops & Sidecar Routing

> "Autoscaling is a control loop with hysteresis: scale up too slowly and requests queue; scale up too quickly and you create a herd of expensive, idle containers."

---

## 1. The KEDA Control Loop Architecture

Kubernetes Event-driven Autoscaling (KEDA) acts as an external metrics provider that feeds custom metrics into the Kubernetes Horizontal Pod Autoscaler (HPA):

```mermaid
flowchart TD
    subgraph TriggerSource["External Event Source"]
        Queue["Azure Service Bus Queue
(Current Depth: 12,500 messages)"]
    end

    subgraph KEDAEvaluation["KEDA Operator Controller Loop"]
        Scaler["KEDA Scaler (Polling Interval: 15s)"]
        MetricsAdapter["KEDA Metrics Adapter
(Converts Queue Depth to Custom Metric)"]
    end

    subgraph KubernetesCore["Container Apps / K8s Core"]
        HPA["Horizontal Pod Autoscaler (HPA Loop: 15s)"]
        Deployment["Pod Replica Controller
(Target: 100 msgs / Pod)"]
        Pods["Worker Pod Cluster
(Scaled from 1 -> 125 Pods)"]
    end

    Queue -.->|1. Query Message Count| Scaler
    Scaler -->|2. Feed Metric| MetricsAdapter
    MetricsAdapter -->|3. Query Metric| HPA
    HPA -->|4. Replicas = Ceil(12500 / 100) = 125| Deployment
    Deployment -->|5. Launch Replicas| Pods
```

### KEDA Scaling Equation
$$	ext{Desired Replicas} = \left\lceil rac{	ext{Current Metric Value}}{	ext{Target Value Per Replica}} ightceil = \left\lceil rac{12,500}{100} ightceil = 125	ext{ Replicas}$$

---

## 2. Scaling to Zero: The Cold Start Mechanics

When `minReplicas: 0`, ACA terminates all pods when the queue is empty:
1. **Traffic/Queue Awakening**:
   * An incoming message arrives at the empty queue.
   * KEDA detects message count $> 0$ and signals the controller to scale from 0 to 1.
2. **The Cold Start Latency Tax**:
   * Node pull image: $1 - 4	ext{ seconds}$ (if cached).
   * Container creation: $500	ext{ ms}$.
   * .NET 9 CLR JIT boot & Dependency Injection graph initialization: $600	ext{ ms} - 1.5	ext{ seconds}$.
   * **Total Cold Start**: $pprox 2.5 - 6.0	ext{ seconds}$!

### The Principal Production Standard
For user-facing HTTP APIs, **never set `minReplicas: 0`**. Always maintain $	ext{minReplicas} \ge 2$ across independent Availability Zones to guarantee zero cold-start penalty and survive single-node eviction.

---

## 3. Envoy Sidecar Proxy Ingress Mechanics

In Azure Container Apps, incoming HTTP traffic does not hit your C# Kestrel server directly. It passes through an internal **Envoy Sidecar Proxy**:

```text
External Client
       │ (TLS 1.3 / Port 443)
       ▼
[ Azure Container Apps Ingress Controller ]
       │ (Mutual TLS - mTLS)
       ▼
[ Envoy Proxy Sidecar (Port 8080) ]
       │ • Gzip / Brotli Decompression
       │ • Request Header Sanitization & W3C Trace Injection
       │ • Local Circuit Breaking & Connection Pooling
       ▼ (HTTP/1.1 or HTTP/2 Cleartext over localhost)
[ ASP.NET Core Kestrel Runtime (.NET 9) ]
```

Because Envoy terminates mTLS and handles HTTP connection pooling, your Kestrel server benefits from persistent, pre-warmed local sockets with zero TLS handshake overhead!

---

## 4. Formal & Verified References

* [KEDA Official Documentation: How KEDA Works](https://keda.sh/docs/latest/concepts/)
* [Envoy Proxy Architecture & Threading Model](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/intro/threading_model)
* [Microsoft Learn: Set Up Autoscaling Rules in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)
