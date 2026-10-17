# Incident 03: The Unbounded HTTP `206` Range-Request Origin Shield Collapse

> **SEV-1 Incident Post-Mortem & Architectural Refactoring**  
> **Environment**: Global Video Training Portal / Azure Front Door CDN + ASP.NET Core Origin API  
> **Business Impact**: Origin egress bandwidth saturated at 40 Gbps; $38,000 unbudgeted egress bill in 6 hours; Origin pods exhausted file descriptors  
> **Competencies Mastered**: RFC 9110 Section 14 (`Range` / `206 Partial Content`), CDN Chunked Range Caching, Origin Shielding, `EnableRangeProcessing = true`

---

## 🚨 1. The 07:45 PM Crisis Briefing

The company launched a 4K onboarding video (`850 MB` MP4) watched by 12,000 concurrent employees globally. Despite putting Azure Front Door CDN in front of the Origin API, the Origin cluster melted down:

```text
[19:45:10] Network Alert: Origin AKS Cluster outbound NIC saturated at 40.0 Gbps!
[19:45:40] RED HERRING: CDN Dashboard shows "Static Asset Cache Hit Ratio: 98.4%" (because tiny CSS/PNG files are 98% of request count!).
[19:46:15] Origin Alert: Every iOS Safari & Chrome <video> scrub triggers a full 850 MB download from Origin Storage!
```

> 📐 **Derive It (Fermi Mode): Un-Cached / Full-File Range Egress Amplification**
> - **Inputs**: `ConcurrentViewers = 12000`, `RangeScrubRequestsPerViewer = 8`, `FullVideoSizeMB = 850`, `CloudEgressCostPerGB = 0.08`
> - **Formula**: `WastedOriginEgressTB = (ConcurrentViewers * RangeScrubRequestsPerViewer * FullVideoSizeMB) / (1024 * 1024)`
> - **Step-by-Step**:
>   1. HTML5 `<video>` players do not download a file in one request; they send multiple `Range: bytes=0-`, `Range: bytes=419430400-` requests as users scrub or buffer chunks.
>   2. Because the custom ASP.NET Core controller returned `File(stream, "video/mp4")` **without** `enableRangeProcessing: true` (and returned dynamic `Vary: Authorization` headers without CDN chunk caching), the origin ignored the `Range` header and streamed the **entire 850 MB file (`HTTP 200 OK`)** on every range probe!
>   3. Total origin data transfer: $12,000 \times 8 \times 850\text{ MB} = 81,600,000\text{ MB} \approx 77.8\text{ Terabytes}$!
>   4. At `$0.08/GB` egress: $79,687\text{ GB} \times \$0.08 = \$6,375/\text{hour}$ ($\$38,250$ over 6 hours)!
> - **What-If Sensitivity**: Enabling RFC 9110 `enableRangeProcessing: true` (`HTTP 206 Partial Content` + `Accept-Ranges: bytes`) + CDN `2 MB` Object Chunk Caching + **Origin Shielding** collapses origin egress to **1 single copy of the 850 MB file** (`$0.07` total origin egress)!

<!-- TELEMETRY_WIDGET: title="HTTP Range Storm & Origin Egress Saturation" metric1="Origin Egress Bandwidth (Gbps)" metric2="Byte-Weighted CDN Hit Ratio (%)" threshold="10 Gbps Origin NIC Limit" -->

---

## 🔍 2. Diagnostic Investigation (Predict-Before-Reveal)

### Executable Diagnostic Runbook
```bash
# Step 1: Expose the "98.4% Cache Hit Ratio" Red Herring -> Check BYTE-weighted hit ratio vs Request-count hit ratio!
# Request-count hit ratio = 98.4% (100 tiny icons hit, 1 huge 850MB video missed = 0.1% BYTE hit ratio!)

# Step 2: Probe the Origin endpoint with an RFC 9110 Range header
curl -I -H "Range: bytes=0-1023" https://api.principal.io/v1/media/onboarding-4k.mp4
# Output: HTTP/2 200 OK (❌ Should be HTTP/2 206 Partial Content!)
#         Content-Length: 891289600 (❌ Sending 850MB instead of 1024 bytes!)
```

