require("dotenv").config();
const express = require("express");
const prisma = require("./prismaclient");
const { shortenSchema } = require("./urlSchema");
const { customAlphabet } = require("nanoid");

const app = express();

let port = 3000;

function serializeBigInt(obj) {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const nanoid = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  7,
);

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ message: "Database connected" });
  } catch (err) {
    console.error("Prisma error:", err);
    res.status(500).json({ error: "Database connection failed" });
  }
});

app.post("/shorten", async (req, res) => {
  let result = shortenSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  try {
    let existing = await prisma.url.findFirst({
      where: { longUrl: result.data.url },
    });

    if (existing) {
      return res.status(200).json(serializeBigInt(existing));
    }
    
    let url = await prisma.url.create({
      data: { longUrl: result.data.url, shortCode: nanoid() },
    });
    res.status(201).json(serializeBigInt(url));
  } catch (err) {
    console.error("Prisma error:", err);
    res.status(500).json({ error: "Failed to create short URL" });
  }
});

app.get("/:code", async (req, res) => {
  let { code } = req.params;

  try {
    let url = await prisma.url.findUnique({ where: { shortCode: code } });
    if (!url) {
      return res.status(404).json({ error: "URL not found" });
    }
    if (url.expiry && new Date() > url.expiry) {
      return res.status(410).json({ error: "This link has expired" });
    }

    await prisma.url.update({
      where: { shortCode: code },
      data: { clickCount: { increment: 1 } },
    });

    return res.redirect(url.longUrl);
  } catch (err) {
    console.error("Redirect error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
