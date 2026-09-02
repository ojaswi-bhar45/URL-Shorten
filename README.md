# URL Shortener & Analytics Platform

A backend system demonstrating core system-design concepts: caching, rate limiting, async event processing, and horizontal scaling readiness.

The monolith has been split into two **independently runnable services**:

- **`url-service/`** — short URL creation, redirects, and auth (read-heavy hot path).
- **`analytics-service/`** — click analytics endpoint and the Kafka click-event consumer (write-heavy ingestion + aggregation reads).

Each service has its own entry point, `package.json`, and dependencies. They share the Postgres schema (a single `Prisma` schema at the repo root) but own distinct data-access patterns and can scale independently.

## Features

- **User authentication** — signup/login with bcrypt password hashing + JWT sessions (`url-service`)
- **Short URL creation** — collision-free 7-character code generation via nanoid (`url-service`)
- **Duplicate URL detection** — returns the existing short code instead of creating a duplicate (per user)
- **Per-user URL ownership** — links tied to the creating user's account; anonymous shortening also supported
- **Fast redirects** — Redis cache-aside pattern on the redirect path (1-hour TTL)
- **Click tracking** — every redirect publishes a fire-and-forget event to Kafka (`link-clicked` topic); the analytics consumer writes the analytics record and updates `clickCount` asynchronously
- **Link expiry** — expired links return `410 Gone`
- **Rate limiting** — Redis-based fixed window (5 req/min per user/IP) on `POST /shorten`
- **Input validation** — Zod schemas with URL scheme whitelisting (`http://` / `https://`)
- **Analytics endpoint** — total clicks, clicks-per-day (last 7 days), top referrers, recent clicks (`analytics-service`)

## Service Boundaries

| Concern | `url-service` | `analytics-service` |
|---|---|---|
| `POST /shorten` | ✅ | |
| `GET /:code` (redirect) | ✅ | |
| `GET /me/urls` | ✅ | |
| `POST /signup`, `POST /login` | ✅ | |
| Redis (cache + rate limit) | ✅ | |
| Kafka producer (click events) | ✅ | |
| `GET /analytics/:code` | | ✅ |
| Kafka consumer (click ingestion) | | ✅ |
| Postgres primary writes | ✅ | ✅ (consumer writes) |
| Postgres primary reads (redirects) | ✅ | |
| Postgres replica reads (analytics) | | ✅ |

Each service owns its own data-access patterns and scales independently: **URL Service** is read-heavy on the hot redirect path; **Analytics Service** is write-heavy on ingestion (via the consumer) and does aggregation-heavy reads.

## Architecture

```
Client
  │ HTTP
  ├──────► url-service (Express, port 3000)
  │           ├── Redis (URL cache + rate limits)
  │           ├── Postgres PRIMARY (writes, redirect reads)
  │           └── Kafka producer (link-clicked)  ──┐
  │                                                │  click events
  ├──────► analytics-service (Express, port 3001)  │
  │           ├── /analytics/:code                 │
  │           │     └── Postgres REPLICA (reads, fallback PRIMARY)
  │           └── consumer.js ◄────────────────────┘
  │                 └── Postgres PRIMARY (click_events, clickCount)
```

Redirects read from Postgres PRIMARY to avoid replication-lag 404s on freshly created links. Analytics reads from the streaming REPLICA, with automatic fallback to PRIMARY if the replica is unavailable. The consumer writes analytics (click_events + clickCount increment) to PRIMARY via a transaction. The redirect path **never writes to Postgres** — all click data flows through Kafka and is processed asynchronously by the consumer.

See [architecture.md](./architecture.md) for the full system design document.

## Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Runtime | Node.js | v24+ | JavaScript execution (CommonJS) |
| Web framework | Express | 5.x | HTTP routing, middleware pipeline |
| ORM / Database | Prisma + PostgreSQL | Prisma 7.x | Type-safe DB access via `pg` driver adapter |
| Cache | Redis | redis client 6.x | URL cache + rate-limit counters |
| Event streaming | Kafka / Redpanda | kafkajs 2.x | Fire-and-forget click-event publishing |
| Auth | JWT + bcrypt | — | Stateless session tokens, password hashing |
| Validation | Zod | 4.x | Request payload validation |
| Code generation | nanoid | 6.x | Collision-free 7-char short codes |

## Data Model

A single shared schema lives at [`prisma/schema.prisma`](./prisma/schema.prisma). Both services generate/use the Prisma client from it (they work with different tables/access patterns).

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | BigInt | Auto-increment primary key |
| `email` | String | Unique, used for login |
| `passwordHash` | String | bcrypt hash (cost factor 10) |
| `createdAt` | DateTime | Defaults to `now()` |

