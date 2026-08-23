# URL Shortener & Analytics Platform

A backend system demonstrating core system-design concepts: caching, rate limiting, async event processing, and horizontal scaling readiness.

## Features

- **User authentication** — signup/login with bcrypt password hashing + JWT sessions
- **Short URL creation** — collision-free 7-character code generation via nanoid
- **Duplicate URL detection** — returns the existing short code instead of creating a duplicate (per user)
- **Per-user URL ownership** — links tied to the creating user's account; anonymous shortening also supported
- **Fast redirects** — Redis cache-aside pattern on the redirect path (1-hour TTL)
- **Click tracking** — every redirect publishes a fire-and-forget event to Kafka (`link-clicked` topic); a standalone consumer writes the analytics record and updates `clickCount` asynchronously
- **Link expiry** — expired links return `410 Gone`
- **Rate limiting** — Redis-based fixed window (5 req/min per user/IP) on `POST /shorten`
- **Input validation** — Zod schemas with URL scheme whitelisting (`http://` / `https://`)
- **Analytics endpoint** — total clicks, clicks-per-day (last 7 days), top referrers, recent clicks

## Performance

> **[TODO: replace with real benchmark numbers]**
>
> - Cache miss (DB read): [TODO] ms average
> - Cache hit (Redis): [TODO] ms average
> - Measured with [tool/methodology TBD]

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

## Architecture

```
                    Client / Browser
                         │ HTTP
                         ▼
                 Express Server (app.js)
                   │           │
          ┌────────▼──┐   ┌───▼──────────┐
          │ Auth (JWT) │   │ Rate Limiter  │
          │ Middleware  │   │ (Redis INCR)  │
          └────────┬──┘   └───┬──────────┘
                   │           │
                   ▼           ▼
              Route Handlers
              │           │
    ┌─────────▼──┐   ┌────▼────────────┐
    │ Prisma     │   │   Redis          │
    │ PostgreSQL │   │  (cache + rates) │
    └────────────┘   └──────────────────┘
              │
              │ publish click event
              ▼
    Kafka / Redpanda (link-clicked)
              │
              ▼
    Click-event Consumer (consumer.js)
              │
              ▼
    Postgres (click_events + clickCount)
```

Redirects are served from Redis (with Postgres as the fallback source of truth); every click is published to Kafka and written to analytics by the consumer asynchronously. The redirect path **never writes to Postgres**, keeping it fast and decoupled from analytics writes.

See [architecture.md](./architecture.md) for the full system design document with Mermaid diagrams.

## Data Model

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
- A separate consumer service (`consumer.js`) processes events asynchronously, decoupling the read-heavy redirect path from write-heavy analytics
- Consumer uses a consumer group (`analytics-consumer-group`) to support future horizontal scaling
- Tested resilience: killing the consumer mid-traffic does not lose data — Kafka retains messages until the consumer resumes and catches up

## Prerequisites

- **Node.js** v24 or newer
- **PostgreSQL** running, with a database created
- **Redis** running (local or Redis Cloud)
- **Kafka/Redpanda** — optional but recommended; the service fails open, so redirects work even if the broker is down

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start Redpanda (Kafka-compatible) — optional

```bash
docker compose up -d
```

This starts a single-node Redpanda broker on `localhost:9092`. If you already have a Kafka cluster, skip this step and set `KAFKA_BROKER` in your `.env`.

### 3. Set up the database

```bash
npx prisma migrate dev
```

### 4. Configure environment variables

Copy the example and fill in your values:

```bash
cp .env.example .env
```

