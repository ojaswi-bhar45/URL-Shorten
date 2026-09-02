const { Router } = require("express");
const { shortenSchema } = require("../schemas/url.schema");
const { auth, optionalAuth } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");
const { shortenUrl, redirectCode, getUserUrls } = require("../services/url.service");

const router = Router();

router.post("/shorten", optionalAuth, rateLimit("shorten"), async (req, res) => {
  const result = shortenSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  try {
    const url = await shortenUrl(result.data.url, req.userId);
    res.status(201).json(url);
  } catch (err) {
    res.status(500).json({ error: "Failed to create short URL" });
  }
});

router.get("/:code", async (req, res) => {
  try {
    const result = await redirectCode(req.params.code, req);

    if (!result.found) {
      return res.status(404).json({ error: "Short URL not found" });
    }
    if (result.expired) {
      return res.status(410).json({ error: "This link has expired" });
    }

    return res.redirect(result.longUrl);
  } catch (err) {
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.get("/me/urls", auth, async (req, res) => {
  try {
    const urls = await getUserUrls(req.userId);
    res.json(urls);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user URLs" });
  }
});

module.exports = router;
