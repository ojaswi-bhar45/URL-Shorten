require("dotenv").config();
const express = require("express");
const prisma = require("./prismaclient");
const { shortenSchema } = require("./urlSchema");

const app = express();

let port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ messsage: "DataBase connected" });
  } catch (err) {
    res.json(err);
  }
});

app.post("/shorten", async (req, res) => {
  const result = shortenSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  try {
    const url = await prisma.url.create({
      data: { longUrl: result.data.url },
    });
    res.status(201).json(url);
  } catch (err) {
    res.status(500).json({ error: "Failed to create short URL" });
  }
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
