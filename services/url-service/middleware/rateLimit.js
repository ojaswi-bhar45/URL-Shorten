const { redisClient } = require("../redis");
const logger = require("@url-shorten/shared/logger");

const LIMIT = 5;
const WINDOW = 60;

function rateLimit(keyPrefix) {
  return async (req, res, next) => {
    try {
      const identifier = req.userId || req.ip;
      const key = `rateLimit:${keyPrefix}:${identifier}`;

      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, WINDOW);
      }

      if (current > LIMIT) {
        const ttl = await redisClient.ttl(key);
        return res.status(429).json({
          error: `Rate limit exceeded. Try again in ${ttl} seconds.`,
        });
      }
      next();
    } catch (err) {
      logger.error("Rate limit error:", err);
      next();
    }
  };
}

module.exports = { rateLimit };
