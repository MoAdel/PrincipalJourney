# 14 - Principal Storage Architectural Defense Questions

> "A Senior Engineer implements file uploads.
>
> A Principal Engineer defends why direct-to-storage delegation was chosen over server proxying, how backpressure bounds memory, and why lifecycle tiers save hundreds of thousands of dollars."

---

# Question 1: Direct Client-to-Storage Uploads vs Backend Proxying

### The Scenario:
A team lead argues: *"Routing all file uploads through our backend Web API allows us to perform antivirus scanning, log every byte, and enforce validation before saving to storage. Direct-to-storage via SAS is unnecessary complexity."*

### Principal Engineer Defense:
"Routing large file transfers (e.g. 500 MB videos or 2 GB catalog imports) through the Web API introduces three fatal architectural liabilities:
1. **Server Capacity Exhaustion**: Ingesting 1,000 concurrent 500 MB uploads requires 500 GB of server memory or disk buffering and 500 Gbps of proxy bandwidth, starving the API of CPU and network sockets for core business transactions.
2. **Double Ingress/Egress Costs**: The cloud provider bills for data entering the Web API, data leaving the Web API to storage, and compute instances needed to proxy bytes.
3. **Fragile Network Transports**: Web server timeouts (e.g. 60s Kestrel limits) abort long-running mobile uploads.

**The Principal Solution**:
We implement **Direct Client-to-Storage with Async Validation**:
- The Web API issues a short-lived (15 min), write-only User Delegation SAS ticket.
- The client uploads directly to a private quarantine storage container in parallel chunks.
- Upon completion, storage emits an Event Grid notification to an isolated background container worker that performs antivirus scanning and validation asynchronously before promoting the file to the production container."

---

# Question 2: `System.IO.Pipelines` vs Traditional `System.IO.Stream`

### The Scenario:
Why should high-throughput stream processing use `System.IO.Pipelines` instead of standard `Stream.ReadAsync()`?

### Principal Engineer Defense:
"`System.IO.Pipelines` solves the three fundamental flaws of traditional streams:
1. **Zero Heap Allocations**: Memory buffers are leased directly from `MemoryPool<byte>.Shared` and recycled automatically without GC Gen 0/1 pressure.
2. **Zero-Copy Message Framing**: Traditional streams require allocating a new array and copying bytes whenever a message delimiter spans across buffer boundaries. `ReadOnlySequence<byte>` links non-contiguous memory segments into a single virtual buffer with zero memory copying.
3. **Built-in Backpressure**: `PipeOptions` provides `pauseWriterThreshold` and `resumeWriterThreshold`, asynchronously suspending fast producers when slow consumers fall behind, hard-capping maximum pipeline memory usage."

---

# Question 3: FinOps Storage Tiering Strategy

### The Scenario:
How do you structure storage lifecycle rules to minimize monthly cloud bills for 100 TB of multi-tenant enterprise data?

### Principal Engineer Defense:
"We establish an automated **4-tier data lifecycle policy**:
- **Hot Tier**: Active product images, videos, and catalog items with high read frequency (sub-50ms latency required).
- **Cool Tier**: Invoices and transaction receipts older than 30 days. Storage cost drops by 50% with instant retrieval.
- **Cold Tier**: Annual accounting reports older than 90 days. Storage cost drops by 75%.
- **Archive Tier**: Regulatory tax compliance and legal audit logs older than 180 days (retention: 7 years). Storage cost drops by over 90%.
- **CDN Edge Offload**: All public Hot tier assets are fronted by Azure Front Door with immutable 1-year cache headers, ensuring 98%+ of requests hit edge caches and incur zero storage read transaction fees."
