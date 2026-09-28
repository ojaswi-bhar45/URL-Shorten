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

  // Bounded retry. One attempt is not enough: after a connection drops, the
  // very next publish either finds `connected === false` (needs a connect
  // first) or hits the dead socket inside producer.send() (needs a reconnect
  // and a resend). A single attempt loses exactly one event per disconnect,
  // which is how clicks went missing on every idle gap.
  const MAX_SEND_ATTEMPTS = 2;

  async function sendToKafka(topic, messages) {
    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      // Must be awaited. Calling connect() without awaiting leaves `connected`
      // false on the next line, so the event is discarded even though the
      // connect is in flight and would have succeeded moments later.
      if (!connected) {
        await connect();
      }

      if (!connected) {
        logger.error("Kafka producer not connected — dropping event");
        return;
      }

      try {
        await producer.send({ topic, messages });
        return;
      } catch (err) {
        connected = false;
        logger.error(
          `Kafka send failed (attempt ${attempt}/${MAX_SEND_ATTEMPTS}):`,
          err.message
        );
      }
    }
    logger.error("Kafka event dropped after retries:", topic);
  }

  return { kafka, producer, connect, sendToKafka };
}

const defaultProducer = createProducer();
module.exports = { createProducer, ...defaultProducer };
