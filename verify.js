const crypto = require("crypto");

module.exports = (body, signature, secret) => {
  try {
    if (!signature) return false;

    const hash = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("base64");

    // ป้องกัน length ไม่เท่ากัน (กัน crash)
    if (hash.length !== signature.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(signature)
    );
  } catch (e) {
    console.error("VERIFY ERROR", e);
    return false;
  }
};
