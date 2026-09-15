import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { Pool } from "pg";
import { PrismaClient } from "../../../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Single source of truth for config: the repo-root .env
loadDotenv({ path: path.join(__dirname, "../../.env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// Strip control characters (other than normal whitespace) and cap length so
// attacker-controlled headers (User-Agent, Referer, IP) cannot carry control
// chars into stored analytics data nor bloat the database unboundedly.
function sanitize(value, max) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  if (cleaned === "") return null;
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

export async function processClickEvent(event) {
  if (!event.shortCode) {
    console.warn("Skipping malformed event (missing shortCode)");
    return;
  }

  const urlExists = await prisma.url.findUnique({
    where: { shortCode: event.shortCode },
    select: { id: true },
  });

  if (!urlExists) {
    console.warn(`Skipping event for unknown shortCode: ${event.shortCode}`);
    return;
  }

  await prisma.$transaction([
    prisma.clickEvent.create({
      data: {
        shortCode: event.shortCode,
        ip: sanitize(event.ip, 45),
        userAgent: sanitize(event.userAgent, 256),
        referrer: sanitize(event.referrer, 512),
        clickedAt: new Date(event.timestamp),
      },
    }),
    prisma.url.update({
      where: { shortCode: event.shortCode },
      data: { clickCount: { increment: 1 } },
    }),
  ]);

  console.log(`Processed click for ${event.shortCode}`);
}

export async function disconnect() {
  await prisma.$disconnect();
}
