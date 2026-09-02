const express = require("express");
const config = require("./config");
const logger = require("@url-shorten/shared/logger");
const analyticsRoutes = require("./routes/analytics.routes");

BigInt.prototype.toJSON = function () {
  return this.toString();
};

const app = express();

app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    const { checkHealth } = require("./services/analytics.service");
    await checkHealth();
    res.json({ message: "Analytics service healthy" });
  } catch (err) {
    logger.error("Replica health check error:", err);
    res.status(500).json({ error: "Analytics database connection failed" });
  }
});

app.use("/", analyticsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  logger.info(`Analytics service is listening on port ${config.port}`);
});
