# Principal AI Architecture & Retrieval Competency Matrix

> "A Senior Engineer knows how to call an LLM API and generate an embedding.
>
> A Principal Engineer designs the vector indexing topologies, latency budgets, hybrid retrieval pipelines, and security guardrails that allow autonomous agents to operate reliably at enterprise scale."

---

## 1. The 5-Level AI & Retrieval Mastery Matrix

```text
┌───────┬───────────────────────────┬─────────────────────────────────────────────────────────────┐
│ Level │ Title                     │ Architectural Capabilities                                  │
├───────┼───────────────────────────┼─────────────────────────────────────────────────────────────┤
│ L1    │ Prompt Consumer           │ Calls LLM APIs, executes basic zero-shot prompts.           │
│ L2    │ RAG Practitioner          │ Chunks text with LangChain, loads vectors into Chroma.       │
│ L3    │ AI Systems Engineer       │ Builds hybrid retrieval (BM25 + Vector), tunes HNSW graphs. │
│ L4    │ Staff AI Architect        │ Multi-tenant vector security, ReAct agents, MCP tool wiring.│
│ L5    │ Principal AI Strategist   │ Mathematical distance proofs, cross-encoder rerankers,      │
│       │                           │ zero-trust document filtering, enterprise agent governance. │
└───────┴───────────────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Competency Pillars

### Pillar 1: Vector Embeddings & Similarity Search
- **Embedding Topologies**: Understand tokenization, vector dimensionality (384, 768, 1536, 3072), and embedding model selection trade-offs.
- **Distance Metrics**: Mathematical formulation of Cosine Similarity, Dot Product (Inner Product), and Euclidean Distance ($L_2$).
- **Vector Index Structures**:
  - Exact Search (Flat index, $O(N)$ brute-force).
  - Inverted File Index (IVFFlat) with Voronoi cell partitioning.
  - Hierarchical Navigable Small World (HNSW) multi-layer graphs.
  - Scalar Quantization (SQ8) and Product Quantization (PQ) for RAM optimization.

### Pillar 2: Production-Grade RAG Systems
- **Document Chunking Strategies**: Fixed-size sliding windows, sentence boundary chunking, semantic similarity chunking, and markdown hierarchical chunking.
- **Hybrid Retrieval**: Combining Sparse Lexical Search (BM25 / SPLADE) with Dense Semantic Search (HNSW) using Reciprocal Rank Fusion (RRF).
- **Re-Ranking Architecture**: Two-stage retrieval pipelines (Fast vector retrieval for Top-100 $ightarrow$ Heavy Cross-Encoder for Top-5).
- **Index Synchronization**: Maintaining real-time vector consistency with underlying relational/document databases via Change Data Capture (CDC).

### Pillar 3: Autonomous Agents & ReAct Loops
- **Foundations of AI Agents**: Goal definition, planning, action invocation, environment observation, and memory context injection.
- **Stateless Prompts vs Stateful Agent Loops**: Understanding when deterministic code suffices and when dynamic ReAct (Reasoning + Acting) decision loops are required.
- **Model Context Protocol (MCP)**: Standardized client/server protocol for connecting AI agents to enterprise data sources, tools, and execution sandboxes.
- **Agent Failure Modes**: Infinite execution loops, tool hallucination, context window exhaustion, and cascade failure prevention.

### Pillar 4: AI Security & Access Governance
- **Document-Level Permissions**: Enforcing role-based (RBAC) and attribute-based (ABAC) access control at vector query time.
- **Metadata Filtering**: Injecting user identity constraints directly into vector database search predicates.
- **Multi-Tenancy Topologies**: Physical isolation (separate index per tenant) vs Logical isolation (namespacing in Pinecone, tenant partitions in Weaviate).
- **Prompt Injection & Data Exfiltration**: Mitigating indirect prompt injection attacks embedded inside retrieved third-party documents.
