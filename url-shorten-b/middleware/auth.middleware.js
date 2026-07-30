const jwt = require("jsonwebtoken");

function auth(req, res, next) {
  let authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid authorization header" });
  }

  let token = authHeader.split(" ")[1];

  try {
    let decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    console.error("JWT verification error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { auth };
