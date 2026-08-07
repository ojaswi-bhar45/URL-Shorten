const { Router } = require("express");
const prisma = require("../lib/prisma");

const router = Router();

router.get("/analytics/:code", async (req, res) => {
  const { code } = req.params;

  try {
    const url = await prisma.url.findUnique({ where: { shortCode: code } });

    if (!url) {
      return res.status(404).json({ error: "Short URL not found" });
    }

    const totalClicks = url.clickCount;

    const recentClicks = await prisma.clickEvent.findMany({
      where: { shortCode: code },
      orderBy: { clickedAt: "desc" },
      take: 10,
    });

    res.status(200).json({
      shortCode: code,
      totalClicks: totalClicks.toString(),
      recentClicks,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

module.exports = router;
