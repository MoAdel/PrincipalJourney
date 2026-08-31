# 04 - High-Throughput Storage & Streaming Architecture

> "The fastest way to process high-volume file transfers is to remove your application servers from the data path entirely."

---

# The Storage & Streaming Architecture Blueprint

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ 1. Direct-to-Storage Upload Flow (Offloading 99% of Bandwidth from API Servers)   │
└───────────────────────────────────────────────────────────────────────────────────┘

Client App (Web / Mobile)                 Nova Commerce API                   Azure Blob Storage
     │                                           │                                    │
     │ 1. POST /api/v1/media/upload-ticket       │                                    │
     │    (fileName="video.mp4", size=500MB)     │                                    │
     │──────────────────────────────────────────►│                                    │
     │                                           │ 2. Authenticates & Authorizes User │
     │                                           │ 3. Generates Scoped SAS Token via  │
     │                                           │    User Delegation Key (Write-Only)│
     │ 4. Returns Direct Upload Ticket:          │                                    │
     │    (UploadUrl with SAS, BlockSize=8MB)    │                                    │
     │◄──────────────────────────────────────────│                                    │
     │                                                                                │
     │ 5. Direct Chunked Upload (PUT Block 1, PUT Block 2... PUT Block List)          │
     │───────────────────────────────────────────────────────────────────────────────►│
     │                                                                                │ 6. Commits Blocks
     │ 7. Upload Completed (HTTP 201 Created)                                         │    Statelessly
     │◄───────────────────────────────────────────────────────────────────────────────│
     │                                           │
     │ 8. POST /api/v1/media/confirm-upload      │
     │    (MediaId, BlobUri)                     │
     │──────────────────────────────────────────►│ 9. Emits "MediaUploadedEvent"
     │                                           │    to Message Bus for Processing
```

---

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ 2. Media Delivery & Streaming Flow (CDN Edge Caching + HTTP Range Requests)       │
└───────────────────────────────────────────────────────────────────────────────────┘

Client (Mobile / Browser)              CDN Edge (Front Door)              Azure Blob Storage
     │                                           │                                │
     │ 1. GET /media/video.mp4                   │                                │
     │    Range: bytes=0-1048575 (First 1MB)     │                                │
     │──────────────────────────────────────────►│                                │
     │                                           │── 2. [Cache Miss] ────────────►│
     │                                           │   GET /media/video.mp4         │
     │                                           │   Range: bytes=0-1048575       │
     │                                           │◄── 3. HTTP 206 Partial Content─│
     │                                           │   Content-Range: 0-1MB/500MB   │
     │ 4. HTTP 206 Partial Content (Plays Instantly!)                             │
     │◄──────────────────────────────────────────│                                │
     │                                           │                                │
     │ [User Scrubs Video Timeline to 15:00]     │                                │
     │ 5. GET /media/video.mp4                   │                                │
     │    Range: bytes=150000000-151048575       │                                │
     │──────────────────────────────────────────►│                                │
     │ 6. HTTP 206 Partial Content (Sub-50ms!)   │ (Edge Cached / Instant Seek!)  │
     │◄──────────────────────────────────────────│                                │
```

---

# The Four Core Storage Disciplines

### 1. Ingestion Architecture: Direct vs Proxied Uploads
- For files $> 10 \text{ MB}$, the Web API generates a **Shared Access Signature (SAS)** and delegates the upload directly to cloud storage.
- For small in-band files ($< 10 \text{ MB}$) that require synchronous validation, the Web API streams bytes directly using **`System.IO.Pipelines`** without intermediate byte array allocations.

### 2. Processing Pipeline: Memory Pool Optimization
- Heavy CSV/JSON bulk catalog parsing uses `PipeReader` and `ReadOnlySequence<byte>`, recycling memory via `ArrayPool<byte>.Shared` to maintain a flat zero-LOH memory profile.

### 3. Delivery Architecture: HTTP 206 Partial Content
- Media assets support seekable scrubbing via HTTP Range requests.
- Video players request small 1 MB chunks on-demand rather than downloading entire 2 GB files, saving mobile data and bandwidth costs.

### 4. Edge Distribution: CDN Caching & Origin Shielding
- High-traffic static assets are served through Azure Front Door / Cloudflare with immutable URLs and aggressive caching (`Cache-Control: public, max-age=31536000, immutable`).
- Storage origin is shielded from public traffic spikes.
