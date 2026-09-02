const { kafka } = require("@url-shorten/shared");
const config = require("./config");
const logger = require("@url-shorten/shared/logger");
const { processClickEvent, disconnect } = require("./services/consumer.service");

const consumer = kafka.consumer({ groupId: "analytics-consumer-group" });

async function run() {
  await consumer.connect();
  logger.info("Consumer connected");

  await consumer.subscribe({ topic: "link-clicked", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        await processClickEvent(event);
      } catch (err) {
        logger.error("Error processing message:", err);
      }
    },
  });
}

run().catch((err) => {
  logger.error("Consumer crashed:", err);
  process.exit(1);
});

async function shutdown() {
  logger.info("Shutting down consumer...");
  await consumer.disconnect();
  await disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
