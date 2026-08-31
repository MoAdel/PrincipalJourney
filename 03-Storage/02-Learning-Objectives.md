# 02 - Learning Objectives & Storage Competency Matrix

> "A Senior Engineer writes code to upload a file to S3 or Azure Blob.
>
> A Principal Engineer designs the data flow, memory allocation profile, network routing, lifecycle tiers, and cost boundaries for petabytes of unstructured data."

---

# Learning Goals

By completing Sprint 03, you will master:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Sprint 03 Competency Levels                            │
├─────────────────┬───────────────────────────────────────────────────────────────┤
│ 1. Storage      │ Block vs Append vs Page Blobs, Container Partitioning, Tiers  │
│ 2. Streaming    │ System.IO.Pipelines, PipeReader/Writer, Zero-Allocation I/O   │
│ 3. Resumability │ Chunked Uploads, Multi-Part Blocks, TUS Protocol, Retries     │
│ 4. Range I/O    │ HTTP 206 Partial Content, Content-Range, Media Seeking        │
│ 5. Delegated    │ Shared Access Signatures (SAS), User Delegation, Direct-to-S3 │
│ 6. Edge CDN     │ Origin Shielding, Cache-Control, Invalidation & Purge Policy  │
└─────────────────┴───────────────────────────────────────────────────────────────┘
```

---

# Principal-Level Competency Rubric

| Domain | Senior Engineer Level | Principal Storage Architect Level |
|---|---|---|
| **Memory Management** | Uses `MemoryStream` or `IFormFile.CopyToAsync()` to buffer files. | Implements zero-allocation streaming via `System.IO.Pipelines` and `ArrayPool<byte>.Shared`, maintaining 0 LOH allocations. |
| **Upload Topologies** | Routes all file uploads through backend Web API controllers. | Implements **Direct Client-to-Storage Uploads** via short-lived, scoped **Shared Access Signatures (SAS)**, offloading 99% of bandwidth from API servers. |
| **Large File Resilience**| Uploads files in a single monolithic HTTP request; network drops force a 100% re-upload. | Implements **Resumable Chunked Uploads** (Azure Block Blobs / TUS) with client-side hashing, parallel block commits, and chunk retry resume. |
| **Media Delivery** | Returns raw file bytes or static files from local disk. | Implements **HTTP 206 Partial Content (Range Requests)** with chunked transfer encoding, enabling instant video seeking on mobile devices. |
| **FinOps & Lifecycles** | Stores all files in the default Hot tier indefinitely. | Configures automated **Lifecycle Management Rules** transitioning data from Hot → Cool (30d) → Cold (90d) → Archive (180d), reducing storage costs by 80%. |
| **Edge Distribution** | Serves assets directly from storage accounts. | Deploys CDN Edge Caching (Azure Front Door / Cloudflare) with origin shielding, custom cache keys, and automated purge webhooks. |
