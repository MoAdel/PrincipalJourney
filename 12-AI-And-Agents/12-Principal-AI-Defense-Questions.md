# Principal AI Architecture Defense Scenarios

> "In a Principal technical review or Architecture Review Board (ARB), executive stakeholders will challenge your design choices.
>
> You must defend your architecture with mathematical rigor, latency budgets, and security proofs."

---

## Defense Scenario 1: Fine-Tuning vs Retrieval-Augmented Generation (RAG)

### The Challenge:
> *"Why spend weeks engineering complex hybrid vector retrieval, chunking, and metadata filtering pipelines? Shouldn't we just fine-tune an open-source model (like Llama-3) directly on our entire corporate knowledge base?"*

### The Principal Defense:
1. **Knowledge Freshness & Velocity**: Fine-tuning bakes knowledge statically into model weights at training time. In an enterprise with policies, pricing, and inventories updating every 10 minutes, fine-tuning is economically and technically non-viable; RAG updates its knowledge base in seconds via Change Data Capture.
2. **Hallucination & Provenance**: Fine-tuned models hallucinate facts without citations. RAG injects exact text chunks, enabling **verifiable source attribution** (e.g., citing Section 4.2 of a specific contract).
3. **Data Security & Multi-Tenancy**: A fine-tuned model cannot enforce document-level permissions. Once trained on confidential HR or executive data, any user can extract that data via prompt leakage. RAG isolates data cleanly at query time via vector metadata filtering.
4. **Summary**: *Fine-tuning is for teaching a model **style, tone, or specialized domain syntax**; RAG is for providing **dynamic, secured, and verifiable enterprise knowledge**.*

---

## Defense Scenario 2: Massive Context Windows vs RAG

### The Challenge:
> *"Modern frontier models support 1 million to 2 million token context windows. Why not simply dump our entire 500-page enterprise documentation into every prompt and skip vector databases entirely?"*

### The Principal Defense:
1. **Economic Viability (Cost per Query)**: At $2.50 per 1M input tokens, sending 500,000 tokens on every merchant inquiry costs **$1.25 per single query**. At 100,000 queries/day, that burns **$3,750,000/month**. In contrast, RAG retrieves only the top-5 relevant chunks (~1,500 tokens), costing **$0.003 per query** ($11,000/month)—a **340x cost reduction**.
2. **Latency SLA**: Ingesting 500,000 tokens into an LLM imposes a 5 to 12 second Time-to-First-Token (TTFT) processing delay, violating our 1,500ms p95 SLA.
3. **The "Lost in the Middle" Phenomenon**: Research (Liu et al., Stanford) proves that LLMs experience severe retrieval degradation when critical facts are buried in the middle of massive context windows. Targeted RAG retrieval delivers higher factual precision.

---

## Defense Scenario 3: Autonomous Agents vs Deterministic State Machines

### The Challenge:
> *"Can we replace our entire order fulfillment workflow engine with an autonomous ReAct AI agent?"*

### The Principal Defense:
> "No. A Principal Engineer applies autonomous agents only where non-deterministic reasoning, unstructured text parsing, or dynamic exploration is genuinely required. 
> 
> Core transactional processes (e.g., payment charging, ledger booking, inventory reservation) must remain **deterministic, ACID-compliant state machines** (such as MassTransit Sagas or Temporal workflows). Autonomous agents should operate as orchestrators that evaluate natural language intent and trigger deterministic workflows, not replace them."