See the [Environment Variables](#environment-variables) section below for all options.

### 5. Start the server

```bash
node app.js
```

The server listens on port `3000` (configurable via `PORT`) and connects to Redis on boot.

> **Development tip:** For auto-reload on file changes, install [nodemon](https://nodemon.io/) globally and run:
>
> ```bash
> npx nodemon app.js
> ```

### 6. Start the click-event consumer (separate terminal)

```bash
node consumer.js
```

The consumer connects to Kafka, subscribes to the `link-clicked` topic, and writes analytics rows to Postgres. It can be started/stopped independently of the API server — Kafka retains events until the consumer catches up.

## Environment Variables

Create a `.env` file in the project root (see `.env.example` for reference):

| Variable | Required | Description | Default / Example |
|---|---|---|---|
| `PORT` | No | Server listen port | `3000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/url_shorten` |
| `POSTGRES_USER` | Compose | Postgres superuser for the docker-compose containers | `admin` |
| `POSTGRES_PASSWORD` | Compose | Postgres superuser password (**required** by `docker compose up`) | Strong secret |
| `POSTGRES_DB` | No (Compose) | Database created on first boot | `urlshortener` |
| `REPLICATION_PASSWORD` | Compose | Password for the `replicator` role (primary init + replica bootstrap; **required** by `docker compose up`) | Strong secret |
| `JWT_SECRET` | Yes | Secret used to sign JWT tokens | Replace with a strong random string |
| `JWT_EXPIRES_IN` | No | Token expiry duration | `1h` |
| `REDIS_HOST` | Yes | Redis host | `localhost` |
| `REDIS_PORT` | Yes | Redis port | `6379` |
| `REDIS_USERNAME` | Yes | Redis username | `default` |
| `REDIS_PASSWORD` | Yes | Redis password | Your Redis password |
| `KAFKA_BROKER` | No | Comma-separated Kafka broker addresses | `localhost:9092` |
| `CORS_ORIGIN` | No | Comma-separated allowed origins; unset allows all (dev only) | `http://localhost:3000` |

## API Reference

### Endpoints

| Method | Path | Auth | Rate Limited | Description | Response |
|---|---|---|---|---|---|
| `POST` | `/signup` | — | — | Register a new user | `201 { id, email }` |
| `POST` | `/login` | — | — | Log in, receive a JWT | `200 { token }` |
| `GET` | `/health` | — | — | Database connectivity check | `200 { message }` |
| `POST` | `/shorten` | Optional Bearer | Yes (5/60s) | Create a short URL for `{ url }` | `201 { ...url }` or `200` (duplicate) |
| `GET` | `/:code` | — | — | Redirect to the long URL | `302` redirect |
| `GET` | `/me/urls` | Required Bearer | — | List authenticated user's URLs | `200 [{ ...url }, ...]` |
| `GET` | `/analytics/:code` | — | — | Click analytics for a short code | `200 { shortCode, totalClicks, clickOverTime, topRefernces, recentClicks }` |

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
# Login and capture the token
TOKEN=$(curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}' | jq -r .token)

# Create a short URL
curl -X POST http://localhost:3000/shorten \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/very/long/path"}'
```

### Example: Check Analytics

```bash
curl http://localhost:3000/analytics/QjY7qMi
```

Response:

```json
{
  "shortCode": "QjY7qMi",
  "totalClicks": "42",
  "clickOverTime": [
    { "date": "2026-08-18", "clicks": 12 },
    { "date": "2026-08-19", "clicks": 30 }
  ],
  "topRefernces": [
    { "referrer": "https://twitter.com", "count": 15 }
  ],
  "recentClicks": [
    { "shortCode": "QjY7qMi", "ip": "127.0.0.1", "userAgent": "...", "referrer": "...", "clickedAt": "2026-08-19T10:00:00.000Z" }
  ]
}
```

## How It Works

### Redirect Flow

1. Look up `shortCode:<code>` in Redis.
2. **Cache hit** — publish a click event to Kafka (fire-and-forget) and `302` redirect immediately.
3. **Cache miss** — query PostgreSQL. If expired, return `410`. If not found, return `404`. Otherwise, populate Redis (1h TTL), publish the click event, and redirect.

The redirect path **never writes to Postgres** — it is read-only at the DB level. Every click is published to the `link-clicked` topic and consumed asynchronously.

### Consumer Flow

The standalone consumer (`consumer.js`) subscribes to the `link-clicked` topic and for each message:

1. Validates the `shortCode` exists in the database.
2. In a `$transaction`: inserts a `clickEvent` row and increments `clickCount` on the matching URL.

### Rate Limiting

- **Mechanism:** Redis `INCR` + `EXPIRE` (fixed window).
- **Limit:** 5 requests per 60-second window.
- **Scope:** `POST /shorten` only, keyed by `userId` (authenticated) or `IP` (anonymous).
- **Fail-open:** if Redis is down, requests pass through to avoid taking down the service.

## Project Structure

```
url-shorten-b/
├── app.js                       # Entry point — Express setup, middleware wiring, Redis/Kafka connect, listen
├── db.js                        # Prisma client (pg driver adapter)
├── redis.js                     # Redis client from environment variables
├── kafka.js                     # Kafka producer — connect, send, reconnect logic
├── consumer.js                  # Standalone consumer: clickEvent insert + clickCount write-back
├── package.json                 # Dependencies (express, prisma, kafkajs, redis, zod, etc.)
├── prisma.config.ts             # Prisma CLI configuration
├── docker-compose.yml           # Redpanda (Kafka-compatible) single-node setup
├── .env.example                 # Environment variable template
├── prisma/
│   ├── schema.prisma            # Data model: User, Url, ClickEvent
│   └── migrations/              # SQL migration history
├── routes/
│   ├── auth.routes.js           # POST /signup, POST /login
│   ├── url.routes.js            # GET /health, POST /shorten, GET /:code, GET /me/urls
│   └── analytics.routes.js      # GET /analytics/:code
├── middleware/
│   ├── auth.middleware.js       # JWT verification (auth + optionalAuth)
│   └── rateLimit.middleware.js  # Redis fixed-window rate limiter
├── schemas/
│   ├── auth.schema.js           # Zod: signup / login validation
│   └── url.schema.js            # Zod: shorten URL validation
├── public/
│   └── index.html               # Vanilla JS frontend — shorten, auth, analytics checker
└── generated/prisma/            # Generated Prisma client (gitignored)
```

## Security Notes

### What's already solid

- **Passwords** — bcrypt hashing (cost factor 10); plaintext never stored or logged
- **Sessions** — signed JWTs with expiry, verified on every protected request
- **User enumeration** — login returns the same `Invalid email or password` for unknown emails and wrong passwords
- **Input validation** — Zod schemas on every endpoint; URL scheme whitelist (`http://` / `https://`) blocks `javascript:` and other dangerous schemes
- **SQL injection** — Prisma parameterizes all queries by default. The one raw query (analytics clicks-over-time) uses a `$queryRaw` tagged template literal, which is also auto-parameterized. Do not switch to `$queryRawUnsafe` with string interpolation.
- **Error responses** — handlers return generic messages (`500`, `404`); stack traces and `err.message` stay in server logs only

### Local-only simplifications (never deploy as-is)

| Setting | Value | Why it's OK locally |
|---|---|---|
| `pg_hba.conf` host auth | `trust` (no password) | Postgres is Docker-isolated and unreachable from outside the machine |
| Postgres credentials | Sourced from `.env` (`POSTGRES_*`) — placeholder-strength values are fine here | Same as above |
| Replication credentials | Sourced from `.env` (`REPLICATION_PASSWORD`) — not committed to git | Same as above |
| CORS | All origins allowed when `CORS_ORIGIN` is unset | No untrusted origins locally |

> **Note on git history:** earlier commits contained hardcoded placeholder credentials (`admin123`, `replpass123`). They are only valid for a throwaway local stack, but if this repository is ever made public, treat those values as burned and rotate everything — and remember they remain recoverable from history regardless of later edits.

### Known tradeoffs

- **Rate limiter fails open** — if Redis is down, requests pass through unthrottled rather than taking the service down. Deliberate availability-over-strictness choice.
- **Click events are fire-and-forget** — if Kafka is unreachable at publish time, the click event is dropped (redirect still succeeds). Failed consumer processing is logged, not retried (dead-letter queue is on the roadmap).

### Pre-deployment checklist

- [ ] Replace all DB/Redis/Kafka credentials with strong secrets from a secrets manager (not `.env` in the image)
- [ ] Switch `pg_hba.conf` from `trust` to `scram-sha-256` with per-service users and least privilege
- [ ] Set `CORS_ORIGIN` to your real frontend origin(s)
- [ ] Never expose ports 5432 (Postgres), 6379 (Redis), or 9092 (Kafka) publicly — bind them to an internal network
- [ ] Use TLS for database/cache/broker connections
- [ ] Keep `.env` out of version control (already gitignored) and out of images
- [ ] Set a strong `JWT_SECRET` (long random string) and consider short-lived access tokens + refresh flow

## Documentation

- [architecture.md](./architecture.md) — full system design document with Mermaid diagrams, component responsibilities, and data model ER diagrams

## Roadmap

- Analytics dashboard — clicks over time, referrers, geolocation
- Read replicas for horizontal scaling
- Custom short codes and expiry management
- Dead-letter queue for failed consumer events
- Docker Compose orchestration for the full stack (API + consumer + Postgres + Redis + Redpanda)

## License

ISC
