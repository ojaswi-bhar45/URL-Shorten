const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const config = require("./config");
const logger = require("@url-shorten/shared/logger");
const { connect } = require("@url-shorten/shared");
const { redisClient } = require("./redis");
const authRoutes = require("./routes/auth.routes");
const urlRoutes = require("./routes/url.routes");
const healthRoutes = require("./routes/health.routes");

BigInt.prototype.toJSON = function () {
  return this.toString();
};

const app = express();

const corsOptions = config.corsOrigin
  ? { origin: config.corsOrigin.split(",").map((o) => o.trim()) }
  : {};

app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/", authRoutes);
app.use("/", urlRoutes);
app.use("/", healthRoutes);

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

async function start() {
  try {
    await redisClient.connect();
    logger.info("Connected to Redis");
  } catch (err) {
    logger.error("Redis connection error:", err);
  }

  connect();

  app.listen(config.port, () => {
    logger.info(`Server is listening on port ${config.port}`);
  });
}

start().catch((err) => {
  logger.error("Server failed to start:", err);
  process.exit(1);
});
