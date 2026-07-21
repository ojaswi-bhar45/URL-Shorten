const z = require("zod");

const shortenSchema = z.object({
  url: z.string().url(),
});

module.exports = { shortenSchema };
