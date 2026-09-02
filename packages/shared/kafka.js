const { Kafka, Partitioners } = require("kafkajs");
const logger = require("./logger");

function createProducer(clientId = "url-shorten") {
  const brokers = (process.env.KAFKA_BROKER || "localhost:9092").split(",");

  const kafka = new Kafka({ clientId, brokers });
  const producer = kafka.producer({
    createPartitioner: Partitioners.LegacyPartitioner,
  });

  let connected = false;
  let connecting = null;

  producer.on(producer.events.DISCONNECT, () => {
    connected = false;
  });

  async function connect() {
    if (connected || connecting) return connecting;
    connecting = producer
      .connect()
      .then(() => {
        connected = true;
      })
      .catch((err) => {
        connected = false;
        logger.error("Kafka producer connect failed:", err.message);
      })
      .finally(() => {
        connecting = null;
      });
    return connecting;
  }

  async function sendToKafka(topic, messages) {
    if (!connected) connect();
    if (!connected) {
      logger.error("Kafka producer not connected — dropping event");
      return;
    }
    try {
      await producer.send({ topic, messages });
    } catch (err) {
      connected = false;
      logger.error("Kafka send failed:", err.message);
      connect();
    }
  }

  return { kafka, producer, connect, sendToKafka };
}

const defaultProducer = createProducer();
module.exports = { createProducer, ...defaultProducer };
