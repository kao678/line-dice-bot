const crypto = require("crypto");

module.exports = (body, signature, secret) => {
  if (!signature) return false;

  const hash = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
};
