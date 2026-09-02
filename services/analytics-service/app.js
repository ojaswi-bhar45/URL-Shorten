import express from "express";
import "dotenv/config";
import analyticsRoutes from "./routes/analytics.routes.js";

const app = express();
app.use(express.json());
app.use("/", analyticsRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Analytics Service running on port ${PORT}`));
