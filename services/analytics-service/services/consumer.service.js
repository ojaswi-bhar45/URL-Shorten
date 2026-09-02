const { createPrismaPrimary } = require("@url-shorten/shared");
const logger = require("@url-shorten/shared/logger");

const prisma = createPrismaPrimary();

async function processClickEvent(event) {
  if (!event.shortCode) {
    logger.warn("Skipping malformed event (missing shortCode)");
    return;
  }

  const urlExists = await prisma.url.findUnique({
    where: { shortCode: event.shortCode },
    select: { id: true },
  });

  if (!urlExists) {
    logger.warn(`Skipping event for unknown shortCode: ${event.shortCode}`);
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

  logger.info(`Processed click for ${event.shortCode}`);
}

async function disconnect() {
  await prisma.$disconnect();
}

module.exports = { processClickEvent, disconnect };
