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

app.disable("x-powered-by");
// Two trusted proxies sit in front of url-service: the gateway (sets X-Forwarded-For
// via xfwd: true) and nginx (appends gateway's IP via proxy_add_x_forwarded_for).
// Tuning trust proxy to 2 keeps req.ip resolving to the real client, so rate-limit
// buckets and recorded click IPs stay per-client. Clients can only ever reach this
// service through those two hops, so trusting 2 proxies is safe from spoofing.
app.set("trust proxy", 2);

const corsOptions = config.corsOrigin
  ? { origin: config.corsOrigin.split(",").map((o) => o.trim()) }
  : {};

app.use(helmet());
app.use(cors(corsOptions));
// Each request line is prefixed with the listening port of the instance that
// handled it. Both instances run this identical line but resolve config.port
// from their own environment (3001 from .env, 3002 from the cross-env
// override), so the log is self-identifying without any wrapper having to
// label the stream. This is what makes nginx load balancing observable.
app.use(morgan(`[${config.port}] :method :url :status :res[content-length] :response-time ms`));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/", authRoutes);
app.use("/", healthRoutes);
app.use("/", urlRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status >= 500 ? "Internal server error" : err.message || "Bad request",
  });
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
