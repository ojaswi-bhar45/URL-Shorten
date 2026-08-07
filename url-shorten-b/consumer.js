require("dotenv").config();

const { kafka } = require("./kafka.js");
const prisma = require("./lib/prisma.js");

const consumer = kafka.consumer({ groupId: "analytics-consumer-group" });

async function run() {
  await consumer.connect();
  console.log("Consumer connected");

  await consumer.subscribe({ topic: "link-clicked", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        console.log("Processing click event:", event);

        await prisma.clickEvent.create({
          data: {
            shortCode: event.shortCode,
            ip: event.ip,
            userAgent: event.userAgent,
            referrer: event.referrer,
            clickedAt: new Date(event.timestamp),
          },
        });

        await prisma.url.update({
          where: { shortCode: event.shortCode },
          data: { clickCount: { increment: 1 } },
        });

        console.log(`Processed click for ${event.shortCode}`);
      } catch (err) {
        console.error("Error processing message:", err);
        // TODO: in production, send failed messages to a dead-letter queue
      }
    },
  });
}

run().catch((err) => {
  console.error("Consumer crashed:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await consumer.disconnect();
  await prisma.$disconnect();
  process.exit(0);
});
