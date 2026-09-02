const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createPrismaPrimary } = require("@url-shorten/shared");
const logger = require("@url-shorten/shared/logger");

const prisma = createPrismaPrimary();

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function signup(email, password) {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError(400, "Email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash: hashedPassword },
  });

  return { id: Number(user.id), email: user.email };
}

async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError(400, "Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError(400, "Invalid email or password");
  }

  const token = jwt.sign(
    { userId: Number(user.id) },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
  );

  return { token };
}

module.exports = { signup, login, AppError };
