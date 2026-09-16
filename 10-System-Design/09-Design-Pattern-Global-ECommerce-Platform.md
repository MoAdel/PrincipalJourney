# Case Study 1: Global High-Availability E-Commerce Flash-Sale Platform

Designing a global e-commerce engine capable of surviving a 100,000 RPS flash sale with zero inventory oversell and 99.999% availability.

---

## 1. System Requirements & Constraints

- **Scale**: 100,000 requests per second at peak.
- **Inventory Constraint**: Exactly 50,000 units of stock. **Zero overselling** allowed (hard business invariant).
- **Latency**: p99 checkout latency $< 200\text{ms}$.
- **Global Availability**: Multi-region active-active deployment across Americas, Europe, and Asia.

---

## 2. End-to-End Architecture Blueprint

```mermaid
graph TB
    subgraph GlobalEdge ["Global Edge Layer"]
        Client[Global Clients] -->|Anycast / WAF| AFD[Azure Front Door / Cloudflare]
        AFD -->|Path: /checkout| APIM[API Management Gateway]
    end

    subgraph AdmissionTier ["Virtual Waiting Room & Traffic Gate"]
        APIM --> VR[Virtual Waiting Room / Fair Queue]
        VR -->|Admitted Tokens| CheckoutSvc[Checkout Service Cluster]
    end

    subgraph InventoryTier ["Distributed Inventory Reservation Tier"]
        CheckoutSvc -->|Atomic Lua Reservation| RedisCluster[(Redis Sentinel / Cluster)]
        RedisCluster -->|Successful Token Issued| Outbox[(Transactional Outbox)]
    end

    subgraph FulfillmentTier ["Asynchronous Settlement Tier"]
        Outbox --> Kafka[Kafka: OrderConfirmed Topic]
        Kafka --> PaymentWorker[Payment Settlement Workers]
        PaymentWorker --> PrimaryDB[(PostgreSQL Primary Shard)]
    end
```

---

## 3. Deep Dive: The Two-Phase Inventory Reservation Engine

To prevent database row lock contention during 100k RPS surges, inventory is decoupled into **In-Memory Reservation Tokens** and **Asynchronous Settlement**.

```mermaid
sequenceDiagram
    participant User as Customer
    participant App as Checkout Service
    participant Redis as Redis Inventory Token Bucket
    participant DB as Relational Database

    User->>App: POST /checkout (itemId: 101)
    App->>Redis: EVALSHA reserve_stock.lua (item_101, userId)
    alt Stock Available (count > 0)
        Redis->>Redis: Decrement counter, record ReservationId
        Redis-->>App: OK: ReservationToken (Valid for 15 minutes)
        App-->>User: 202 Accepted (Reservation Secured, redirect to payment)
        Note over User,DB: Customer has 15 minutes to enter credit card without locking database!
        User->>App: Complete Payment
        App->>DB: Settle Order in DB (Asynchronous Outbox)
    else Stock Depleted (count == 0)
        Redis-->>App: OUT_OF_STOCK
        App-->>User: 409 Sold Out
    end
```

### Redis Reservation Lua Script
```lua
-- KEYS[1]: stock key (e.g. "stock:phone-2026")
-- KEYS[2]: reservations key (e.g. "reservations:phone-2026")
-- ARGV[1]: userId
-- ARGV[2]: expiration timestamp (now + 15 min)

local stock = tonumber(redis.call('GET', KEYS[1]) or "0")

if stock > 0 then
    redis.call('DECR', KEYS[1])
    redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
    return 1 -- Success
else
    return 0 -- Sold out
end
```

### Why This Design Is Unbeatable:
1. **Zero Database Locks**: The relational database never experiences concurrent row locks on `stock`. It processes orders smoothly downstream via Kafka.
2. **Deterministic Oversell Protection**: Redis single-threaded execution guarantees that `stock` will never drop below 0.
3. **Automatic Abandonment Expiration**: A background worker scans `reservations` for expired tokens ($> 15\text{ minutes}$) and returns unclaimed stock back to `stock` via `INCR`.
