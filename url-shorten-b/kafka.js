const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "url-shorten-b",
  brokers: ["localhost:9092"],
});

const producer = kafka.producer();

module.exports = { kafka, producer };
