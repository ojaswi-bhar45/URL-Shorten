require("dotenv").config();

const { kafka } = require("./kafka.js");
const prisma = require("./db.js");

const consumer = kafka.consumer({ groupId: "analytics-consumer-group" });

async function run() {
  await consumer.connect();
  console.log("Consumer connected");

  await consumer.subscribe({ topic: "link-clicked", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value.toString());

        if (!event.shortCode) {
          console.warn("Skipping malformed event (missing shortCode)");
          return;
        }

        const urlExists = await prisma.url.findUnique({
          where: { shortCode: event.shortCode },
          select: { id: true },
        });

        if (!urlExists) {
          console.warn(`Skipping event for unknown shortCode: ${event.shortCode}`);
          return;
        }

        await prisma.$transaction([
          prisma.clickEvent.create({
            data: {
              shortCode: event.shortCode,
              ip: event.ip,
              userAgent: event.userAgent,
              referrer: event.referrer,
              clickedAt: new Date(event.timestamp),
            },
          }),
          prisma.url.update({
            where: { shortCode: event.shortCode },
            data: { clickCount: { increment: 1 } },
          }),
        ]);

        console.log(`✅ Processed click for ${event.shortCode}`);
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

async function shutdown() {
  console.log("Shutting down consumer...");
  await consumer.disconnect();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
