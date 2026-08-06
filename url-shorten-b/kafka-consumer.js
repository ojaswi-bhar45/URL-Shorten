const { kafka } = require("./kafka.js");

const consumer = kafka.consumer({ groupId: "url-shorten-b-verify" });

async function main() {
  await consumer.connect();
  await consumer.subscribe({ topic: "link-clicked", fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      console.log(
        `Received on ${topic}[${partition}]: ${message.value.toString()}`,
      );
    },
  });
  console.log("Consumer running on topic 'link-clicked'. Press Ctrl+C to exit.");
}

main().catch((err) => {
  console.error("Consumer error:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await consumer.disconnect();
  process.exit(0);
});