### Observed Culprit Code Snippet
```csharp
// ❌ IGNORES HTTP RANGE HEADERS & STREAMS 850MB THROUGH ORIGIN POD:
[HttpGet("{fileName}")]
public async Task<IActionResult> GetVideo(string fileName, CancellationToken ct)
{
    var stream = await _blobContainer.GetBlobClient(fileName).OpenReadAsync(cancellationToken: ct);
    // enableRangeProcessing defaults to FALSE! Returns 200 OK with full 850MB stream!
    return File(stream, "video/mp4");
}
```

<!-- PREDICT_GATE: Commit your hypothesis: Why did the CDN dashboard report a 98.4% cache hit ratio while 77 TB bypassed the cache, and why did the `<video>` tag trigger 8 full-file downloads per viewer? -->

---

## ⚙️ 3. Deep Engine Internals & Root Cause (2nd-Order Effects)

### 1. Request-Count Hit Ratio vs. Byte-Weighted Hit Ratio
* If a page loads 99 cached `2 KB` icons (`198 KB` total) and 1 uncached `850 MB` video, the **Request Hit Ratio** is $99/100 = 99\%$, while the **Byte Hit Ratio** is $rac{0.198	ext{ MB}}{850.198	ext{ MB}} = 0.023\%$! Always monitor **Byte Hit Ratio** and **Origin Egress Bandwidth** on CDN dashboards.

### 2. RFC 9110 Range Processing & CDN Signed Cookies
* When `enableRangeProcessing: true` is set (or better yet, when Azure Front Door fetches directly from Azure Blob Storage Origin with **Origin Shield** enabled), the server responds with `HTTP 206 Partial Content`, `Accept-Ranges: bytes`, `Content-Range: bytes 0-2097151/891289600`, and an `ETag`.

---

## 🛠️ 4. The Architecture Refactor & Scoreboard

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace PrincipalJourney.Storage.WarRoom;

