import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import analyticsRoutes from "./routes/analytics.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(__dirname, ".env") });

const app = express();
app.use(express.json());
app.use("/", analyticsRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Analytics Service running on port ${PORT}`));
