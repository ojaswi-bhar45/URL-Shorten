const { createClient } = require("redis");
const config = require("./config");
const logger = require("@url-shorten/shared/logger");

const redisClient = createClient({
  username: config.redis.username,
  password: config.redis.password,
  socket: {
    host: config.redis.host,
    port: config.redis.port,
  },
});

redisClient.on("error", (err) => {
  logger.error("Redis Client Error", err);
});

module.exports = { redisClient };
