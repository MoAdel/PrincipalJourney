# Distributed Rate Limiting & Traffic Shaping Algorithms

> "Without rate limiting, an enterprise API is an unauthenticated invitation for bad actors to crash your database and drain your cloud budget."

---

## 1. Algorithmic Comparison

```text
┌───────────────────────────┬────────────────────────────────────────────────────────┐
│ Algorithm                 │ Mechanics, Pros & Cons                                 │
├───────────────────────────┼────────────────────────────────────────────────────────┤
│ 1. Fixed Window Counter   │ Counts requests in 1-minute bucket (12:00:00 - 12:00:59)│
│                           │ Con: Boundary Burst. 100 reqs at :59, 100 reqs at :00  │
│                           │ results in 200 reqs in 2 seconds (2x limit)!          │
├───────────────────────────┼────────────────────────────────────────────────────────┤
│ 2. Sliding Window Log     │ Stores timestamp of every request in Redis Sorted Set. │
│                           │ Pro: 100% mathematical precision.                      │
│                           │ Con: Extreme memory overhead under high load.          │
├───────────────────────────┼────────────────────────────────────────────────────────┤
│ 3. Token Bucket           │ Tokens added at constant rate up to capacity. Allows   │
│                           │ controlled bursts while enforcing long-term rate.      │
├───────────────────────────┼────────────────────────────────────────────────────────┤
│ 4. Sliding Window Counter │ Blends counts from current and previous window:        │
│                           │ Count = (Prev * (1 - %Window)) + Current.              │
│                           │ GOLD STANDARD: Constant memory (2 counters) & accurate!│
└───────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 2. High-Performance Sliding Window Rate Limiter via Redis Lua

Because multiple API instances evaluate limits concurrently, rate limiting must execute **atomically** inside Redis using a single Lua script:

```lua
-- Redis Sliding Window Lua Script
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

local clearBefore = now - window

-- 1. Remove expired timestamps
redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)

-- 2. Count requests in current window
local currentRequests = redis.call('ZCARD', key)

if currentRequests < limit then
    -- 3. Add current request timestamp
    redis.call('ZADD', key, now, now)
    redis.call('EXPIRE', key, math.ceil(window / 1000))
    return 1 -- PERMITTED
else
    return 0 -- REJECTED (HTTP 429)
end
```

---

## 3. Formal & Verified References

* [IETF Draft: RateLimit Header Fields for HTTP (RFC Draft)](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers-07)
* [Figma Engineering: An Alternative Approach to Rate Limiting](https://www.figma.com/blog/an-alternative-approach-to-rate-limiting/)
* [Microsoft Learn: Rate Limiting Middleware in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit)
