const { Router } = require("express");
const { shortenSchema } = require("../schemas/url.schema");
const prisma = require("../lib/prisma");
const { customAlphabet } = require("nanoid");
const { serializeBigInt } = require("../utils/serialize");
const { auth } = require("../middleware/auth.middleware");
const { redisClient } = require("../config/redis.js");
const { rateLimit } = require("../middleware/rateLimit.middleware");
const nanoid = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  7,
);

const router = Router();

router.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ message: "Database connected" });
  } catch (err) {
    console.error("Prisma error:", err);
    res.status(500).json({ error: "Database connection failed" });
  }
});

router.post("/shorten", auth, rateLimit("shorten"), async (req, res) => {
  let result = shortenSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  try {
    let existing = await prisma.url.findFirst({
      where: { longUrl: result.data.url, userId: BigInt(req.userId) },
    });

    if (existing) {
      return res.status(200).json(existing);
    }

    let url = await prisma.url.create({
      data: {
        longUrl: result.data.url,
        shortCode: nanoid(),
        userId: BigInt(req.userId), // link to the logged-in user
      },
    });

    res.status(201).json(url);
  } catch (err) {
    console.error("Prisma error:", err);
    res.status(500).json({ error: "Failed to create short URL" });
  }
});

router.get("/:code", async (req, res) => {
  let start = Date.now();
  let { code } = req.params;

  try {
    //Check First in Redis Cache
    let cachedUrl = await redisClient.get(`shortCode ${code}`);
    if (cachedUrl) {
      console.log(`Cache Hit for ${code} - ${Date.now() - start}ms`);

      prisma.url
        .update({
          where: { shortCode: code },
          data: { clickCount: { increment: 1 } },
        })
        .catch((err) => console.error("Prisma error: ", err));

      return res.redirect(cachedUrl);
    }

    console.log(`Cache Miss for ${code} - ${Date.now() - start}ms`);

    //FallBack to postgres if not found in Redis

    let url = await prisma.url.findUnique({ where: { shortCode: code } });
    if (!url) {
      return res.status(404).json({ error: "URL not found" });
    }
    if (url.expiry && new Date() > url.expiry) {
      return res.status(410).json({ error: "This link has expired" });
    }
    // Populate Redis Cache with the URL for future requests
    await redisClient.set(`shortCode ${code}`, url.longUrl, { EX: 3600 }); // Cache for 1 hour

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

router.get("/me/urls", auth, async (req, res) => {
  try {
    let urls = await prisma.url.findMany({
      where: { userId: BigInt(req.userId) },
      orderBy: { createdAt: "desc" },
    });

    res.json(urls);
  } catch (err) {
    console.error("Prisma error:", err);
    res.status(500).json({ error: "Failed to fetch user URLs" });
  }
});

module.exports = router;
