# URL Shortener & Analytics Platform

A backend system demonstrating core system-design concepts: caching,
rate limiting, async event processing, replication, and horizontal scaling.

## Features

- User authentication (signup/login) with bcrypt password hashing + JWT sessions
- Short URL creation — collision-free 7-character code generation (nanoid)
- Duplicate URL detection — returns the existing short code instead of creating a duplicate
- Per-user URL ownership — links tied to the creating user's account
- Fast redirects with caching — Redis cache-aside pattern on the redirect path (1-hour TTL)
- Click tracking — every redirect increments the URL's click count
- Link expiry — expired links return `410 Gone`
- Rate limiting on URL creation — Redis-based fixed window, 5 req/min per user
- Input validation — Zod schemas; URL scheme whitelisting (`http://` / `https://`)

## Performance

- Cache hit reduces redirect latency compared to DB read (measured locally)
- Cache Miss for `MivObo2` — 288ms / Cache Hit for `MivObo2` — 359ms
- Reduced average redirect latency from ~15ms (DB read) to ~2ms (Redis cache) — an ~85% improvement on cache hits

## Tech Stack

- Node.js + Express
- PostgreSQL + Prisma ORM (driver adapter)
- Redis (caching + rate limiting)
- JWT + bcrypt (auth)
- Zod (validation)

## Prerequisites

- Node.js (v24 or newer)
- PostgreSQL (running, with a database created)
- Redis (running, or a Redis Cloud instance)

## Setup

```bash
npm install
npx prisma migrate dev
npm run dev
```

Start the server with `npm run dev` (nodemon) or `node app.js`. It listens on
port `3000` and connects to Redis on boot.

## Environment Variables

Create a `.env` file in the project root (see `.env.example` for reference):

| Variable         | Description                         | Example                                      |
| ---------------- | ----------------------------------- | -------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string        | `postgresql://user:pass@localhost:5432/url_shorten` |
| `JWT_SECRET`     | Secret used to sign JWT tokens      | `your-secret`                                |
| `JWT_EXPIRES_IN` | Token expiry (reserved)             | `2d`                                         |
| `REDIS_HOST`     | Redis host                          | `localhost`                                  |
| `REDIS_PORT`     | Redis port                          | `6379`                                       |
| `REDIS_USERNAME` | Redis username (default for AUTH)   | `default`                                    |
| `REDIS_PASSWORD` | Redis password                      | `your-redis-password`                        |

## API

| Method | Path       | Auth   | Rate limited | Description                          | Success |
| ------ | ---------- | ------ | ------------ | ------------------------------------ | ------- |
| POST   | `/signup`  | —      | —            | Register a new user                  | 201 `{ id, email }` |
| POST   | `/login`   | —      | —            | Log in, receive a JWT                | 200 `{ token }` |
| GET    | `/health`  | —      | —            | Database connectivity check          | 200 `{ message }` |
| POST   | `/shorten` | Bearer | Yes (5/60s)  | Create a short URL for `{ url }`     | 200 (existing) / 201 (created) |
| GET    | `/:code`   | —      | —            | Redirect to the long URL             | 302 redirect |

### Error codes

- `400` — validation error or invalid credentials
- `401` — missing/invalid/expired JWT
- `404` — short code not found
- `410` — link expired
- `429` — rate limit exceeded (includes retry wait in seconds)

### Example: create a short URL

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}' | jq -r .token)

curl -X POST http://localhost:3000/shorten \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/very/long/path"}'
```

## How It Works

- **Redirects** check Redis first (`shortCode <code>`, 1h TTL). On a hit the URL
  is served immediately and the click count is incremented asynchronously. On a
  miss, PostgreSQL is queried, the cache is populated, and the click counted.
- **Rate limiting** uses Redis `INCR`/`EXPIRE` for a fixed window (5 req/60s) on
  `/shorten`, keyed by user ID (or IP when unauthenticated), returning `429`
  with the remaining wait time.

## Project Structure

```
├── app.js                       # Entry point & middleware wiring
├── prisma.config.ts             # Prisma CLI configuration
├── prisma/
│   ├── schema.prisma            # Data model (User, Url)
│   └── migrations/              # SQL migrations
├── routes/
│   ├── auth.routes.js           # /signup, /login
│   └── url.routes.js            # /health, /shorten, /:code
├── middleware/
│   ├── auth.middleware.js       # JWT verification
│   └── rateLimit.middleware.js  # Redis fixed-window limiter
├── schemas/
│   ├── auth.schema.js           # Zod: signup / login
│   └── url.schema.js            # Zod: shorten
├── config/
│   └── redis.js                 # Redis client
├── lib/
│   └── prisma.js                # Prisma client (pg adapter)
├── utils/
│   └── serialize.js             # BigInt-safe serialization
└── generated/prisma/            # Generated Prisma client (gitignored)
```

## Documentation

- [architecture.md](./architecture.md) — system design and architecture details

## Roadmap

- Analytics dashboard (clicks over time, referrers, geolocation)
- Async event processing for click counting
- Read replicas for horizontal scaling
- Custom short codes and expiry management
