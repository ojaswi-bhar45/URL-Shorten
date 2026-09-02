require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  redis: {
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
  },
  kafkaBroker: process.env.KAFKA_BROKER || "localhost:9092",
  corsOrigin: process.env.CORS_ORIGIN || null,
  logLevel: process.env.LOG_LEVEL || "info",
};

const required = ["databaseUrl", "jwtSecret"];
for (const key of required) {
  if (!config[key]) {
    throw new Error(`Missing required environment variable: ${key.toUpperCase()}`);
  }
}

module.exports = config;