### `urls`

| Column | Type | Notes |
|---|---|---|
| `id` | BigInt | Auto-increment primary key |
| `shortCode` | String | Unique 7-char nanoid, used in redirects |
| `longUrl` | String | The destination URL |
| `userId` | BigInt? | Nullable FK to `users.id` (`ON DELETE SET NULL`) |
| `createdAt` | DateTime | Defaults to `now()` |
| `expiry` | DateTime? | Nullable; expired links return `410 Gone` |
| `clickCount` | BigInt | Denormalized counter, incremented by the consumer |

### `click_events`

| Column | Type | Notes |
|---|---|---|
| `id` | BigInt | Auto-increment primary key |
| `shortCode` | String | Indexed; the shortened code that was hit |
| `ip` | String? | Clicker IP address |
| `userAgent` | String? | Clicker User-Agent string |
| `referrer` | String? | HTTP Referer header |
| `clickedAt` | DateTime | Event timestamp, defaults to `now()` |

## Event-Driven Analytics

- Click events are published to Kafka (`link-clicked` topic) instead of writing directly to the database on every redirect
- The analytics service runs a consumer (`consumer.js`) that processes events asynchronously, decoupling the read-heavy redirect path from write-heavy analytics
- Consumer uses a consumer group (`analytics-consumer-group`) to support future horizontal scaling
- Tested resilience: killing the consumer mid-traffic does not lose data — Kafka retains messages until the consumer resumes and catches up

## Replication

- PostgreSQL primary handles all writes; a streaming read replica serves analytics queries
- Redirect lookups intentionally stay on the primary to avoid replication-lag-related 404s on freshly created links
- Analytics endpoint includes a health check with automatic fallback to primary if the replica is unavailable

## Prerequisites

- **Node.js** v24 or newer
- **PostgreSQL** running, with a database created
- **Redis** running (local or Redis Cloud)
- **Kafka/Redpanda** — optional but recommended; the service fails open, so redirects work even if the broker is down

## Setup

### 1. Install dependencies

The repo is an npm workspace. From the project root:

```bash
npm install
```

This installs dependencies for both `url-service` and `analytics-service` and hoists shared packages (e.g. `@prisma/client` used by the generated client).

> To keep each service fully standalone instead, run `npm install` separately inside each service folder.

### 2. Start Redpanda (Kafka-compatible) — optional

```bash
docker compose up -d
```

This starts a single-node Redpanda broker on `localhost:9092`, plus Postgres primary (`5432`) and replica (`5433`). If you already have Kafka/Postgres running, skip this step and set the `*_URL` / `KAFKA_BROKER` values in `.env`.

### 3. Generate the Prisma client

```bash
npx prisma generate --schema=prisma/schema.prisma
```

This generates the shared Prisma client into `generated/prisma` (gitignored) used by both services.

### 4. Configure environment variables

Copy each service's example to its own `.env`:

```bash
cp url-service/.env.example url-service/.env
cp analytics-service/.env.example analytics-service/.env
```

### 5. Start the URL Service

```bash
node url-service/app.js
```

Listens on port `3000` (configurable via `PORT` in `url-service/.env`).

### 6. Start the Analytics Service (separate terminal)

```bash
node analytics-service/app.js
node analytics-service/consumer.js
```

The Express app listens on port `3001` (configurable via `PORT` in `analytics-service/.env`) and serves `/analytics/:code`. The consumer connects to Kafka, subscribes to the `link-clicked` topic, and writes analytics rows to Postgres. It can be started/stopped independently — Kafka retains events until the consumer catches up.

## API Reference

### Endpoints

| Method | Path | Service | Auth | Rate Limited | Description | Response |
|---|---|---|---|---|---|---|
| `POST` | `/signup` | url | — | — | Register a new user | `201 { id, email }` |
| `POST` | `/login` | url | — | — | Log in, receive a JWT | `200 { token }` |
| `GET` | `/shorten` | url | — | — | (health example) | — |
| `POST` | `/shorten` | url | Optional Bearer | Yes (5/60s) | Create a short URL for `{ url }` | `201 { ...url }` or `200` (duplicate) |
| `GET` | `/:code` | url | — | — | Redirect to the long URL | `302` redirect |
| `GET` | `/me/urls` | url | Required Bearer | — | List authenticated user's URLs | `200 [{ ...url }, ...]` |
| `GET` | `/analytics/:code` | analytics | — | — | Click analytics for a short code | `200 { shortCode, totalClicks, clickOverTime, topRefernces, recentClicks }` |

