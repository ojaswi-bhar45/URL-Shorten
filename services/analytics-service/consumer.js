import { Kafka, Partitioners } from "kafkajs";
import { processClickEvent, disconnect } from "./services/consumer.service.js";

const brokers = (process.env.KAFKA_BROKER || "localhost:9092").split(",");
const kafka = new Kafka({ clientId: "analytics-consumer", brokers });
const consumer = kafka.consumer({ groupId: "analytics-consumer-group" });

async function run() {
  await consumer.connect();
  console.log("Consumer connected");

  await consumer.subscribe({ topic: "link-clicked", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        await processClickEvent(event);
      } catch (err) {
        console.error("Error processing message:", err);
      }
    },
  });
}

run().catch((err) => {
  console.error("Consumer crashed:", err);
  process.exit(1);
});

async function shutdown() {
  console.log("Shutting down consumer...");
  await consumer.disconnect();
  await disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
