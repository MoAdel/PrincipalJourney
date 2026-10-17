# 06 — Global Traffic Routing, Anycast vs. DNS TTL Traps & Cold-Region Protection

---

## 1. Why DNS Failover Alone Fails the `< 2 Minute` RTO Target

```text
[Global User] ──1. DNS Query──► [Recursive ISP Resolver (Ignores 30s TTL; caches for 10m!)]
              ──2. HTTP Call──► [Client HttpClient (Pools TCP socket forever without PooledConnectionLifetime!)]
```

| Global Routing Layer | Failover Speed | Pros | Cons / Failure Traps | Principal Mitigation |
|---|---|---|---|---|
| **Geo-DNS (Route53 / Traffic Manager)** | `60s – 15 minutes` | Cheap; supports any TCP/UDP protocol; zero proxy hop. | ISP resolvers and badly written client HTTP pools ignore DNS TTL! | Set `PooledConnectionLifetime = TimeSpan.FromMinutes(2)` on all `SocketsHttpHandler` clients. |
| **L7 Global Anycast Edge (Azure Front Door / Cloudflare / AWS CloudFront)** | **`< 10 – 30 seconds`** | User connects to nearest POP via BGP Anycast IP; Edge POP switches backend region over persistent warm backbone! | Client IP doesn't change, so DNS caching is completely bypassed! | Use Anycast L7 Edge for all HTTP/gRPC ingress; reserve DNS for non-HTTP protocols. |

---

## 2. Protecting the Surviving Region from Failover Overload (Load Shedding)

When Region A fails over to Region B, Region B suddenly receives `200%` traffic while its local caches for Region A's tenants are cold:
1. **Continuous Cache Key Replication (or Read-Through Rate Limiting)**: Replicate hot session/catalog keys asynchronously across regions, or guard the database behind a **Single-Flight Request Coalescer** (`SemaphoreSlim` per key) so 1,000 concurrent cache misses for the same product trigger only `1` SQL query!
2. **Priority-Based Load Shedding at Failover**: Automatically disable Tier-2 background jobs, recommendation carousels, and heavy export APIs (`HTTP 503 Retry-After: 120`) during the first 10 minutes of a regional failover to preserve 100% of DB IOPS for Tier-0/Tier-1 checkout!
