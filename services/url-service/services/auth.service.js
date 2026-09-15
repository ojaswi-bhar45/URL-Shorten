const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createPrismaPrimary } = require("@url-shorten/shared");
const { redisClient } = require("../redis");
const logger = require("@url-shorten/shared/logger");

const prisma = createPrismaPrimary();

// Pre-computed bcrypt hash used for unknown emails so login always does a
// bcrypt.compare() and the response time does not reveal account existence.
const DUMMY_PASSWORD_HASH = "$2b$10$pFtQqaqFoWcPAcYFr9ObaOoZlOCNjegiUix1MnMRm.PmxZhg0eTm.";

const MAX_LOGIN_FAILURES = 10;
const LOGIN_FAILURE_WINDOW = 60;

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function countLoginFailures(key) {
  try {
    const count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, LOGIN_FAILURE_WINDOW);
    return count;
  } catch (err) {
    logger.error("Login throttling error:", err);
    return 0;
  }
}

async function signup(email, password) {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError(409, "An account with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash: hashedPassword },
  });

  return { id: Number(user.id), email: user.email };
}

async function login(email, password) {
  const failKey = `auth:fail:${email}`;
  try {
    const failures = await redisClient.get(failKey);
    if (failures && Number(failures) >= MAX_LOGIN_FAILURES) {
      throw new AppError(429, "Too many failed login attempts. Try again later.");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("Login throttle check error:", err);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  let isValid;
  if (user) {
    isValid = await bcrypt.compare(password, user.passwordHash);
  } else {
    // Equalize timing with a dummy bcrypt comparison for unknown emails.
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    isValid = false;
  }

  if (!isValid) {
    await countLoginFailures(failKey);
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
