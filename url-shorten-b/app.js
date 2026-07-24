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
    res.json({ messsage: "DataBase connected" });
  } catch (err) {
    console.error("Prisma error:", err);
    res.json(err);
  }
});

app.post("/shorten", async (req, res) => {
  let result = shortenSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  try {
    let url = await prisma.url.create({
      data: { longUrl: result.data.url, shortCode: nanoid() },
    });
    res.status(201).json(serializeBigInt(url));
  } catch (err) {
    console.error("Prisma error:", err); // add this
    res.status(500).json({ error: "Failed to create short URL" });
  }
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
