import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProxyMiddleware } from "http-proxy-middleware";
import { config as loadDotenv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(__dirname, ".env") });

const app = express();

app.use(express.json());

const corsOptions = process.env.CORS_ORIGIN
  ? { origin: process.env.CORS_ORIGIN.split(",").map((o) => o.trim()) }
  : {};
app.use(cors(corsOptions));

const URL_SERVICE = process.env.URL_SERVICE_URL || "http://localhost:3001";
const ANALYTICS_SERVICE = process.env.ANALYTICS_SERVICE_URL || "http://localhost:4000";

function missingService(name) {
  return (err, req, res) => {
    console.error(`${name} proxy error:`, err.message);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(503).json({ error: `${name} is currently unavailable` });
  };
}

// Route analytics requests to Analytics Service (port 4000)
app.use(
  "/analytics",
  createProxyMiddleware({
    target: ANALYTICS_SERVICE,
    changeOrigin: true,
    on: { error: missingService("Analytics Service") },
  })
);

// Route auth requests to URL Service (port 3001)
app.use(
  ["/signup", "/login", "/me"],
  createProxyMiddleware({
    target: URL_SERVICE,
    changeOrigin: true,
    on: { error: missingService("URL Service") },
  })
);

// Route URL shortening requests to URL Service (port 3001)
app.use(
  ["/shorten"],
  createProxyMiddleware({
    target: URL_SERVICE,
    changeOrigin: true,
    on: { error: missingService("URL Service") },
  })
);

// Catch-all: short codes (single-segment paths like /QjY7qMi) plus the
// frontend static assets, all served by URL Service. Must be registered
// AFTER the specific routes above so it doesn't swallow them.
app.use(
  "/",
  createProxyMiddleware({
    target: URL_SERVICE,
    changeOrigin: true,
    on: { error: missingService("URL Service") },
  })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
