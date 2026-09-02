const { Router } = require("express");
const { signupSchema, loginSchema } = require("../schemas/auth.schema");
const { signup, login, AppError } = require("../services/auth.service");

const router = Router();

router.post("/signup", async (req, res) => {
  const result = signupSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  try {
    const user = await signup(result.data.email, result.data.password);
    res.status(201).json(user);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.post("/login", async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  try {
    const data = await login(result.data.email, result.data.password);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: "Failed to login" });
  }
});

module.exports = router;
