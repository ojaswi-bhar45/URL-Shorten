require("dotenv").config();

BigInt.prototype.toJSON = function () {
  return this.toString();
};

const express = require("express");
const urlRoutes = require("./routes/url.routes.js");
const authRoutes = require("./routes/auth.routes.js");
const { redisClient } = require("./config/redis.js");
const { producer } = require("./kafka.js");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/", authRoutes);

app.get("/kafka-test", async (req, res) => {
  try {
    await producer.send({
      topic: "link-clicked",
      messages: [{ value: JSON.stringify({ test: "hello from kafka" }) }],
    });
    res.status(200).json({ message: "Message sent to Kafka" });
  } catch (error) {
    console.error("Error sending message to Kafka:", error);
    res.status(500).json({ error: "Failed to send message to Kafka" });
  }
});

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

  try {
    await producer.connect();
    console.log("Kafka producer connected");
  } catch (err) {
    console.error("Kafka producer connection error:", err);
  }

  app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
  });
}

start();
