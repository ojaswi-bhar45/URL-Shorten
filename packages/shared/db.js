const { Pool } = require("pg");
const { PrismaClient } = require("../../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

function createPrismaPrimary() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function createPrismaReplica() {
  const pool = new Pool({ connectionString: process.env.DATABASE_REPLICA_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

module.exports = { createPrismaPrimary, createPrismaReplica };
