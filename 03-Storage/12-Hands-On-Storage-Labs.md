# 12 - Hands-On Storage & Streaming Architecture Labs

> "Storage architecture is proven through practical code implementation, memory profiling, and high-throughput streaming tests."

---


> 📐 **Derive It (Fermi Mode): Capacity, Throughput & Memory Envelope**
> - **Inputs**: `TargetRPS = 2000`, `OperationLatencyMs = 8`, `PayloadKB = 16`
> - **Formula**: `ConcurrentInFlightMemoryMB = (TargetRPS * (OperationLatencyMs / 1000) * PayloadKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight operations by Little's Law: $L = 2,000 \times 0.008\text{ s} = 16\text{ active operations}$.
>   2. Steady-state buffer footprint: $16 \times 16\text{ KB} = 256\text{ KB}$ ($0.25\text{ MB}$).
> - **What-If Sensitivity**: If downstream contention degrades `OperationLatencyMs` from `8ms` to `4,000ms`, concurrency spikes $500\times$ to $8,000\text{ in-flight operations}$ ($128\text{ MB}$ + thread/socket exhaustion). Always verify how your lab holds under $10\times$ latency degradation!


# Lab 1: Zero-Allocation Streaming Parser with `System.IO.Pipelines`

### Objective:
Implement a zero-allocation, high-throughput line-by-line streaming catalog reader using `PipeReader` and `ReadOnlySequence<byte>`.

```csharp
public sealed class CatalogStreamParser
{
    public static async Task ProcessAsync(PipeReader reader, Func<ReadOnlySequence<byte>, Task> lineHandler)
    {
        while (true)
        {
            ReadResult result = await reader.ReadAsync();
            ReadOnlySequence<byte> buffer = result.Buffer;

            while (TryReadLine(ref buffer, out ReadOnlySequence<byte> line))
            {
                await lineHandler(line);
            }

            reader.AdvanceTo(buffer.Start, buffer.End);

            if (result.IsCompleted) break;
        }

        await reader.CompleteAsync();
    }

    private static bool TryReadLine(ref ReadOnlySequence<byte> buffer, out ReadOnlySequence<byte> line)
    {
        SequencePosition? position = buffer.PositionOf((byte)'\n');
        if (position == null)
        {
            line = default;
            return false;
        }

        line = buffer.Slice(0, position.Value);
        buffer = buffer.Slice(buffer.GetPosition(1, position.Value));
        return true;
    }
}
```

---

# Lab 2: Direct-to-Blob User Delegation SAS Ticket Generator

### Objective:
Implement a secure endpoint that generates a short-lived, write-only SAS upload ticket without exposing master storage credentials.

```csharp
app.MapPost("/api/v1/media/upload-ticket", async (
    [FromBody] MediaTicketRequest request,
    BlobServiceClient blobServiceClient,
    ClaimsPrincipal user) =>
{
    var tenantId = user.FindFirst("tid")?.Value;
    if (string.IsNullOrEmpty(tenantId)) return Results.Forbid();

    var blobName = $"{tenantId}/{Guid.NewGuid():N}-{request.FileName}";
    var containerName = "media-uploads";

    // 1. Get User Delegation Key from Azure AD (Managed Identity):
    var userDelegationKey = await blobServiceClient.GetUserDelegationKeyAsync(
        startsOn: DateTimeOffset.UtcNow.AddMinutes(-5),
        expiresOn: DateTimeOffset.UtcNow.AddMinutes(20));

    // 2. Build tightly scoped SAS parameters:
    var sasBuilder = new BlobSasBuilder
    {
        BlobContainerName = containerName,
        BlobName = blobName,
        Resource = "b",
        StartsOn = DateTimeOffset.UtcNow.AddMinutes(-5),
        ExpiresOn = DateTimeOffset.UtcNow.AddMinutes(20),
        Protocol = SasProtocol.Https
    };
    sasBuilder.SetPermissions(BlobSasPermissions.Create | BlobSasPermissions.Write);

    var blobClient = blobServiceClient.GetBlobContainerClient(containerName).GetBlobClient(blobName);
    var sasUri = new BlobUriBuilder(blobClient.Uri)
    {
        Sas = sasBuilder.ToSasQueryParameters(userDelegationKey, blobServiceClient.AccountName)
    }.ToUri();

    return Results.Ok(new MediaTicketResponse(
        UploadUrl: sasUri.ToString(),
        BlobPath: blobName,
        BlockSize: 4 * 1024 * 1024 /* 4 MB */,
        ExpiresAt: DateTimeOffset.UtcNow.AddMinutes(20)));
})
.RequireAuthorization();
```

---

# Lab 3: Resumable Block Blob Chunked Uploader with `ArrayPool<byte>`

### Objective:
Implement a client/service module that uploads 500 MB files in parallel 4 MB blocks and commits them atomically.

```csharp
public sealed class ResumableBlobUploader(BlockBlobClient blobClient)
{
    public async Task UploadAsync(Stream stream, int blockSize = 4 * 1024 * 1024, CancellationToken ct = default)
    {
        var blockIds = new List<string>();
        byte[] buffer = ArrayPool<byte>.Shared.Rent(blockSize);

        try
        {
            int blockIndex = 0;
            int bytesRead;

            while ((bytesRead = await stream.ReadAsync(buffer.AsMemory(0, blockSize), ct)) > 0)
            {
                string blockId = Convert.ToBase64String(Encoding.UTF8.GetBytes(blockIndex.ToString("D6")));
                blockIds.Add(blockId);

                using var memorySegment = new MemoryStream(buffer, 0, bytesRead, writable: false);
                await blobClient.StageBlockAsync(blockId, memorySegment, cancellationToken: ct);
                blockIndex++;
            }

            await blobClient.CommitBlockListAsync(blockIds, cancellationToken: ct);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }
}
```

---

# Lab 4: HTTP 206 Partial Content Media Streamer

### Objective:
Implement a seekable video streaming endpoint with byte-range support and `Accept-Ranges` headers.

```csharp
app.MapGet("/api/v1/media/{id}/stream", async (
    Guid id, 
    BlobServiceClient blobServiceClient, 
    CancellationToken ct) =>
{
    var blobClient = blobServiceClient.GetBlobContainerClient("videos").GetBlobClient($"{id}.mp4");
    if (!await blobClient.ExistsAsync(ct)) return Results.NotFound();

    var properties = await blobClient.GetPropertiesAsync(cancellationToken: ct);
    var stream = await blobClient.OpenReadAsync(cancellationToken: ct);

    return Results.File(
        stream: stream,
        contentType: properties.Value.ContentType ?? "video/mp4",
        fileDownloadName: $"{id}.mp4",
        enableRangeProcessing: true); // Native HTTP 206 support!
});
```
