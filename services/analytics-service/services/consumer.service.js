import { Pool } from "pg";
import { PrismaClient } from "../../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

export async function processClickEvent(event) {
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

  console.log(`Processed click for ${event.shortCode}`);
}

export async function disconnect() {
  await prisma.$disconnect();
}
