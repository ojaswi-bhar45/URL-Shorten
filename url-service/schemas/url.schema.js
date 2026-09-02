const z = require("zod");

const shortenSchema = z.object({
  url: z
    .string()
    .url({ message: "Must be a valid URL" })
    .max(2048, { message: "URL too long" })
    .refine((val) => val.startsWith("http://") || val.startsWith("https://"), {
      message: "URL must start with http:// or https://",
    }),
});

module.exports = { shortenSchema };
