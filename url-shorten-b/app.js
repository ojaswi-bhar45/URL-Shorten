require("dotenv").config();

BigInt.prototype.toJSON = function () {
  return this.toString();
};

const express = require("express");
const urlRoutes = require("./routes/url.routes.js");
const authRoutes = require("./routes/auth.routes.js");
const { redisClient } = require("./config/redis.js");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/redis-test", async (req, res) => {
  await redisClient.set("test_key", "hello from redis");
  const value = await redisClient.get("test_key");
  res.json({ value });
});

app.use("/", authRoutes);
app.use("/", urlRoutes);

let port = 3000;

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.log("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  try {
    await redisClient.connect();
    console.log("Connected to Redis");
  } catch (err) {
    console.error("Redis connection error:", err);
  }

  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
  });
}

start();