> The `url-service` also exposes `GET /health` (primary connectivity) and serves the frontend at `/`.
> The `analytics-service` exposes `GET /health` (replica connectivity).

### Error Codes

| Code | Meaning |
|---|---|
| `400` | Validation error or invalid credentials |
| `401` | Missing, invalid, or expired JWT |
| `404` | Short code not found |
| `410` | Link has expired |
| `429` | Rate limit exceeded (response includes retry wait in seconds) |

### Example: Create a Short URL

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}' | jq -r .token)

curl -X POST http://localhost:3000/shorten \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/very/long/path"}'
```

### Example: Check Analytics

```bash
curl http://localhost:3001/analytics/QjY7qMi
```

## Project Structure

```
URL-Shorten/
├── prisma/
│   ├── schema.prisma            # Shared data model (single source of truth)
│   └── migrations/              # SQL migration history
├── prisma.config.ts             # Prisma CLI configuration
├── docker-compose.yml           # Redpanda + Postgres primary/replica setup
├── primary-init/                # Docker entrypoint scripts for Postgres primary
├── replica-init/                # Bootstrap script for Postgres replica (pg_basebackup)
├── generated/prisma/            # Shared generated Prisma client (gitignored)
│
├── url-service/                 # URL Service (shorten, redirect, auth) — port 3000
│   ├── app.js                   # Entry point — Express setup, Redis/Kafka connect
│   ├── db.js                    # Prisma primary client (pg driver adapter)
│   ├── redis.js                 # Redis client from environment variables
│   ├── kafka.js                 # Kafka producer — connect, send, reconnect logic
│   ├── routes/
│   │   ├── url.routes.js        # /health, /shorten, /:code, /me/urls
│   │   └── auth.routes.js       # /signup, /login
│   ├── middleware/
│   │   ├── auth.middleware.js   # JWT verification (auth + optionalAuth)
│   │   └── rateLimit.middleware.js  # Redis fixed-window rate limiter
│   ├── schemas/                 # Zod: signup/login + shorten validation
│   ├── public/index.html        # Vanilla JS frontend — shorten, auth, analytics checker
│   └── package.json
│
├── analytics-service/           # Analytics Service (analytics + consumer) — port 3001
│   ├── app.js                   # Entry point — small Express app for /analytics
│   ├── consumer.js              # Kafka consumer — clickEvent insert + clickCount write-back
│   ├── db.js                    # Prisma primary + replica clients (pg driver adapter)
│   ├── kafka.js                 # Kafka client for the consumer
│   ├── routes/
│   │   └── analytics.routes.js  # GET /analytics/:code (replica reads, fallback primary)
│   └── package.json
│
├── docs/                        # Postman collection
└── README.md
```

## Security Notes

### What's already solid

- **Passwords** — bcrypt hashing (cost factor 10); plaintext never stored or logged
- **Sessions** — signed JWTs with expiry, verified on every protected request
- **User enumeration** — login returns the same `Invalid email or password` for unknown emails and wrong passwords
- **Input validation** — Zod schemas on every endpoint; URL scheme whitelist (`http://` / `https://`) blocks `javascript:` and other dangerous schemes
- **SQL injection** — Prisma parameterizes all queries by default. The one raw query (analytics clicks-over-time) uses a `$queryRaw` tagged template literal, which is also auto-parameterized. Do not switch to `$queryRawUnsafe` with string interpolation.

### Local-only simplifications (never deploy as-is)

| Setting | Value | Why it's OK locally |
|---|---|---|
| `pg_hba.conf` host auth | `trust` (no password) | Postgres is Docker-isolated and unreachable from outside the machine |
| Postgres credentials | Sourced from `.env` (`POSTGRES_*`) | Same as above |
| Replication credentials | Sourced from `.env` (`REPLICATION_PASSWORD`) | Same as above |
| CORS | All origins allowed when `CORS_ORIGIN` is unset | No untrusted origins locally |

### Known tradeoffs

- **Rate limiter fails open** — if Redis is down, requests pass through unthrottled rather than taking the service down
- **Click events are fire-and-forget** — if Kafka is unreachable at publish time, the click event is dropped (redirect still succeeds). Failed consumer processing is logged, not retried (dead-letter queue on the roadmap)

## Roadmap

- Analytics dashboard — clicks over time, referrers, geolocation
- Custom short codes and expiry management
- Dead-letter queue for failed consumer events
- Fully standalone deployment of each service (per-service Prisma client, no shared generated client)

## License

ISC
