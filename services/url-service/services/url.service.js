const { customAlphabet } = require("nanoid");
const { createPrismaPrimary, sendToKafka } = require("@url-shorten/shared");
const { redisClient } = require("../redis");
const logger = require("@url-shorten/shared/logger");

const prisma = createPrismaPrimary();
const nanoid = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  7
);

async function shortenUrl(longUrl, userId) {
  if (userId) {
    const existing = await prisma.url.findFirst({
      where: { longUrl, userId: BigInt(userId) },
    });
    if (existing) return existing;
  }

  return prisma.url.create({
    data: {
      longUrl,
      shortCode: nanoid(),
      userId: userId ? BigInt(userId) : null,
    },
  });
}

async function redirectCode(code, req) {
  const start = Date.now();

  const cachedUrl = await redisClient.get(`shortCode:${code}`);
  if (cachedUrl) {
    logger.debug(`Cache Hit for ${code} - ${Date.now() - start}ms`);
    publishClickEvent(req, code);
    return { found: true, expired: false, longUrl: cachedUrl };
  }

  logger.debug(`Cache Miss for ${code} - ${Date.now() - start}ms`);

  const result = await getFromDbAndCache(code);
  if (!result.found) return result;
  if (result.expired) return result;

  publishClickEvent(req, code);
  return result;
}

async function getFromDbAndCache(code) {
  const url = await prisma.url.findUnique({ where: { shortCode: code } });
  if (!url) return { found: false, expired: false };
  if (url.expiry && new Date() > url.expiry) return { found: true, expired: true };

  await redisClient.set(`shortCode:${code}`, url.longUrl, { EX: 3600 });
  return { found: true, expired: false, longUrl: url.longUrl };
}

function publishClickEvent(req, code) {
  sendToKafka("link-clicked", [
    {
      value: JSON.stringify({
        shortCode: code,
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.headers["user-agent"] || null,
        referrer: req.headers["referer"] || null,
      }),
    },
  ]);
}

async function getUserUrls(userId) {
  return prisma.url.findMany({
    where: { userId: BigInt(userId) },
    orderBy: { createdAt: "desc" },
  });
}

async function checkHealth() {
  await prisma.$queryRaw`SELECT 1`;
}

module.exports = { shortenUrl, redirectCode, getUserUrls, checkHealth };
