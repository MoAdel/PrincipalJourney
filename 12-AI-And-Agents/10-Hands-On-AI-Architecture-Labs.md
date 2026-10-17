# Production Hands-On AI Labs (5 Scenarios)

> "Architecture is verified only when your code passes real-world benchmarks.
>
> In these 5 labs, you will implement vector similarity algorithms, build hybrid retrieval engines, construct ReAct loops, write an MCP server, and enforce multi-tenant document security."

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


## Lab 1: SIMD-Accelerated Vector Distance Engine
- **Objective**: Implement Cosine Similarity, Dot Product, and Euclidean Distance in C# using `System.Numerics.Vector<float>` for hardware acceleration.
- **Verification**: Benchmark 1,000,000 pairwise distance comparisons; demonstrate that normalized Dot Product executes $>3	imes$ faster than standard Cosine Similarity.

## Lab 2: Hybrid RAG Pipeline with Reciprocal Rank Fusion
- **Objective**: Build a dual-rail retriever querying dense embeddings (HNSW simulated) and sparse keywords (BM25 simulated) and merging ranks with $k=60$ RRF.
- **Verification**: Prove that exact identifier queries (`SKU-4921-X`) correctly surface to rank #1 despite semantic vector dilution.

## Lab 3: Production ReAct Agent Loop
- **Objective**: Construct an autonomous ReAct loop with trajectory recording, tool registration, output truncation, and a 5-step iteration guard.
- **Verification**: Simulate a multi-step user goal (query status $
ightarrow$ check refund policy $
ightarrow$ execute refund) and verify graceful failure when a tool throws.

## Lab 4: Model Context Protocol (MCP) Server
- **Objective**: Implement an MCP server responding to JSON-RPC 2.0 `initialize`, `tools/list`, and `tools/call` over Stdio.
- **Verification**: Connect an MCP client, dynamically discover registered tools, and execute a sandboxed database query tool.

## Lab 5: Permission-Aware Multi-Tenant Vector Search
- **Objective**: Implement pre-filtering in vector search ensuring queries enforce `tenant_id` and `allowed_roles` constraints.
- **Verification**: Attempt cross-tenant data retrieval and demonstrate that unauthorized vectors are mathematically excluded from neighbor traversal.
