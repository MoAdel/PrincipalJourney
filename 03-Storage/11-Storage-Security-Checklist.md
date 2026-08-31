# 11 - Principal Storage & Streaming Production Release Checklist

> "A storage architecture is production-ready only when it guarantees zero server memory bloat, zero leaked access tokens, and predictable cloud egress costs."

---

# The Principal Storage Release Gate

---

# 1. Memory Management & Zero-Allocation Ingest

- [ ] **Zero LOH Allocations**: No byte array allocations $> 85,000$ bytes on the managed heap during file ingest.
- [ ] **Pipelines Standard**: Heavy streaming parsers (CSV/JSON/multipart) use `System.IO.Pipelines.PipeReader` and `ReadOnlySequence<byte>`.
- [ ] **ArrayPool Safety**: All custom buffer rentals call `ArrayPool<byte>.Shared.Return()` inside guaranteed `finally` blocks.
- [ ] **No MemoryStream Buffering**: API endpoints never buffer arbitrary file streams into `MemoryStream` or `byte[]`.

---

# 2. Ingestion & Upload Architecture

- [ ] **Direct-to-Storage for Large Files**: Files $> 10 \text{ MB}$ upload directly to cloud storage via User Delegation SAS tokens.
- [ ] **Resumable Chunking**: Multi-part uploads split large files into 4 MB–8 MB blocks committed atomically via `PutBlockList`.
- [ ] **Checksum Integrity**: Uploaded chunks include Content-MD5 / SHA-256 verification headers.
- [ ] **Uncommitted Block Cleanup**: Automated lifecycle rule cleans uncommitted blocks after 7 days.

---

# 3. Media Delivery & Range Processing

- [ ] **HTTP 206 Enabled**: Video/audio streaming endpoints configure `enableRangeProcessing: true` in `Results.File()`.
- [ ] **Accept-Ranges Header**: Storage/API emits `Accept-Ranges: bytes` to enable client video scrubbing.
- [ ] **Seekable Streams**: Underlying storage streams support `.Seek()` operations.

---

# 4. Security & Access Delegation

- [ ] **No Public Storage Containers**: All storage containers have public anonymous access disabled.
- [ ] **User Delegation SAS**: Direct upload tokens generated using Azure AD / Entra ID User Delegation Keys (never master storage keys).
- [ ] **Least-Privilege Scopes**: Upload SAS tokens granted write-only (`Create | Write`) permissions with 15–30 minute expiration.
- [ ] **Encryption at Rest**: Storage accounts enforce AES-256 encryption with customer-managed keys (CMK) in Azure Key Vault.

---

# 5. CDN Edge Caching & FinOps

- [ ] **Immutable Headers**: Versioned/hashed assets emit `Cache-Control: public, max-age=31536000, immutable`.
- [ ] **Origin Shielding**: CDN configured with origin shielding to minimize backend storage requests.
- [ ] **Automated Lifecycle Tiering**: Rules configured transitioning Hot → Cool (30d) → Cold (90d) → Archive (180d).
