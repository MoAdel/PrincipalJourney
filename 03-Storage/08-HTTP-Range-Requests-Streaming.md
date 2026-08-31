# 08 - Media Delivery with HTTP 206 Partial Content (Range Requests)

> "A video player should never download an entire 2 GB file before starting playback.
>
> HTTP 206 Partial Content allows video players to stream small byte ranges on demand, seek instantly to any timestamp, and minimize bandwidth consumption."

---

# Why Should a Principal Engineer Care?

When serving video or audio media:
- If your server returns `HTTP 200 OK` with the full file body, browsers cannot scrub forward or backward.
- A user watching 10 seconds of a 1-hour 4K video consumes 2 GB of mobile bandwidth, driving cloud egress costs through the roof.

**HTTP 206 (Partial Content)**, standardized in RFC 9110 / RFC 7233, allows clients to request precise byte ranges (`Range: bytes=0-1048575`).

---

# The HTTP Range Request Protocol Handshake

```
Client (Video Player)                                  ASP.NET Core API / Storage
        │                                                           │
        │ 1. Initial Request (Fetch metadata / first chunk)         │
        │    GET /media/demo.mp4                                    │
        │    Range: bytes=0-1048575                                 │
        │──────────────────────────────────────────────────────────►│
        │                                                           │ 2. Reads Bytes 0 to 1,048,575
        │ 3. Response: HTTP 206 Partial Content                     │    from Storage Stream
        │    Accept-Ranges: bytes                                   │
        │    Content-Range: bytes 0-1048575/524288000 (Total 500MB) │
        │    Content-Length: 1048576                                │
        │    Content-Type: video/mp4                                │
        │◄──────────────────────────────────────────────────────────│
        │                                                           │
        │ [User Seeks to Minute 45 - Offset: 350MB]                 │
        │                                                           │
        │ 4. Range Request (Seekable Scrubbing)                     │
        │    GET /media/demo.mp4                                    │
        │    Range: bytes=367001600-368050175                       │
        │──────────────────────────────────────────────────────────►│
        │                                                           │ 5. Reads exact 1MB chunk
        │ 6. Response: HTTP 206 Partial Content (Instant Playback!) │    at 350MB offset!
        │    Content-Range: bytes 367001600-368050175/524288000     │
        │◄──────────────────────────────────────────────────────────│
```

---

# Implementing HTTP 206 in ASP.NET Core

In modern ASP.NET Core, `Results.File()` and `FileStreamResult` have built-in support for range requests:

```csharp
app.MapGet("/api/v1/media/{id}/stream", async (
    Guid id, 
    IMediaStorageService storageService, 
    CancellationToken ct) =>
{
    var mediaMeta = await storageService.GetMetadataAsync(id, ct);
    if (mediaMeta == null) return Results.NotFound();

    var stream = await storageService.OpenReadStreamAsync(id, ct);

    // enableRangeProcessing: true activates HTTP 206 Range parsing automatically!
    return Results.File(
        stream: stream,
        contentType: mediaMeta.ContentType,
        fileDownloadName: mediaMeta.FileName,
        enableRangeProcessing: true);
});
```

### What `enableRangeProcessing: true` Does Automatically:
1. Emits `Accept-Ranges: bytes` response header.
2. Parses incoming `Range: bytes=start-end` headers.
3. Seeks directly to the requested stream offset without reading preceding bytes.
4. Returns `HTTP 206 Partial Content` with `Content-Range`.
5. Returns `HTTP 416 Range Not Satisfiable` if the requested range is out of bounds.

---

# Common Mistakes

❌ **Returning `File(byteArray)` for Videos**
```csharp
// DISASTER: Loads entire 1 GB file into memory array, returns 200 OK, and breaks video scrubbing!
```
✅ **Use `Results.File(stream, enableRangeProcessing: true)`.**

❌ **Using Non-Seekable Streams with Range Requests**
```csharp
// If stream.CanSeek is false (e.g. raw crypto stream without buffering), Range seeking fails with NotSupportedException.
```
✅ **Ensure underlying stream supports `.Seek()` or query Azure Blob storage with `HttpRange`.**

---

# Architect's Decision

### Scenario
Nova Commerce streams product demo videos and customer video reviews to millions of mobile app shoppers.

### Strategy:
1. **Public Media**: CDN edge caches 2 MB video segments directly from Azure Blob Storage with HTTP 206 support.
2. **Private/Protected Media**: Web API authenticates user, verifies permissions, and streams via `Results.File(stream, enableRangeProcessing: true)`.
3. **Egress Savings**: 85% bandwidth reduction compared to non-ranged downloads.

---

# Self Assessment

1. Explain the difference between HTTP 200 OK and HTTP 206 Partial Content.
2. What are the key HTTP headers used during a Range Request (`Range`, `Accept-Ranges`, `Content-Range`)?
3. How does `enableRangeProcessing: true` in ASP.NET Core enable video scrubbing on mobile devices?
4. What HTTP status code should be returned if a client requests `Range: bytes=999999999-` on a 10 MB file?
