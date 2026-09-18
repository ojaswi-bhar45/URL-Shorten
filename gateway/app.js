import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { legacyCreateProxyMiddleware } from "http-proxy-middleware";
import { config as loadDotenv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Single source of truth for config: the repo-root .env
loadDotenv({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.disable("x-powered-by");
app.use(helmet());

// NOTE: no body parsers here. The gateway must forward request bodies
// (POST /signup, /login, /shorten) to downstream services untouched.

const corsOptions = process.env.CORS_ORIGIN
  ? { origin: process.env.CORS_ORIGIN.split(",").map((o) => o.trim()) }
  : {};
app.use(cors(corsOptions));

const URL_SERVICE = process.env.URL_SERVICE_URL || "http://localhost:9000";
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

// Health check — proxied to URL Service
app.use(
  "/health",
  legacyCreateProxyMiddleware({
    target: URL_SERVICE,
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: 10000,
    on: { error: missingService("URL Service") },
  })
);

// Route analytics requests to Analytics Service (port 4000)
app.use(
  "/analytics",
  legacyCreateProxyMiddleware({
    target: ANALYTICS_SERVICE,
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: 10000,
    on: { error: missingService("Analytics Service") },
  })
);

// Route auth requests to URL Service (via Nginx LB :9000 → 3001/3002)
app.use(
  ["/signup", "/login", "/me"],
  legacyCreateProxyMiddleware({
    target: URL_SERVICE,
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: 10000,
    on: { error: missingService("URL Service") },
  })
);

// Route URL shortening requests to URL Service (via Nginx LB :9000 → 3001/3002)
app.use(
  ["/shorten"],
  legacyCreateProxyMiddleware({
    target: URL_SERVICE,
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: 10000,
    on: { error: missingService("URL Service") },
  })
);

// Catch-all: short codes (single-segment paths like /QjY7qMi) plus the
// frontend static assets, all served by URL Service via Nginx LB :9000. Must be
// registered AFTER the specific routes above so it doesn't swallow them.
app.use(
  "/",
  legacyCreateProxyMiddleware({
    target: URL_SERVICE,
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: 10000,
    on: { error: missingService("URL Service") },
  })
);

const PORT = process.env.GATEWAY_PORT || process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