[ApiController]
[Route("api/v1/media")]
public sealed class RangeAwareMediaController(BlobContainerClient containerClient) : ControllerBase
{
    [HttpGet("{fileName}")]
    public async Task<IActionResult> StreamMediaWithRangeSupportAsync(string fileName, CancellationToken ct)
    {
        var blobClient = containerClient.GetBlobClient(fileName);
        var properties = await blobClient.GetPropertiesAsync(cancellationToken: ct);

        // 1. Emit immutable Cache-Control & ETag so CDN Origin Shield caches 2MB range chunks at the edge!
        Response.Headers.CacheControl = "public, max-age=86400, s-maxage=604800, immutable";

        var entityTag = new EntityTagHeaderValue($""{properties.Value.ETag.ToString().Trim('"')}"");

        // 2. Open seekable Azure Blob read stream (translates Stream.Seek into HTTP Range reads on Storage!)
        var seekableBlobStream = await blobClient.OpenReadAsync(
            new Azure.Storage.Blobs.Models.BlobOpenReadOptions(allowModifications: false)
            {
                BufferSize = 2 * 1024 * 1024 // 2MB read-ahead chunk
            },
            ct);

        // 3. CRITICAL: enableRangeProcessing: true enables native RFC 9110 206 Partial Content handling!
        return File(
            fileStream: seekableBlobStream,
            contentType: properties.Value.ContentType ?? "video/mp4",
            lastModified: properties.Value.LastModified,
            entityTag: entityTag,
            enableRangeProcessing: true);
    }
}
```

### 📊 The Scoreboard: Before vs. After

| Metric | Before (200 OK Uncached Stream) | After (206 Range + CDN Origin Shield) | Validation & Rollback Procedure |
|---|---|---|---|
| **Origin Egress Bandwidth** | `40.0 Gbps` (Saturated) | **`0.02 Gbps`** (`99.95%` Byte Cache Hit Ratio) | Automated curl probe asserts `HTTP 206` and `Content-Length: 1024` for `Range: bytes=0-1023`. |
| **6-Hour Egress Cloud Bill** | `$38,250` (`77.8 TB`) | **`$4.20`** (Served from CDN POPs) | FinOps hourly egress anomaly alert set at `$100/hr`. |

---

## 🛡️ 5. The Socratic Duel (ARB / CTO Defense)

### Question 1 (The Quick-Fix Trap):
> *"Why even allow our ASP.NET Core API to be the CDN Origin for video files? Why not point the CDN directly at the Azure Blob Storage container?"*

**The Principal Defense**:
> *"You are 100% right! Pointing the CDN Origin directly at Azure Blob Storage (authenticated via **CDN Managed Identity / Origin Access Control**) and authorizing viewers at the CDN Edge via **CDN Signed Cookies / Token Auth** completely removes the ASP.NET Core cluster from the media data plane! The API above is only needed when dynamic watermark/transformation is required; for static video/HLS segments, always route CDN $ightarrow$ Origin Shield $ightarrow$ Blob Storage directly."*

### Question 2 (The Second-Order Failure Mode):
> *"What happens if an attacker sends a malicious Range header with 2,000 overlapping byte ranges (`Range: bytes=0-1, 0-2, 0-3, ...`) to trigger an asymmetric CPU/Bandwidth amplification attack (CVE-2011-3192 Apache Killer style)?"*

**The Principal Defense**:
> *"RFC 9110 Section 14.1.2 explicitly permits servers to ignore or reject multipart range requests containing excessive or overlapping ranges with `416 Range Not Satisfiable`. Both Kestrel's `RangeHelper` and Azure Front Door normalize/cap range counts, and we configure WAF rate-limiting on requests containing `> 5` comma-separated range specifiers."*

### Question 3 (The FinOps / Cost Axis):
> *"Media engineering wants to transcode every uploaded training video into 14 different HLS/DASH bitrates + AV1 + HEVC immediately on upload ($12,000/month in GPU transcoding). Defend the 80%-good alternative at 15% of the cost."*

**The Principal Defense**:
> *"85% of internal enterprise videos are watched fewer than 10 times. Pre-transcoding 14 renditions on upload wastes 85% of GPU spend. Instead, transcode **only 2 baseline renditions (`720p` and `1080p` H.264)** on upload, and trigger **Just-In-Time (Lazy) Multi-Bitrate HLS Packaging** only when a video crosses `50 unique views`!"*

---

## 📜 6. Deliverable: Blameless Post-Mortem

```markdown
# Post-Mortem: INC-2026-0303 — Unbounded HTTP Range Origin Collapse

- **Date / Severity**: 2026-10-17 | SEV-1
- **Detection Latency (TTD)**: 6 minutes | **Mitigation Latency (TTM)**: 24 minutes

## Five Whys Root Cause Chain
1. **Why did Origin NIC saturate at 40 Gbps?** -> Origin served 77.8 TB of video traffic in 6 hours.
2. **Why did every `<video>` scrub download 850 MB?** -> Controller returned `HTTP 200 OK` instead of `HTTP 206 Partial Content`.
3. **Why did `File()` return `200 OK`?** -> `enableRangeProcessing: true` was omitted.
4. **Why didn't the CDN cache the file?** -> Missing `Cache-Control` / `ETag` headers and Origin Shielding was disabled across 60 edge POPs.
5. **Why did the CDN dashboard look green?** -> Dashboard plotted Request-Count Hit Ratio (98.4%) instead of Byte-Weighted Hit Ratio (0.02%).

## Action Items & Governance Gates
| Priority | Action Item | Owner | SLO / CI Gate Verification |
|---|---|---|---|
| P0 | Route media CDN origin directly to Blob Storage with Origin Shield + Signed Tokens | Media/Infra | Synthetic probe verifies `HTTP 206` and `X-Cache: TCP_HIT` |
| P1 | Replace Request Hit Ratio panel with Byte-Weighted Hit Ratio & Origin Egress Alert | SRE Team | Alert triggers if Byte Hit Ratio < 85% for 10m |
```
