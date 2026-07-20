require("dotenv").config();
const express = require("express");
const prisma = require("./prismaclient");

const app = express();

let port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ messsage: "DataBase connected" });
  } catch (err) {
    res.json(err);
  }
});
