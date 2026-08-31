# 03 - Enterprise Storage & Streaming Requirements

> "Storage architecture must be designed around data size, access frequency, latency SLOs, and egress cost boundaries."

---

# Functional & Non-Functional Storage Requirements: Nova Commerce

---

# 1. Unstructured Data Workloads (STO-REQ-01)

1. **Product Catalog Imagery**: High-volume, read-heavy images (JPEG, WebP, AVIF) ranging from 100 KB to 5 MB. Must be cached globally at the CDN edge with sub-50ms TTFB.
2. **Merchant Product Video Demos**: Large video files (100 MB to 2 GB). Must support instant playback on mobile devices with seekable scrubbing via HTTP Range requests.
3. **Bulk Catalog Feeds (CSV/JSON)**: Heavy data files (50 MB to 1 GB) parsed asynchronously by background workers with zero Large Object Heap (LOH) memory spikes.
4. **Legal Invoices & Compliance Archives**: Immutable, encrypted PDF documents retained for 7 years compliant with EU financial regulations.

---

# 2. Performance & Memory SLOs (STO-REQ-02)

1. **Zero Server Buffering**: Backend Web API memory consumption must remain constant ($O(1)$ memory overhead < 64 KB per stream) regardless of whether a user uploads a 10 MB image or a 2 GB video.
2. **Zero LOH Allocations**: No byte array allocations $> 85,000$ bytes on the managed heap during file ingest or streaming.
3. **Throughput Scaling**: Direct client-to-storage architecture must support 10,000 concurrent uploads without increasing Web API CPU or network saturation.

---

# 3. Resiliency & Network Degradation (STO-REQ-03)

1. **Resumable Uploads**: If a cellular connection drops during a 1.5 GB upload at 90%, the client must resume uploading from the exact failed chunk without restarting from byte zero.
2. **Chunk Checksum Integrity**: Every uploaded chunk must include an MD5 / SHA-256 content hash verified by the storage service before committing.

---

# 4. Security & Access Delegation (STO-REQ-04)

1. **Private Storage Containers**: All cloud storage containers must have public anonymous read access disabled.
2. **Scoped SAS Delegation**: Direct upload/download tokens (Shared Access Signatures) must be generated using **Azure AD / Entra ID User Delegation Keys** (never master account keys), scoped to a single specific blob, restricted to required HTTP verbs (Write-only for upload), and expire in a maximum of **15 to 30 minutes**.
3. **Encryption at Rest**: Storage accounts must enforce 256-bit AES encryption with customer-managed keys (CMK) in Azure Key Vault.

---

# 5. FinOps & Lifecycle Management (STO-REQ-05)

1. **Automated Tier Transitions**:
   - Active product images & videos remain in **Hot Tier**.
   - Order invoices transition to **Cool Tier** after 30 days.
   - Compliance audit logs transition to **Cold Tier** after 90 days and **Archive Tier** after 180 days.
2. **Egress Optimization**: 95%+ of static media reads must be served from CDN edge cache hits, minimizing expensive cloud storage data egress fees.
