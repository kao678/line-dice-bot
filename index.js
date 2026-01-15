const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ====== CONFIG ======
const CHANNEL_ACCESS_TOKEN = "h8DN3tQr0471j6ivcrsJnhXOyhhZpaq6EmYzZB2tCdSKexJGBLo0n0W9Ox6CXMvlA8ZLDk3SZHUEAPLnY77BkBi7Tk8fxH+4hiNb1IfwoZxi5FmWXzTzd80FQ0r+Jd5Sa9zSXobXpxSOpLDBvndg5wdB04t89/1O/w1cDnyilFU=";
const CHANNEL_SECRET = "c158c823bb61a75d4ac5deac322c3f85";

// ====== MEMORY ======
let OPEN = false;
let ROUND = 1;
const USERS = {};
const HISTORY = [];

// ====== VERIFY ======
function verify(req) {
  const sig = req.headers["x-line-signature"];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return sig === hash;
}

// ====== REPLY ======
async function reply(token, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken: token, messages },
    {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// ====== WEBHOOK ======
app.post("/webhook", async (req, res) => {
  if (!verify(req)) return res.sendStatus(403);

  const event = req.body.events?.[0];
  if (!event || event.type !== "message") return res.sendStatus(200);

  const text = event.message.text?.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (!USERS[userId]) USERS[userId] = { credit: 1000 };

  // เปิดรับแทง
  if (text === "O") {
    OPEN = true;
    await reply(replyToken, [{ type: "text", text: "🟢 เปิดรับเดิมพัน" }]);
    return res.sendStatus(200);
  }

  // ปิดรับแทง
  if (text === "X") {
    OPEN = false;
    await reply(replyToken, [{ type: "text", text: "🔴 ปิดรับเดิมพัน" }]);
    return res.sendStatus(200);
  }

  // แทง 1/100
  if (/^\d+\/\d+$/.test(text)) {
    if (!OPEN)
      return reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับแทง" }]);

    const [n, m] = text.split("/").map(Number);
    if (USERS[userId].credit < m)
      return reply(replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);

    USERS[userId].credit -= m;
    await reply(replyToken, [
      { type: "text", text: `✅ รับโพย ${text}` },
    ]);
    return res.sendStatus(200);
  }

  // ออกผล S456
  if (/^S\d\d\d$/.test(text)) {
    const d = text.replace("S", "").split("").map(Number);
    const sum = d[0] + d[1] + d[2];

    HISTORY.unshift({ round: ROUND, d, sum });
    if (HISTORY.length > 12) HISTORY.pop();

    await reply(replyToken, [
      { type: "text", text: `🎲 ${d.join("-")} = ${sum}` },
    ]);

    ROUND++;
    OPEN = false;
    return res.sendStatus(200);
  }

  // เครดิต
  if (text === "C") {
    await reply(replyToken, [
      { type: "text", text: `💰 เครดิต ${USERS[userId].credit}` },
    ]);
    return res.sendStatus(200);
  }

  await reply(replyToken, [{ type: "text", text: "❌ คำสั่งไม่ถูกต้อง" }]);
  res.sendStatus(200);
});

// ====== START ======
app.listen(3000, () => console.log("BOT RUNNING"));
