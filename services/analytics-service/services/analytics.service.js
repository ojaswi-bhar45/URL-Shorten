import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { Pool } from "pg";
import { PrismaClient } from "../../../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Single source of truth for config: the repo-root .env
loadDotenv({ path: path.join(__dirname, "../../.env") });

const poolPrimary = new Pool({ connectionString: process.env.DATABASE_URL });
const prismaPrimary = new PrismaClient({ adapter: new PrismaPg(poolPrimary) });

const poolReplica = new Pool({ connectionString: process.env.DATABASE_REPLICA_URL });
const prismaReplica = new PrismaClient({ adapter: new PrismaPg(poolReplica) });

async function getDb() {
  try {
    await prismaReplica.$queryRaw`SELECT 1`;
    return prismaReplica;
  } catch {
    console.warn("Replica unavailable, falling back to primary");
    return prismaPrimary;
  }
}

export async function checkHealth() {
  try {
    await prismaReplica.$queryRaw`SELECT 1`;
    return { message: "Database connected", source: "replica" };
  } catch {
    await prismaPrimary.$queryRaw`SELECT 1`;
    return { message: "Database connected (fallback to primary)", source: "primary" };
  }
}

export async function getAnalytics(code, userId) {
  const db = await getDb();

  const url = await db.url.findUnique({ where: { shortCode: code } });
  if (!url) return null;

  // Object-level access control: analytics for an owned link are only visible
  // to the owning user. Anonymous links stay viewable to any authenticated user
  // (they have no owner).
  if (url.userId && url.userId.toString() !== String(userId)) {
    const err = new Error("You do not have access to this short URL");
    err.statusCode = 403;
    throw err;
  }

  const totalClicks = url.clickCount;

  const clickOverTime = await db.$queryRaw`
    SELECT DATE("clickedAt") as date, COUNT(*)::int as clicks
    FROM click_events
    WHERE "shortCode" = ${code}
    AND "clickedAt" >= NOW() - INTERVAL '7 days'
    GROUP BY DATE("clickedAt")
    ORDER BY date ASC`;

  const topReferrers = await db.clickEvent.groupBy({
    by: ["referrer"],
    where: { shortCode: code, referrer: { not: null } },
    _count: { referrer: true },
    orderBy: { _count: { referrer: "desc" } },
    take: 5,
  });

  const recentClicks = await db.clickEvent.findMany({
    where: { shortCode: code },
    orderBy: { clickedAt: "desc" },
    take: 10,
  });

  return {
    shortCode: code,
    totalClicks: totalClicks.toString(),
    clickOverTime,
    topReferrers: topReferrers.map((r) => ({
      referrer: r.referrer,
      count: r._count.referrer,
    })),
    recentClicks,
  };
}