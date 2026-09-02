const { Router } = require("express");
const { checkHealth } = require("../services/url.service");

const router = Router();

router.get("/health", async (req, res) => {
  try {
    await checkHealth();
    res.json({ message: "Database connected" });
  } catch (err) {
    res.status(500).json({ error: "Database connection failed" });
  }
});

module.exports = router;
