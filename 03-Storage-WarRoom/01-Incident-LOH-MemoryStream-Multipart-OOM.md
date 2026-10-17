# Incident 01: The `MemoryStream.ToArray()` Large Object Heap (LOH) Multipart OOM

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: AKS Media Ingestion Service (16 Pods, 2GB RAM limit) / Azure Blob Storage  
> **Business Impact**: Pods crashing every 90 seconds with `Exit Code 137 (OOMKilled)` during enterprise document batch uploads; 100% upload failure for files > 25MB  
> **Competencies Mastered**: Large Object Heap (`>= 85,000 bytes`), `MemoryStream` Capacity Doubling + `.ToArray()` Copy Multiplier, Streaming `PipeReader` to `BlobClient.UploadAsync`, `ArrayPool<byte>`

---

## 🚨 1. The 01:40 AM Crisis Briefing

Enterprise legal clients began uploading 50MB PDF discovery bundles concurrently (`40 concurrent uploads` across 16 pods $pprox 2.5$ concurrent uploads per pod). Within 90 seconds, pods began dying in a rolling `CrashLoopBackOff`:

```text
[01:40:12] K8s Alert: Pod media-ingest-7f8b9 terminated with Exit Code 137 (SIGKILL - OOMKilled).
[01:40:28] RED HERRING: Prometheus shows dotnet_gc_heap_size_bytes (Gen 0 + Gen 1 + Gen 2 SOH) at only 190 MB before crash!
[01:41:05] Ingress Alert: NGINX returning HTTP 502 Bad Gateway as upstream pods die mid-upload!
```

> 📐 **Derive It (Fermi Mode): The `3.5x` Memory Multiplier of Buffered Multipart Uploads**
> - **Inputs**: `FileSizeMB = 50`, `ConcurrentUploadsPerPod = 8`, `BufferMultiplier = 3.5`, `PodMemoryLimitMB = 2048`
> - **Formula**: `PeakLOHMemoryMB = ConcurrentUploadsPerPod * FileSizeMB * BufferMultiplier`
> - **Step-by-Step**:
>   1. When a developer binds `IFormFile` and copies it into `new MemoryStream()`, `MemoryStream`'s internal `byte[]` doubles capacity repeatedly ($32\text{ MB} \rightarrow 64\text{ MB} \rightarrow 128\text{ MB}$ on the **Large Object Heap**, which is uncompacted by default!).
>   2. Calling `memoryStream.ToArray()` allocates a **second** contiguous `50 MB` `byte[]` on the LOH to copy the exact length ($128\text{ MB} + 50\text{ MB} = 178\text{ MB}$ per upload, $\approx 3.5\times$ file size!).
>   3. At just `8` concurrent uploads on a single pod: $8 \times 50\text{ MB} \times 3.5 = 1,400\text{ MB}$ of fragmented LOH allocations in $< 2\text{ seconds}$, plus native socket buffers and baseline heap $ightarrow > 2,048\text{ MB}$ $ightarrow$ instant Linux Kernel OOMKill (`Exit 137`)!
> - **What-If Sensitivity**: Switching to true unbuffered streaming (`Request.BodyReader.AsStream()` $ightarrow$ `BlobClient.UploadAsync` with `4 MB` pooled `ArrayPool<byte>` staging blocks) caps memory at $8 \times 4\text{ MB} = 32\text{ MB}$ regardless of whether the file is `50 MB` or `50 GB`!

<!-- TELEMETRY_WIDGET: title="LOH Fragmentation & Pod Exit 137 OOM" metric1="LOH Uncompacted Size (MB)" metric2="Container Working Set RSS (MB)" threshold="2048 MB Pod Cgroup Limit" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Confirm Linux Kernel OOMKill (Exit 137) vs Managed OutOfMemoryException
kubectl describe pod -n prod -l app=media-ingest | grep -A 6 "Last State:"
# Output: Reason: OOMKilled | Exit Code: 137

