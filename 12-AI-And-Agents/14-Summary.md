# Sprint 12 Executive Summary & 10 Invariant Laws of Principal AI Architecture

> "AI models are probabilistic; your architecture must be deterministic."

---

## The 10 Invariant Laws of Principal AI Architecture

1. **The Law of Pre-Filtering**: Never calculate vector distance without a tenant and security ACL filter; post-filtering destroys recall and leaks data.
2. **The Law of Hybrid Retrieval**: Dense vectors capture semantic intent; sparse keywords capture exact identifiers. A production RAG system without BM25 is incomplete.
3. **The Law of the Two-Stage Funnel**: Use fast approximate nearest neighbors (HNSW) to cast a wide net (Top-50); use high-precision Cross-Encoders to select the gold-standard context (Top-5).
4. **The Law of Context Sandboxing**: All retrieved document text is untrusted user input; enclose it in strict structural delimiters to defeat indirect prompt injection.
5. **The Law of Bounded Agent Loops**: An autonomous agent without loop iteration limits ($\le 5$), execution timeouts ($\le 15$s), and output truncations is a denial-of-service vulnerability.
6. **The Law of Unit Normalization**: Normalize vectors to unit length at ingestion time to replace expensive Cosine calculations with high-speed Dot Products.
7. **The Law of Continuous Freshness**: Vector stores must be synchronized with relational truth in real time using Change Data Capture, not manual nightly batch re-embeddings.
8. **The Law of Tool Decoupling**: Build tool integrations against the Model Context Protocol (MCP) to prevent vendor lock-in and enable isolated security sandboxing.
9. **The Law of Deterministic Core**: Use AI for perception, synthesis, and planning; use deterministic distributed state machines for financial transactions and data mutation.
10. **The Law of Token Economics**: Cache embeddings, debounce user keystrokes, and enforce strict token budgets to prevent serverless billing avalanches.
