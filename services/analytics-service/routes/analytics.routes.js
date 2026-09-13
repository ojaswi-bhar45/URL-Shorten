import { Router } from "express";
import { getAnalytics, checkHealth } from "../services/analytics.service.js";

const router = Router();

router.get("/health", async (req, res) => {
  try {
    const data = await checkHealth();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Database connection failed" });
  }
});

router.get("/analytics/:code", async (req, res) => {
  const { code } = req.params;

  try {
    const data = await getAnalytics(code);

    if (!data) {
      return res.status(404).json({ error: "Short URL not found" });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

export default router;
