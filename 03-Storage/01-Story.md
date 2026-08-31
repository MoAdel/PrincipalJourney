# 01 - Production Story: The Large Object Heap Outage

> "A 500 MB file upload should never require 500 MB of server RAM.
>
> If your web server buffers files into memory, a single concurrent traffic spike will take down your entire cluster."

---

# The Incident

Thursday.

02:45 PM.

Nova Commerce launches its new Merchant Self-Service Portal, enabling 5,000 retail vendors to upload 4K product showcase videos and bulk inventory catalogs (up to 2 GB per file).

Within 12 minutes of launch, the production API cluster crashes:

```
[FATAL KESTREL CRASH]: System.OutOfMemoryException: Exception of type 'System.OutOfMemoryException' was thrown.
   at System.IO.MemoryStream.set_Capacity(Int32 value)
   at System.IO.MemoryStream.EnsureCapacity(Int32 value)
   at System.IO.MemoryStream.Write(Byte[] buffer, Int32 offset, Int32 count)
   at Microsoft.AspNetCore.Http.FormFile.CopyToAsync(Stream target, CancellationToken cancellationToken)
```

Kubernetes nodes began terminating pods under OOMKilled (Out of Memory) conditions.

Even after scaling the cluster from 10 nodes to 40 nodes, the new pods crashed within 60 seconds of joining the load balancer.

---

# Why Did This Happen?

Let's inspect the controller endpoint written by a senior developer:

```csharp
[HttpPost("upload-video")]
public async Task<IActionResult> UploadProductVideo(IFormFile file)
{
    // FATAL ARCHITECTURAL FLAW:
    // 1. IFormFile buffers requests larger than 64 KB to temporary disk or RAM.
    // 2. Reading into a MemoryStream allocates a contiguous 500 MB byte array on the Large Object Heap (LOH)!
    using var memoryStream = new MemoryStream();
    await file.CopyToAsync(memoryStream);

    byte[] fileBytes = memoryStream.ToArray();

    // 3. Web server proxies the entire byte array to Azure Blob Storage:
    await _blobService.UploadAsync(file.FileName, fileBytes);

    return Ok();
}
```

### The Root Cause:
1. **Large Object Heap (LOH) Fragmentation**: Any managed allocation larger than 85,000 bytes bypasses Gen 0/1/2 and lands directly on the Large Object Heap. Because LOH is not compacted by default in standard GC sweeps, allocating 500 MB arrays across 40 concurrent uploads fragmented server RAM into unallocatable blocks.
2. **Server-As-Proxy Antipattern**: The backend Web API acted as an unnecessary middleman, buffering high-bandwidth video files through Kestrel worker threads instead of delegating the upload directly to cloud object storage.
3. **Synchronous Thread-Pool Saturation**: Proxying multi-gigabyte streams saturated Kestrel outbound sockets and pinned thread-pool workers for 30–60 seconds per upload.

---

# The Principal Engineer's Mandate

The CTO issued an urgent mandate:

> "Our backend servers exist to process business logic, not to act as expensive, fragile file proxies. We need a zero-allocation streaming and delegated storage architecture that scales to terabytes of video without adding a single megabyte of server heap pressure."

Sprint 03 builds that architecture.
