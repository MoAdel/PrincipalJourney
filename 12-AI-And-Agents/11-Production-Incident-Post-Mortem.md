# SEV-1 Post-Mortem: Cross-Tenant Data Leakage & The $140k Vector Runaway

| Incident Attribute | Value |
|---|---|
| **Incident Severity** | **SEV-1 (Critical Security Breach & Financial Runaway)** |
| **Duration** | 36 Hours (Nov 18, 2026, 09:14 UTC – Nov 19, 2026, 21:30 UTC) |
| **Direct Financial Impact** | $142,500 in Vector Database Compute + 1 Key Enterprise Account at Risk |
| **Root Causes** | Missing Vector Pre-Filtering + Uncached Keystroke Embedding Generation |

---

## 1. Executive Summary
On November 18, 2026, Nova Commerce deployed its flagship AI assistant, NovaCopilot. Due to an architectural omission where vector queries bypassed tenant isolation filters, confidential supplier contracts were retrieved and exposed across competing merchant accounts. Simultaneously, an auto-complete frontend component generated new vector embeddings on every keystroke, driving massive vector database auto-scaling costs.

---

## 2. The 5-Whys Root Cause Analysis

1. **Why did NovaCopilot expose Supplier B's confidential pricing to Supplier A?**  
   Because the retriever returned Supplier B's contract chunk as the top semantic neighbor.
2. **Why was Supplier B's contract included in Supplier A's search space?**  
   Because the vector database query did not include a `tenant_id` metadata filter.
3. **Why was there no `tenant_id` filter?**  
   Because the initial prototype stored all chunks in a single global flat index without multi-tenancy namespaces.
4. **Why did the vector database bill reach $142,500 in 36 hours?**  
   Because the frontend autocomplete triggered unthrottled embedding calls on every input character without client-side debouncing or Redis embedding caching.
5. **Why was this not caught in staging?**  
   Because staging tests used synthetic single-tenant data and lacked automated cross-tenant security assertions in CI/CD.

---

## 3. Preventative Guardrails Landed

1. **Mandatory Query Filter Interceptor**: Wrapped the vector client in a pipeline behavior that throws an unhandled exception if `tenant_id` filter is absent.
2. **Semantic Caching**: Implemented an L1 Redis semantic cache for common user queries with a 24-hour TTL, slashing embedding API costs by 78%.
3. **Debounced Ingress**: Enforced a 400ms debounce window and minimum 3-character threshold on all AI search inputs.
