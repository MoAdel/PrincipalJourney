# Staff & Principal AI Technical Interview Scenarios

---

## Scenario 1: Design a Multi-Tenant Customer Support Copilot

### Prompt:
> *"Design an enterprise AI copilot for 50,000 corporate customers. The system must answer complex policy questions, query live order statuses, execute refunds, and guarantee that Customer A never sees Customer B's data under any circumstance. Budget: <$0.02 per query, <1.5s p95 latency."*

### Key Architectural Blueprint to Present:
1. **Ingestion Rail**: CDC pipeline from PostgreSQL to Weaviate with native tenant partition indexing. Markdown-aware semantic chunking with parent-document headers.
2. **Serving Rail**:
   - Query rewrite & classification: Determine if the inquiry is a policy question (RAG), a live status request (Tool Call), or chit-chat.
   - Dual-rail hybrid search (BM25 + HNSW) with metadata filter `tenant_id = @TenantId`.
   - Cross-encoder reranker (MiniLM-L6-v2) deployed on Triton inference server.
3. **Execution Guardrails**:
   - ReAct agent orchestrating tools over Model Context Protocol (MCP).
   - Read tools execute autonomously; Write tools (`refund_order`) require signed HMAC confirmation token.
4. **FinOps & Caching**: Redis semantic cache on query vectors; bypasses LLM for identical semantic questions with 90%+ similarity.

---

## Scenario 2: 100M Document Enterprise Code Search Engine

### Prompt:
> *"Design a semantic code search engine across 100 million functions in a multi-language monorepo. Developers search using natural language (e.g. 'retry HTTP requests with exponential backoff')."*

### Key Architectural Blueprint to Present:
1. **Chunking**: Abstract Syntax Tree (AST) parser (Tree-sitter) chunking by function/class boundary rather than raw lines.
2. **Embedding Model**: Specialized code embedding model (`code-search-bge` or `text-embedding-3-small` with custom code instruction prefix).
3. **Index Topology**: Qdrant cluster with Scalar Quantization (SQ8) to fit 100M vectors into RAM.
4. **Hybrid Search**: Code search strictly requires lexical tokens (function names, imports) combined with semantic intent.
