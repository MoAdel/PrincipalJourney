# Production Incident Post-Mortem — The Lock Avalanche

> **Incident Severity**: **SEV-1 (Critical Revenue Loss)**  
> **Date**: Cyber Monday, 11:22 AM UTC  
> **Duration**: 14 minutes  
> **Impacted Services**: Nova Commerce Checkout API, Payment Gateway, Mobile App  
> **Financial Impact**: \$620,000 in abandoned transactions; 12,400 orders dropped

---

## 1. Executive Summary

At 11:22 AM on Cyber Monday, Nova Commerce experienced a complete checkout outage across all regions.
Customer checkout requests hung for over 28 seconds before failing with `504 Gateway Timeout`.
The root cause was a **Lock Escalation cascade** triggered by an unindexed background batch update statement that acquired an Exclusive Table Lock on the `Promotions` table.
Because the database was running in default pessimistic `READ COMMITTED` isolation, 280 concurrent checkout API threads attempting to read promotion discounts were blocked.
The blocked threads held their database connections open, exhausting the client connection pool within 12 seconds and causing a total application blackout.

---

## 2. Incident Timeline

| Time (UTC) | Event |
|---|---|
| **11:20:00** | System operating smoothly at 18,500 RPS. Database CPU at 32%. |
| **11:22:15** | Background scheduler triggers `ExpireOldPromotionsJob` executing: `UPDATE Promotions SET Status = 'Expired' WHERE EndDate < GETUTCDATE() AND Status = 'Active';` |
| **11:22:30** | Query locks 6,200 rows. Lock manager crosses 5,000 threshold and triggers **Lock Escalation**, placing an **Exclusive Table Lock (X)** on `dbo.Promotions`. |
| **11:22:42** | Checkout API requests attempting to read promotion discounts enter `LCK_M_S` wait state behind the Exclusive lock. |
| **11:22:54** | Sockets pile up. Application connection pool hits `MaxPoolSize=800`. All connection slots exhausted. |
| **11:23:10** | Ingress controllers begin returning `504 Gateway Timeout`. PagerDuty alert fires. |
| **11:23:45** | SRE attempts pod restart; pods immediately lock up again upon receiving traffic. |
| **11:24:30** | Principal Engineer joins bridge, runs `sp_whoisactive`, identifies SPID 84 holding `X` lock on `Promotions`, and terminates the query (`KILL 84`). |
| **11:25:00** | Table lock released. 40,000 queued requests surge into database, briefly pegging CPU at 100%. |
| **11:27:00** | Connection pools normalize. Checkout error rate drops to 0.01%. |
| **11:36:00** | Incident officially closed. |

---

## 3. 5-Whys Root Cause Analysis

1. **Why did the checkout API fail?**  
   The application connection pool was completely exhausted, throwing `Timeout expired obtaining a connection from the pool`.
2. **Why were all 800 pooled connections exhausted?**  
   280 application worker threads were stuck in a blocked wait state (`LCK_M_S`), holding their pooled database connections open.
3. **Why were checkout threads blocked on shared locks?**  
   A background job held an **Exclusive (X) Table Lock** on the `dbo.Promotions` table.
4. **Why did the background job hold a Table Lock instead of individual Row Locks?**  
   The query updated 6,200 rows in a single statement. The database engine triggered **Lock Escalation** to conserve memory.
5. **Why did the background update touch 6,200 rows in a single statement without an index?**  
   The developer implemented an unbatched `UPDATE` query, and the column `EndDate` had no index, forcing a full-table clustered scan.

---

## 4. Preventative Architectural Guardrails

### Action Item 1: Enable Read Committed Snapshot Isolation (RCSI)
* **Action**: Executed `ALTER DATABASE NovaCommerce SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;`.
* **Effect**: Readers no longer take Shared locks and are **never blocked by writers**. Even if an Exclusive table lock is held, checkout queries read the previous committed version from the version store in 0.8 milliseconds!

### Action Item 2: Mandate Batch Updates with Maximum Chunk Size
* **Action**: Enforce the `BatchUpdateHelper` pattern across all background services:
```csharp
// Maximum 2,500 rows per transaction (guarantees zero lock escalation)
while (await ExecuteBatchChunkAsync(batchSize: 2500) == 2500) 
{
    await Task.Delay(50); // Yield pause
}
```

### Action Item 3: Deploy Filtered Covering Index
* **Action**: Created partial covering index:
```sql
CREATE NONCLUSTERED INDEX IX_Promotions_Active_Expiry 
ON Promotions (EndDate) 
INCLUDE (Code, DiscountPercentage) 
WHERE Status = 'Active';
```
* **Effect**: Reduced scan time from 3,200ms to 4ms.
