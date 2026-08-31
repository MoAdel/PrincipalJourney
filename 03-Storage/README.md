# Challenge 03 — Storage & High-Performance Streaming Architecture

> **Sprint 03**
>
> Estimated Duration: **7 Days**
>
> Estimated Effort: **22–28 Hours**
>
> Difficulty: ⭐⭐⭐⭐☆
>
> Target Level:
>
> Senior Software Engineer → Principal / Staff Infrastructure & Storage Architect

---

# Challenge Overview

Welcome to Sprint 03 of the Principal Engineer Academy.

Handling JSON payloads in memory is easy.

Handling terabytes of unstructured media, high-resolution product catalogs, multi-gigabyte video streams, and encrypted legal documents under massive concurrency without exhausting server memory or starving the Kestrel thread pool is an entirely different engineering challenge.

In a naive architecture:
- Servers buffer 500 MB uploads directly into managed byte arrays, triggering Large Object Heap (LOH) fragmentation and instant `OutOfMemoryException` crashes.
- Web APIs act as expensive, slow proxies between clients and cloud storage, consuming gigabytes of server bandwidth and pinning CPU cores.
- Video playback buffers the entire file before rendering, destroying mobile user experience and incurring massive egress bandwidth bills.

As a Principal Engineer, you design a **high-throughput, zero-allocation storage and streaming architecture**.

---

# Business Context & Mission

**Nova Commerce** is launching a major international expansion:
1. **Rich Media Catalog**: 500,000 product images, 4K video reviews, and live merchant streaming demos.
2. **Bulk Data Imports/Exports**: Merchants uploading 2 GB CSV/JSON catalog feeds and downloading automated tax reconciliation archives.
3. **Encrypted Invoice & Legal Storage**: Secure, immutable PDF invoice retention compliant with EU archiving regulations.
4. **Global CDN Distribution**: 10 million consumers streaming media across 140 countries with sub-100ms latency.

### Your Mission:
Design and implement an end-to-end, high-performance storage and media streaming subsystem that:
- Implements cloud object storage with **Azure Blob Storage / S3** and tiered lifecycle policies (Hot, Cool, Cold, Archive).
- Achieves zero-allocation stream processing using **`System.IO.Pipelines`** and **`ArrayPool<byte>`**.
- Supports **Resumable Chunked Uploads** (TUS protocol / Azure Block Blobs) across unstable mobile networks.
- Delivers video streaming with seekable **HTTP 206 Partial Content (Range Requests)**.
- Offloads heavy upload traffic directly from backend servers using **Delegated Shared Access Signatures (SAS)**.
- Integrates with **Azure Front Door / Cloudflare CDN** with strict `Cache-Control` headers and origin shielding.

---

# Structure of Sprint 03 Modules

```
03-Storage/
├── 01-Story.md
├── 02-Learning-Objectives.md
├── 03-Storage-Requirements.md
├── 04-Storage-Architecture.md
├── 05-Blob-Storage-Architecture.md
├── 05A-Inside-Blob-Storage-Internals.md
├── 06-System-IO-Pipelines.md
├── 06A-Inside-Pipelines-Memory-Internals.md
├── 07-Chunked-And-Resumable-Uploads.md
├── 08-HTTP-Range-Requests-Streaming.md
├── 09-Direct-Client-Upload-SAS.md
├── 10-CDN-Edge-Caching-Storage.md
├── 11-Storage-Security-Checklist.md
├── 12-Hands-On-Storage-Labs.md
├── 13-Storage-Incident.md
├── 14-Principal-Defense-Questions.md
├── 15-Interview-Scenarios.md
├── 16-Summary.md
├── 17-Resources.md
└── README.md
```
