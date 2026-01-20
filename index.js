require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();

/* ===== CONFIG ===== */
const LINE_TOKEN  = process.env.LINE_TOKEN;
const LINE_SECRET = process.env.LINE_SECRET;
const ADMIN_ID    = process.env.ADMIN_ID;
const PORT = process.env.PORT || 3000;

if (!LINE_TOKEN || !LINE_SECRET || !ADMIN_ID) {
  console.error("❌ ENV MISSING");
  process.exit(1);
}

/* ===== LINE REPLY ===== */
const reply = async (replyToken, to, messages) => {
  const headers = {
    Authorization: `Bearer ${LINE_TOKEN}`,
    "Content-Type": "application/json"
  };
  const body = { messages: Array.isArray(messages) ? messages : [messages] };

  try {
    if (replyToken) {
      await axios.post("https://api.line.me/v2/bot/message/reply",
        { replyToken, ...body }, { headers });
    } else if (to) {
      await axios.post("https://api.line.me/v2/bot/message/push",
        { to, ...body }, { headers });
    }
  } catch (e) {
    console.error("LINE ERROR", e.response?.data || e.message);
  }
};

/* ===== SIGNATURE ===== */
const verifySignature = (body, signature) => {
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

/* ===== STATE ===== */
let BET_OPEN = false;
const CREDIT = {};
const PENDING = {};

/* ===== WEBHOOK (สำคัญที่สุด) ===== */
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {

    // 🔥 ตอบ 200 ก่อนเสมอ
    res.sendStatus(200);

    const signature = req.headers["x-line-signature"];
    if (!verifySignature(req.body, signature)) {
      console.warn("❌ INVALID SIGNATURE");
      return;
    }

    let body;
    try {
      body = JSON.parse(req.body.toString());
    } catch {
      return;
    }

    for (const ev of body.events || []) {
      const uid = ev.source?.userId;
      if (!uid) continue;

      CREDIT[uid] ??= 10000;
      const isAdmin = uid === ADMIN_ID;

      let text = "";
      if (ev.type === "postback") text = ev.postback.data;
      if (ev.type === "message") text = ev.message.text?.toUpperCase();

      if (text === "MENU")
        await reply(ev.replyToken, uid, { type:"text", text:"MENU OK" });

      if (isAdmin && text === "O") BET_OPEN = true;
      if (isAdmin && text === "X") BET_OPEN = false;
    }
  }
);

/* ===== HEALTH CHECK ===== */
app.get("/", (_, res) => res.send("BOT RUNNING"));

app.listen(PORT, () => console.log("✅ RUN", PORT));
