# The `📐 Derive It` (Fermi Mode) Authoring Convention

Every quantitative claim in War Rooms, System Design chapters, and Hands-On Labs must be derived from first principles using the standard Fermi block syntax below. `dashboard.html` automatically parses these blocks and attaches the interactive **Back-of-Envelope Calculator Widget**.

## Standard Markdown Syntax

```markdown
> 📐 **Derive It (Fermi Mode): <Calculation Title>**
> - **Inputs**: `RPS = 5000`, `RowSizeKB = 8`, `HoldTimeMs = 250`
> - **Formula**: `ActiveMemoryMB = (RPS * (HoldTimeMs / 1000) * RowSizeKB) / 1024`
> - **Step-by-Step**:
>   1. Concurrent in-flight items via Little's Law: $L = \lambda \times W = 5,000 \times 0.25\text{ s} = 1,250\text{ requests}$.
>   2. Memory per request buffer: $1,250 \times 8\text{ KB} = 10,000\text{ KB} \approx 9.76\text{ MB}$.
> - **What-If Sensitivity**: Increase `HoldTimeMs` from `250ms` to `12,000ms` (downstream timeout stall) — concurrency jumps to $60,000$ in-flight requests, consuming $480\text{ MB}$ of pinned buffers and exhausting the 32,768 ephemeral port range!
```
