const jwt = require("jsonwebtoken");
const config = require("../config");
const logger = require("@url-shorten/shared/logger");

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    logger.error("JWT verification error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      req.userId = decoded.userId;
    } catch (err) {
      // Fail closed: an invalid/expired token must not be silently downgraded
      // to an anonymous identity — that would let stale tokens create URLs
      // outside the user's account.
      logger.warn("Optional JWT verification failed:", err.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  }
  next();
}

module.exports = { auth, optionalAuth };
