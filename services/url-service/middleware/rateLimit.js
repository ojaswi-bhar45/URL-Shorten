const { redisClient } = require("../redis");
const logger = require("@url-shorten/shared/logger");

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW = 60;

function rateLimit(keyPrefix, options = {}) {
  const limit = options.limit || DEFAULT_LIMIT;
  const window = options.window || DEFAULT_WINDOW;

  return async (req, res, next) => {
    try {
      const identifier = req.userId || req.ip;
      const key = `rateLimit:${keyPrefix}:${identifier}`;

      // NOTE: req.ip is trusted here because the gateway sets X-Forwarded-For
      // (xfwd: true) and url-service runs with trust proxy: 1, so req.ip is the
      // real client address, not the gateway's. Spoofed X-Forwarded-For values
      // from clients are appended to, never trusted.

      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, window);
      }

      if (current > limit) {
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
