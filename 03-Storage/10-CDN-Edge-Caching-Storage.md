# 10 - CDN Edge Caching & Cache-Control Architecture

> "The cheapest, fastest, and most reliable storage request is the one that never reaches your storage account at all."

---

# Why Should a Principal Engineer Care?

Cloud object storage bandwidth is expensive (cloud data egress fees).

If 10 million users request product images directly from Azure Blob Storage:
- Your storage account egress bill will skyrocket to tens of thousands of dollars.
- Latency across continents (e.g. Asia to US East) will exceed 250ms TTFB (Time to First Byte).
- Storage account IOPS limits will be breached during flash sales.

By placing a **Content Delivery Network (CDN)** (Azure Front Door / Cloudflare) in front of object storage with strict **Cache-Control governance**:
- 98%+ of requests are served from edge servers within 25ms of the user.
- Storage egress bandwidth is slashed by over 90%.
- Origin storage is completely shielded from DDOS and traffic surges.

---

# The CDN Edge Caching Architecture

```
User (London, UK)                    CDN Edge Node (London Edge)                 Azure Blob Storage (US East)
       │                                         │                                           │
       │ 1. GET /media/images/shoe-v1.webp       │                                           │
       │────────────────────────────────────────►│                                           │
       │                                         │── 2. [Cache MISS - Fetch Origin]─────────►│
       │                                         │   (Compressed, Origin Shielding)          │
       │                                         │◄── 3. 200 OK + Cache-Control: max-age=1y ─│
       │ 4. 200 OK (Served from Edge)            │                                           │
       │◄────────────────────────────────────────│ (Stores in Edge Memory/SSD)               │
       │                                                                                     │
[ Subsequent 50,000 Users in Europe ]                                                        │
       │ 5. GET /media/images/shoe-v1.webp       │                                           │
       │────────────────────────────────────────►│                                           │
       │ 6. 200 OK (Cache HIT - 12ms Latency!)   │ (0 Requests sent to Azure Blob!)          │
       │◄────────────────────────────────────────│                                           │
```

---

# The Golden Rule of CDN Caching: Immutable Asset URLs

How do you update an image if it is cached at the edge for 1 year?

### Anti-Pattern: Static URLs with Cache Purging
```
URL: https://cdn.novacommerce.com/products/shoe.jpg
Problem: When the shoe photo changes, you must send cache purge API commands to 200 edge POPs globally. Purging takes minutes and risks stale cache inconsistency.
```

### Principal Standard: Fingerprinted / Versioned Immutable URLs
```
URL: https://cdn.novacommerce.com/products/shoe_v1_8f2a1b.webp
URL: https://cdn.novacommerce.com/products/shoe_v2_9c3d4e.webp
```

When an asset updates, the application emits a **new URL with a content hash**.

### Cache-Control Header:
```http
Cache-Control: public, max-age=31536000, immutable
```

- **`public`**: Can be cached by CDNs, ISPs, and browser caches.
- **`max-age=31536000`**: Cache for 1 year (31,536,000 seconds).
- **`immutable`**: Tells browsers that the response body **will never change**, preventing browsers from sending conditional `304 Not Modified` revalidation requests on page refresh.

---

# Dynamic Image Resizing & Modern Web Formats

A Principal Engineer implements **Edge Image Optimization**:
- Automatically convert source JPEG/PNG files to modern **WebP** or **AVIF** (reducing file size by 60–80%).
- Generate dynamic thumbnail dimensions on the fly via CDN edge worker rules:
  ```
  https://cdn.novacommerce.com/media/products/shoe.webp?width=400&format=webp
  ```

---

# Common Mistakes

❌ **Setting `Cache-Control: no-cache` on Static Product Images**
```
// Destroys CDN caching, forcing every single user request to hit cloud storage origin.
```
✅ **Use `public, max-age=31536000, immutable` with hashed filenames.**

❌ **Exposing Raw Blob Storage URLs to the Public Web**
```
// Leaks storage account topology, bypasses CDN edge caching, and increases egress costs.
```
✅ **Restrict storage container access so that ONLY the CDN Origin Shield / Front Door can read from it.**

---

# Architect's Decision

### Scenario
Nova Commerce serves 50 million image and video requests daily.

### Strategy:
1. **Edge Distribution**: Azure Front Door Premium with Origin Shielding.
2. **Access Control**: Storage container configured with Private Access; Front Door connects via Private Endpoint / Managed Identity.
3. **Caching Headers**: All media assets emitted with `Cache-Control: public, max-age=31536000, immutable`.
4. **Egress Savings**: 98.4% edge cache hit ratio, saving ~$35,000/month in cloud egress fees.

---

# Self Assessment

1. Why are fingerprinted immutable URLs (`image_v2_abc.webp`) superior to manual CDN cache purging?
2. What is the difference between `max-age` and the `immutable` directive in `Cache-Control`?
3. How does CDN Origin Shielding protect storage accounts from traffic spikes across hundreds of edge POPs?
4. Why is it essential to restrict public access to origin storage when a CDN is deployed?
