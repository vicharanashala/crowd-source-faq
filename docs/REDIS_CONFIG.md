# Redis Caching Guide

How Redis is integrated into the Yaksha FAQ backend, how to set it up locally,
and how to configure environment variables.

---

## Architecture — adaptive cache backend

The semantic/search cache (`apps/backend/src/utils/http/cache.ts`) picks its
backend at startup:

| `REDIS_TCP_URL` | Backend | Scope |
|---|---|---|
| set | ioredis → shared Redis | shared across all backend instances |
| unset | in-process `lru-cache` | per-process (fine for single-instance dev) |

The public API is identical either way (`getCachedResults`, `setCachedResults`,
`invalidateCache`, `cacheAvailable`, `cacheGet`, `cacheSet`,
`invalidateByPattern`), so callers never know which backend is active.
Redis failures degrade gracefully: every operation catches and logs, returning
a cache miss / no-op instead of failing the request.

**When do you need Redis?** Any multi-instance deployment — serverless
(Vercel), horizontal scaling, PM2 cluster mode. Each instance has its own LRU,
so without a shared store the hit rate collapses toward zero and rate/search
costs multiply. For local single-process dev it is optional (but nice: cache
survives backend restarts).

## What gets cached

| Keys | Content | TTL |
|---|---|---|
| `result:sc:<hash>` | semantic search results per normalized query | 15 min |
| `faq:*` | grouped FAQ lists | 5–10 min |
| `stats:*`, `trending:*` | admin stats, trending queries | 30 s – 5 min |

All mutation paths (FAQ create/approve, community resolve, promotions…) call
`invalidateCache()` / `invalidateByPattern()` so stale entries are dropped on
whichever backend is active.

## Local setup (Docker)

```bash
# Option A — via compose (also used by the full docker-compose stack)
docker compose up -d redis

# Option B — standalone container
docker run -d --name local-redis -p 6379:6379 redis
```

Then in `apps/backend/.env` (or `.env.local`):

```
REDIS_TCP_URL=redis://127.0.0.1:6379
```

Restart the backend. Startup log should show:

```
[cache] Connected to Redis: 127.0.0.1:6379
```

### Verify

```bash
docker exec -it local-redis redis-cli PING   # → PONG
# search something twice in the app, then:
docker exec -it local-redis redis-cli KEYS 'result:*'
```

First search runs the full pipeline (~2 s), the repeat is served from Redis
(~0.2 s) and the log shows `[cache HIT]`.

## Production (serverless / multi-instance)

Point `REDIS_TCP_URL` at a managed Redis over TLS (Upstash, Redis Cloud,
ElastiCache…):

```
REDIS_TCP_URL=rediss://default:<password>@<host>:<port>
```

## Environment variables

| Var | Used by | Notes |
|---|---|---|
| `REDIS_TCP_URL` | cache adapter | enables the shared cache; unset = in-process LRU |
| `REDIS_URL`, `REDIS_TOKEN` | env validator only | reserved for Redis-backed rate limiting (currently falls back to in-memory) |

## Diagnostics

* `apps/backend/src/scripts/check-redis-memory.ts` — memory usage snapshot
* Prometheus metrics at `/csfaq/api/metrics` include cache hit counters
