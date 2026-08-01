const { redisClient } = require("../config/redis.js");

let LIMIT = 5; // max requests per window
let WINDOW = 60; //seconds

function rateLimit(keyPrefix) {
  return async (req, res, next) => {
    try {
      let identifier = req.userId || req.ip; // Use user ID if available, otherwise use IP address
      let key = `rateLimit: ${keyPrefix}: ${identifier}`;

      let current = await redisClient.incr(key);

      if (current === 1) {
        await redisClient.expire(key, WINDOW);
      }

      if (current > LIMIT) {
        let ttl = await redisClient.ttl(key);
        return res
          .status(429)
          .json({ error: `Rate limit exceeded. Try again in ${ttl} seconds.` });
      }
      next();
    } catch (err) {
      console.log("Rate limit error: ", err);
      next();
    }
  };
}

module.exports = { rateLimit };
