import { Router } from "express";
import { auth } from "../middleware/auth.js";
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

router.get("/analytics/:code", auth, async (req, res) => {
  const { code } = req.params;

  try {
    const data = await getAnalytics(code, req.userId);

    if (!data) {
      return res.status(404).json({ error: "Short URL not found" });
    }

    res.status(200).json(data);
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

export default router;