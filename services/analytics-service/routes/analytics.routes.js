const { Router } = require("express");
const { getAnalytics } = require("../services/analytics.service");

const router = Router();

router.get("/analytics/:code", async (req, res) => {
  const { code } = req.params;

  try {
    const data = await getAnalytics(code);

    if (!data) {
      return res.status(404).json({ error: "Short URL not found" });
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

module.exports = router;
