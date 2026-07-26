require("dotenv").config();
const express = require("express");
const urlRoutes = require("./routes/url.routes.js");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/", urlRoutes);

let port = 3000;

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.log("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