# Step 2: Watch LOH (Large Object Heap) size separately from Small Object Heap (SOH)!
dotnet-counters monitor -p 1 --counters System.Runtime[loh-size,gc-heap-size,gc-fragmentation]

# Step 3: Capture lightweight GC heap dump to identify byte[] owners
dotnet-gcdump collect -p 1 -o loh_spike.gcdump
```

### Observed Culprit Code Snippet
```csharp
// ❌ LOH ALLOCATION TIMEBOMB:
[HttpPost("upload")]
public async Task<IActionResult> UploadDocument(IFormFile file, CancellationToken ct)
{
    using var ms = new MemoryStream(); // Allocates 64MB -> 128MB byte[] on LOH!
    await file.CopyToAsync(ms, ct);
    byte[] payload = ms.ToArray();     // Allocates ANOTHER 50MB byte[] on LOH!
    await _blobClient.UploadAsync(new BinaryData(payload), overwrite: true, ct);
    return Ok();
}
```

<!-- PREDICT_GATE: Commit your hypothesis: Why did the SOH metric look healthy (190MB) while the pod crashed at 2GB, and why does `IFormFile` + `MemoryStream.ToArray()` multiply memory by 3.5x? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Why `IFormFile` Buffers to Disk/RAM Before Your Controller Even Runs
* Model binding `IFormFile` forces ASP.NET Core's `MultipartReader` to read the entire multipart section into a `FileBufferingReadStream` (spilling to `/tmp` disk after `64 KB`) before entering your controller action.
* Copying that stream into `MemoryStream` and calling `.ToArray()` allocates multiple multi-megabyte contiguous arrays (`>= 85,000 bytes`) directly onto the **Large Object Heap (LOH)**.
* Because LOH segments are not compacted during normal Gen 0/1 collections (and compacting 1.4GB of `byte[]` pauses all threads), fragmented holes between 64MB and 50MB arrays cannot be reused by slightly larger arrays, causing virtual/physical RSS to skyrocket past the cgroup limit!

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs.Specialized;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;

namespace PrincipalJourney.Storage.WarRoom;

[ApiController]
[Route("api/v1/documents")]
public sealed class ZeroLohStreamingUploadController(BlobContainerClient containerClient) : ControllerBase
{
    [HttpPost("stream")]
    [DisableRequestSizeLimit]
    public async Task<IActionResult> StreamDirectlyToBlobAsync(CancellationToken ct)
    {
        if (!MediaTypeHeaderValue.TryParse(Request.ContentType, out var mediaType) ||
            string.IsNullOrEmpty(mediaType.Boundary.Value))
        {
            return BadRequest("Expected multipart/form-data boundary.");
        }

        var reader = new MultipartReader(mediaType.Boundary.Value, Request.Body);
        MultipartSection? section;

        while ((section = await reader.ReadNextSectionAsync(ct)) is not null)
        {
            if (ContentDispositionHeaderValue.TryParse(section.ContentDisposition, out var disposition) &&
                disposition.IsFileDisposition())
            {
                string blobName = Path.GetRandomFileName();
                BlockBlobClient blobClient = containerClient.GetBlockBlobClient(blobName);

                // Stream directly from Kestrel socket PipeReader -> Azure Blob StageBlock in 4MB pooled chunks!
                // Zero IFormFile disk spooling, zero MemoryStream, zero LOH allocations!
                await blobClient.UploadAsync(
                    section.Body,
                    new BlobUploadOptions
                    {
                        TransferOptions = new Azure.Storage.StorageTransferOptions
                        {
                            InitialTransferSize = 4 * 1024 * 1024,
                            MaximumTransferSize = 4 * 1024 * 1024,
                            MaximumConcurrency = 2
                        }
                    },
                    ct);

                return Accepted(new { BlobName = blobName });
            }
        }

        return BadRequest("No file section found.");
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (`IFormFile` + `MemoryStream.ToArray()`) | After (`MultipartReader` Streaming + Pooled Blocks) | Validation & Rollback Procedure |
|---|---|---|---|
| **Peak Pod Memory (8 x 50MB Uploads)** | `1,850 MB` (`Exit 137` OOMKill) | **`142 MB`** (Flat RSS regardless of file size) | k6 load test uploads 20 concurrent 100MB streams on a 512MB container; assert 0 OOMs. |
| **LOH Allocations per 50MB Upload** | `242 MB` (`32+64+128+50 MB` arrays) | **`0 Bytes`** (`ArrayPool<byte>` reused by SDK) | `BenchmarkDotNet` `[MemoryDiagnoser]` asserts Gen 2 / LOH allocs == 0. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why rewrite the controller when we can just increase the Kubernetes pod memory limit from `2Gi` to `8Gi`?"*

**The Principal Defense**:
> *"Quadrupling pod memory across 16 pods adds 96 GB of cluster RAM ($950/month) and only moves the failure ceiling from 8 concurrent 50MB uploads to 32 concurrent uploads — or a single customer uploading a 2GB video file! Worse, compacting an 8GB fragmented LOH during a Gen 2 Full GC freezes the pod for seconds. True streaming decouples pod RAM from file size completely."*

### Question 2 (The Second-Order Failure Mode):
> *"If a client on a slow 3G connection streams a 500MB file directly through our Kestrel pod to Blob Storage over 10 minutes, doesn't that tie up Kestrel connections and ingress bandwidth?"*

**The Principal Defense**:
> *"Yes! Streaming through Kestrel is the right fix for `< 25MB` synchronous API processing, but for files `> 25MB` or slow mobile links, our API should **never touch the payload bytes at all**. Instead, we implement the **Valet Key Pattern (User Delegation SAS Token)**: Kestrel validates authorization in `2ms`, returns a time-bound (`15m`), write-only (`cw`), single-blob SAS URI, and the client uploads directly to Azure Blob Storage edge POPs at 100 Gbps."*

### Question 3 (The FinOps / Cost Axis):
> *"Our security team demands inline antivirus scanning (ClamAV sidecar) on every uploaded file before a user can download it, which requires holding the full file in a 16GB RAM disk per pod ($3,400/month). Defend the 80%-good alternative at 10% of the cost."*

**The Principal Defense**:
> *"Never scan large files synchronously in pod RAM. Have the client upload directly to an untrusted **`quarantine-uploads` Blob Container** via Valet Key SAS (`$0` API compute). Event Grid triggers an asynchronous **Azure Defender for Storage malware scan (or isolated Event-Driven Spot Worker)** that streams the blob, verifies the hash/scan, and promotes clean blobs to the **`verified-documents` Container**. It costs 90% less and makes API OOMs impossible."*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0301 — LOH Multipart MemoryStream OOM

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 2 minutes | **Mitigation Latency (TTM)**: 19 minutes

## Five Whys Root Cause Chain
1. **Why did pods crash with Exit 137?** -> Process RSS exceeded the 2048MB cgroup memory limit.
2. **Why did RSS jump by 1.4GB in 2 seconds?** -> 8 concurrent 50MB uploads allocated 178MB each on the LOH.
3. **Why did a 50MB file allocate 178MB on the LOH?** -> `MemoryStream` doubled its internal array (`32->64->128MB`) and `.ToArray()` allocated another `50MB` copy.
4. **Why did the SOH metric look normal?** -> Dashboards only plotted Gen 0/1/2 SOH and omitted `loh-size` and container working set RSS.
5. **Why were 50MB files proxied through the API at all?** -> Missing Valet Key (SAS) direct-upload pattern for large payloads.

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Replace `MemoryStream.ToArray()` with `MultipartReader` streaming & Valet Key SAS for >10MB | Storage Team | Roslyn analyzer bans `MemoryStream.ToArray()` in Controller/Endpoint classes |
| P1 | Add `loh-size` and `container_memory_working_set_bytes` to primary Grafana row | SRE Team | Alert fires when LOH > 25% of container limit |
```
