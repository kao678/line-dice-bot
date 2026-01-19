const crypto = require("crypto");
const { LINE_SECRET } = require("../config/env");

module.exports = (body, signature) => {
  if (!signature) return false;

  const hash = crypto
    .createHmac("sha256", LINE_SECRET)
    .update(body)
    .digest("base64");

  if (hash.length !== signature.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(signature)
  );
};
