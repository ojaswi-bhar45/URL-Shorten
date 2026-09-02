const { createPrismaPrimary, createPrismaReplica } = require("@url-shorten/shared");
const logger = require("@url-shorten/shared/logger");

const prismaPrimary = createPrismaPrimary();
const prismaReplica = createPrismaReplica();

async function getDb() {
  try {
    await prismaReplica.$queryRaw`SELECT 1`;
    return prismaReplica;
  } catch {
    logger.warn("Replica unavailable, falling back to primary");
    return prismaPrimary;
  }
}

async function getAnalytics(code) {
  const db = await getDb();

  const url = await db.url.findUnique({ where: { shortCode: code } });
  if (!url) return null;

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

async function checkHealth() {
  await prismaReplica.$queryRaw`SELECT 1`;
}

module.exports = { getAnalytics, checkHealth };
