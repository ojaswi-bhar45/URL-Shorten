require("dotenv").config();

BigInt.prototype.toJSON = function () {
  return this.toString();
};

const path = require("path");
const express = require("express");
const urlRoutes = require("./routes/url.routes.js");
const authRoutes = require("./routes/auth.routes.js");
const analyticsRoutes = require("./routes/analytics.routes.js");
const { redisClient } = require("./redis.js");
const { connect } = require("./kafka.js");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

app.use("/", authRoutes);

app.use("/", urlRoutes);
app.use("/", analyticsRoutes);

let port = 3000;

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

async function start() {
  try {
    await redisClient.connect();
    console.log("Connected to Redis");
  } catch (err) {
    console.error("Redis connection error:", err);
  }

  connect(); // fire-and-forget; producer connects lazily on first send

  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
