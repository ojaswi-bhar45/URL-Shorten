# URL Shortener & Analytics Platform

A backend system demonstrating core system design concepts: caching,
async event processing, replication, and horizontal scaling.

## Features (so far)

- Create short URLs with collision-free code generation (nanoid)
- Redirect with click tracking
- Duplicate URL detection (returns existing short code)
- Input validation (URL scheme whitelisting)

## Tech Stack

- Node.js + Express
- PostgreSQL + Prisma ORM
- Zod (validation)

## Setup

\`\`\`bash
npm install
npx prisma migrate dev
npm run dev
\`\`\`
