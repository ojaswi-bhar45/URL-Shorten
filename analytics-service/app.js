require("dotenv").config();

BigInt.prototype.toJSON = function () {
  return this.toString();
};

const express = require("express");
const analyticsRoutes = require("./routes/analytics.routes.js");
const { prismaReplica } = require("./db.js");

const app = express();

app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await prismaReplica.$queryRaw`SELECT 1`;
    res.json({ message: "Analytics service healthy" });
  } catch (err) {
    console.error("Replica health check error:", err);
    res.status(500).json({ error: "Analytics database connection failed" });
  }
});

app.use("/", analyticsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`Analytics service is listening on port ${port}`);
});
