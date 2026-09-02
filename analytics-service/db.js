const { Pool } = require("pg");
const { PrismaClient } = require("../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const poolPrimary = new Pool({ connectionString: process.env.DATABASE_URL });
const adapterPrimary = new PrismaPg(poolPrimary);
const prismaPrimary = new PrismaClient({ adapter: adapterPrimary });

const poolReplica = new Pool({ connectionString: process.env.DATABASE_REPLICA_URL });
const adapterReplica = new PrismaPg(poolReplica);
const prismaReplica = new PrismaClient({ adapter: adapterReplica });

module.exports = { prismaPrimary, prismaReplica };
