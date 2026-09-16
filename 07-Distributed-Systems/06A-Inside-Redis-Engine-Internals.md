# Inside Redis Engine Internals: Event Loops, Memory Eviction & 16,384 Slots

> "Redis is fast not because of multi-threading, but because it avoids thread synchronization, lock contention, and context switching by executing commands in a single-threaded non-blocking event loop."

---

## 1. The Single-Threaded Reactor Architecture (`ae.c`)

Redis utilizes a custom multiplexed I/O event loop (`ae.c`) built over OS-level notification primitives:
* **Linux**: `epoll`
* **macOS / BSD**: `kqueue`
* **Solaris**: `evport`

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        REDIS EVENT LOOP (ae.c)                         │
├────────────────────────────────────────────────────────────────────────┤
│ 1. epoll_wait(): OS wakes thread when TCP sockets have readable bytes.│
│ 2. Read incoming commands into client buffer (zero thread locks).      │
│ 3. Execute command sequentially in in-memory Hash Table / SkipList.   │
│ 4. Queue outbound response in client output buffer.                    │
│ 5. Perform cron ticks: active TTL key expiration, eviction checks.    │
└────────────────────────────────────────────────────────────────────────┘
```

*Because command execution is single-threaded, every individual Redis command (`INCR`, `HSET`, `LPUSH`) is guaranteed to be physically atomic without requiring mutexes!*

---

## 2. Memory Eviction Policies (`maxmemory-policy`)

When Redis memory consumption exceeds the configured `maxmemory` ceiling:

| Eviction Policy | Algorithm | Use Case | Risk |
|---|---|---|---|
| **`noeviction`** | Default. Returns OOM error on writes. | Critical transactional data (Outbox, BullMQ). | API crashes when Redis fills up. |
| **`allkeys-lru`** | Approximated Least Recently Used across all keys. | General web caching. | May evict session or security keys. |
| **`volatile-lru`** | Evicts LRU keys *that have an explicit TTL set*. | Mixed workloads (Cache + Persistent state). | Crashes with OOM if no TTL keys exist. |
| **`allkeys-lfu`** | Least Frequently Used (Tracked via logarithmic counter). | Power-law access distributions (Viral content). | Preserves popular keys even if unread for hours. |

---

## 3. Redis Cluster Architecture: The 16,384 Hash Slot Space

Redis Cluster does not use consistent hashing. Instead, it shards data across **exactly 16,384 logical Hash Slots**:

$$	ext{Slot} = 	ext{CRC16}(	ext{Key}) \pmod{16384}$$

```text
┌─────────────────────────┬─────────────────────────┬─────────────────────────┐
│ Node A (Master)         │ Node B (Master)         │ Node C (Master)         │
│ Slots 0 - 5460          │ Slots 5461 - 10922      │ Slots 10923 - 16383     │
└─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

### Hash Tags (`{...}`) for Multi-Key Operations
Multi-key operations (e.g., Lua scripts, MGET, Transactions) **fail in Redis Cluster** if keys reside on different nodes. 
To force related keys into the exact same slot, use **Hash Tags**:
* Key 1: `user:{9821}:profile`
* Key 2: `user:{9821}:orders`
* Redis computes `CRC16("9821")`, placing both keys on the identical node!

---

## 4. Formal & Verified References

* [Redis Source Code: ae.c (An asynchronous event library)](https://github.com/redis/redis/blob/unstable/src/ae.c)
* [Redis Documentation: Redis Cluster Specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)
* [Salvatore Sanfilippo: Redis Memory Eviction Mechanics](http://antirez.com/news/109)
