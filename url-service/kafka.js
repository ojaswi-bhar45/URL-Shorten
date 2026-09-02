const { Kafka, Partitioners } = require("kafkajs");

const brokers = (process.env.KAFKA_BROKER || "localhost:9092").split(",");

const kafka = new Kafka({
  clientId: "url-shorten-b",
  brokers,
});

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
      console.error("Kafka producer connect failed:", err.message);
    })
    .finally(() => {
      connecting = null;
    });
  return connecting;
}

async function sendToKafka(topic, messages) {
  if (!connected) connect();

  if (!connected) {
    console.error("Kafka producer not connected — dropping click event");
    return;
  }

  try {
    await producer.send({ topic, messages });
  } catch (err) {
    connected = false;
    console.error("Kafka send failed:", err.message);
    connect();
  }
}

module.exports = { kafka, producer, connect, sendToKafka };
