const { Router } = require("express");
const { shortenSchema } = require("../schemas/url.schema");
const prisma = require("../lib/prisma");
const { customAlphabet } = require("nanoid");
const { serializeBigInt } = require("../utils/serialize");
const { auth } = require("../middleware/auth.middleware");
const { redisClient } = require("../config/redis.js");
const { rateLimit } = require("../middleware/rateLimit.middleware");
const { producer } = require("../kafka.js");
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
    let cachedUrl = await redisClient.get(`shortCode:${code}`);
    if (cachedUrl) {
      console.log(`Cache Hit for ${code} - ${Date.now() - start}ms`);
      publishClickEvent(req, code);
      return res.redirect(cachedUrl);
    }

    console.log(`Cache Miss for ${code} - ${Date.now() - start}ms`);

    //FallBack to postgres if not found in Redis
    let result = await getFromDbAndCache(code);

    if (!result.found) {
      return res.status(404).json({ error: "Short URL not found" });
    }
    if (result.expired) {
      return res.status(410).json({ error: "This link has expired" });
    }

    publishClickEvent(req, code);

    return res.redirect(result.longUrl);
  } catch (err) {
    console.error("Redirect error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

async function getFromDbAndCache(code) {
  const url = await prisma.url.findUnique({ where: { shortCode: code } });

  if (!url) return { found: false, expired: false };
  if (url.expiry && new Date() > url.expiry) return { found: true, expired: true };

  await redisClient.set(`shortCode:${code}`, url.longUrl, { EX: 3600 }); // Cache for 1 hour
  return { found: true, expired: false, longUrl: url.longUrl };
}

function publishClickEvent(req, code) {
  producer
    .send({
      topic: "link-clicked",
      messages: [
        {
          value: JSON.stringify({
            shortCode: code,
            timestamp: new Date().toISOString(),
            ip: req.ip,
            userAgent: req.headers["user-agent"] || null,
            referrer: req.headers["referer"] || null,
          }),
        },
      ],
    })
    .catch((err) => console.error("Kafka publish error:", err));
}

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
