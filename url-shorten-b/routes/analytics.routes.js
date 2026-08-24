const { Router } = require("express");
const { prismaReplica } = require("../db.js");

const router = Router();

router.get("/analytics/:code", async (req, res) => {
  const { code } = req.params;

  try {
    const url = await prismaReplica.url.findUnique({ where: { shortCode: code } });

    if (!url) {
      return res.status(404).json({ error: "Short URL not found" });
    }

    const totalClicks = url.clickCount;

    //Clicks per days(last 7 days)
    const clickOverTime = await prismaReplica.$queryRaw`
      SELECT DATE("clickedAt") as date, COUNT(*)::int as clicks
      FROM click_events
      WHERE "shortCode" = ${code}
      AND "clickedAt" >= NOW() - INTERVAL '7 days'
      GROUP BY DATE("clickedAt")
      ORDER BY date ASC`;

    //Top References

    const topRefernces = await prismaReplica.clickEvent.groupBy({
      by: ["referrer"],
      where: { shortCode: code, referrer: { not: null } },
      _count: { referrer: true },
      orderBy: { _count: { referrer: "desc" } },
      take: 5,
    });

    //Recent raw click (keep from yesterday)

    const recentClicks = await prismaReplica.clickEvent.findMany({
      where: { shortCode: code },
      orderBy: { clickedAt: "desc" },
      take: 10,
    });

    res.status(200).json({
      shortCode: code,
      totalClicks: totalClicks.toString(),
      clickOverTime,
      topRefernces: topRefernces.map((r) => ({
        referrer: r.referrer,
        count: r._count.referrer,
      })),
      recentClicks,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

module.exports = router;
