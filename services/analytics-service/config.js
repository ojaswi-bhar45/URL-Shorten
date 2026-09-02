require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const config = {
  port: parseInt(process.env.PORT, 10) || 3001,
  databaseUrl: process.env.DATABASE_URL,
  databaseReplicaUrl: process.env.DATABASE_REPLICA_URL,
  kafkaBroker: process.env.KAFKA_BROKER || "localhost:9092",
  logLevel: process.env.LOG_LEVEL || "info",
};

const required = ["databaseUrl", "databaseReplicaUrl"];
for (const key of required) {
  if (!config[key]) {
    throw new Error(`Missing required environment variable: ${key.toUpperCase()}`);
  }
}

module.exports = config;
