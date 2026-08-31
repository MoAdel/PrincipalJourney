# 15 - Principal Storage Technical Interview Scenarios

> "In a Staff/Principal interview, interviewers evaluate how you manage petabyte-scale unstructured data, design low-latency streaming topologies, and optimize multi-million dollar cloud storage and egress budgets."

---

# Evaluation Rubric for Principal Storage Candidates

| Evaluation Area | Senior Candidate | Principal Storage Architect Candidate |
|---|---|---|
| **Data Ingestion** | Buffers files in memory or saves to local server disk before uploading. | Designs direct client-to-storage upload architectures using short-lived SAS tokens and resumable chunking. |
| **Memory Management** | Uses `MemoryStream` or `byte[]` arrays. | Implements zero-allocation streaming via `System.IO.Pipelines`, `ReadOnlySequence<byte>`, and `ArrayPool<byte>`. |
| **Media Streaming** | Returns static files or full byte arrays. | Configures HTTP 206 Partial Content range seeking and chunked transfer encoding for instant scrubbing. |
| **FinOps & Tiering** | Stores all objects in default storage tiers. | Designs automated lifecycle policies (Hot/Cool/Cold/Archive) and edge CDN origin shielding to slash egress bills by 85%+. |

---

# Scenario 1: Designing Global Video Review Ingestion & Streaming

### The Prompt:
*"Design the storage and video delivery architecture for an e-commerce platform where 100,000 users upload 500 MB video reviews daily, and 5 million users stream these reviews globally with sub-100ms startup latency. How do you design upload resilience, streaming delivery, and cost boundaries?"*

### Expected Principal Response Structure:
1. **Direct Ingestion Boundary**:
   - Web API generates a write-only User Delegation SAS ticket (15-min expiration).
   - Mobile apps chunk videos into 4 MB blocks, upload in parallel via `PutBlock`, and commit via `PutBlockList`.
2. **Asynchronous Transcoding & Quarantine**:
   - Azure Event Grid triggers an Azure Container Apps worker on blob creation.
   - Worker validates video metadata, scans for malware, and transcodes into multi-bitrate HLS (HTTP Live Streaming) and DASH formats (1080p, 720p, 480p).
3. **Global Edge Delivery**:
   - Segments delivered via Azure Front Door CDN with `Cache-Control: public, max-age=31536000, immutable`.
   - Players stream segments via HTTP 206 Partial Content Range requests, enabling instant playback and zero wasted bandwidth on abandoned plays.
4. **Lifecycle & FinOps**:
   - Master raw video moved to Archive Tier after 30 days. Transcoded stream segments cached at edge.

---

# Scenario 2: Zero-LOH High-Throughput Bulk Data Feed Ingestion

### The Prompt:
*"Your retail platform ingests 20,000 merchant catalog CSV files (up to 2 GB each) every night. The previous implementation crashed servers with OutOfMemoryExceptions. How do you redesign the streaming parser to run on a cluster with limited 4 GB RAM per container?"*

### Expected Principal Response:
1. **Zero-Allocation Pipeline Architecture**:
   - Open stream directly from storage using `BlobClient.OpenReadAsync()`.
   - Pipe stream into `System.IO.Pipelines.PipeReader`.
2. **Buffer Management & Backpressure**:
   - Configure `PipeOptions` with `pauseWriterThreshold: 64 KB` and `resumeWriterThreshold: 32 KB`.
   - Read lines into `ReadOnlySequence<byte>` without allocating strings; parse UTF-8 byte spans directly using `Utf8Parser`.
3. **Batch Insertion**:
   - Buffer parsed entity structs into fixed-size batches (1,000 items) and bulk insert into database via `SqlBulkCopy` / PostgreSQL binary copy.
4. **Memory Profile Outcome**:
   - Constant $O(1)$ memory consumption (< 30 MB RAM per container) regardless of whether the file is 10 MB or 10 GB.
