# Sprint 03 War Room: Storage, Streaming, Memory & CDN SEV-1 Incidents

> **Companion Track to**: `03-Storage/`  
> **Simulation Mode**: Predict-Before-Reveal Gate + Fermi `📐 Derive It` + Executable Runbooks + Socratic Cost Defense

---

## Incident Catalog

| # | Incident | Primary Failure Vector | Red Herring Trap |
|---|---|---|---|
| **01** | [`01-Incident-LOH-MemoryStream-Multipart-OOM.md`](./01-Incident-LOH-MemoryStream-Multipart-OOM.md) | `IFormFile` + `MemoryStream.ToArray()` allocating $3.5	imes$ file size on LOH (`Exit 137`). | Healthy-looking Gen 0/1/2 Small Object Heap (`190 MB`) metric. |
| **02** | [`02-Incident-SAS-Token-Clock-Skew-And-Valet-Key-Leak.md`](./02-Incident-SAS-Token-Clock-Skew-And-Valet-Key-Leak.md) | Unbuffered `StartsOn = UtcNow` NTP drift `403`s + over-scoped `sr=c` Container SAS leak. | Frontend suspicion of browser local timezone offset issues. |
| **03** | [`03-Incident-CDN-Origin-Shield-Collapse-Range-Storm.md`](./03-Incident-CDN-Origin-Shield-Collapse-Range-Storm.md) | Omitted `enableRangeProcessing: true` turning `<video>` range probes into 850MB `200 OK` floods. | `98.4%` Request-Count CDN Cache Hit Ratio masking `0.02%` Byte Hit Ratio. |
