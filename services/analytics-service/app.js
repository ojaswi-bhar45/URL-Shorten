import path from "node:path";
import helmet from "helmet";
import { fileURLToPath } from "node:url";
import express from "express";
import { config as loadDotenv } from "dotenv";
import analyticsRoutes from "./routes/analytics.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Single source of truth for config: the repo-root .env
loadDotenv({ path: path.join(__dirname, "../../.env") });

// BigInt columns (e.g. ClickEvent.id, Url.id) cannot be JSON.stringify'd by
// default — normalize them to strings so the JSON API never 500s on them.
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json());
app.use("/", analyticsRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.ANALYTICS_PORT || 4000;
app.listen(PORT, () => console.log(`Analytics Service running on port ${PORT}`));