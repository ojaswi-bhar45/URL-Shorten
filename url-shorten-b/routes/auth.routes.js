const { Router } = require("express");
const { signupSchema, loginSchema } = require("../schemas/auth.schema");
const { prismaPrimary } = require("../db.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const router = Router();

router.post("/signup", async (req, res) => {
  let result = signupSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  let { email, password } = result.data;

  try {
    let existingUser = await prismaPrimary.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    let hashedPassword = await bcrypt.hash(password, 10);

    let user = await prismaPrimary.user.create({
      data: { email, passwordHash: hashedPassword },
    });

    let token = jwt.sign({ userId: Number(user.id) }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    });

    res.status(201).json({ id: Number(user.id), email: user.email });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.post("/login", async (req, res) => {
  let result = loginSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  let { email, password } = result.data;

  try {
    let user = await prismaPrimary.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    let isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    let token = jwt.sign({ userId: Number(user.id) }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    });
    res.status(200).json({ token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Failed to login" });
  }
});

module.exports = router;
