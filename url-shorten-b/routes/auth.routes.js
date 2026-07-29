const { Router } = require("express");
const { signupSchema } = require("../schemas/auth.schema");
const prisma = require("../lib/prisma");
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

    let existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    let hashedPassword = await bcrypt.hash(password, 10);

    let user = await prisma.user.create({
      data: { email, passwordHash: hashedPassword },
    });

    let token = jwt.sign({ userId: Number(user.id) }, process.env.JWT_SECRET, {
        expiresIn: "1h",
    });

    res.status(201).json({ token });
    console.log("User created successfully:", user);

  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

module.exports = router;
