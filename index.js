const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

/* ================= RAW BODY (สำคัญมาก) ================= */
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

/* ================= CONFIG ================= */
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID;

/* ================= MEMORY ================= */
let OPEN = false;
let ROUND = 1;
const USERS = {};
const HISTORY = [];

/* ================= VERIFY ================= */
function verifySignature(req) {
  const signature = req.headers["x-line-signature"];
  if (!signature) return false;

  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(req.rawBody)
    .digest("base64");

  return hash === signature;
}

/* ================= REPLY ================= */
async function reply(replyToken, messages) {
  return axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
      timeout: 5000,
    }
  );
}

/* ================= ROUTE ================= */
app.get("/", (req, res) => {
  res.send("LINE DICE BOT : RUNNING");
});

/* ================= WEBHOOK ================= */
app.post("/webhook", (req, res) => {
  // ✅ ตอบ LINE ก่อนทันที (แก้ timeout)
  res.sendStatus(200);

  // ❌ ตรวจลายเซ็น
  if (!verifySignature(req)) {
    console.log("❌ Invalid signature");
    return;
  }

  const event = req.body.events?.[0];
  if (!event || event.type !== "message") return;

  const text = event.message.text?.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (!USERS[userId]) USERS[userId] = { credit: 1000 };

  // ADMIN
  if (text === "O" && userId === ADMIN_ID) {
    OPEN = true;
    return reply(replyToken, [{ type: "text", text: "🟢 เปิดรับเดิมพัน" }]);
  }

  if (text === "X" && userId === ADMIN_ID) {
    OPEN = false;
    return reply(replyToken, [{ type: "text", text: "🔴 ปิดรับเดิมพัน" }]);
  }

  if (text === "C") {
    return reply(replyToken, [
      { type: "text", text: `💰 เครดิต ${USERS[userId].credit}` },
    ]);
  }

  if (/^\d+\/\d+$/.test(text)) {
    if (!OPEN) {
      return reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับแทง" }]);
    }

    const [, amount] = text.split("/").map(Number);
    if (USERS[userId].credit < amount) {
      return reply(replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);
    }

    USERS[userId].credit -= amount;

    return reply(replyToken, [
      {
        type: "text",
        text: `✔️ รับโพย ${text}\nเครดิตคงเหลือ ${USERS[userId].credit}`,
      },
    ]);
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("BOT RUNNING ON", PORT);
});
