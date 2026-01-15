const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ================= CONFIG =================
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN || "h8DN3tQr0471j6ivcrsJnhXOyhhZpaq6EmYzZB2tCdSKexJGBLo0n0W9Ox6CXMvlA8ZLDk3SZHUEAPLnY77BkBi7Tk8fxH+4hiNb1IfwoZxi5FmWXzTzd80FQ0r+Jd5Sa9zSXobXpxSOpLDBvndg5wdB04t89/1O/w1cDnyilFU=";
const CHANNEL_SECRET = process.env.LINE_SECRET || "c158c823bb61a75d4ac5deac322c3f85";

// ===== ระบบขาย / เช่า =====
const ADMIN_ID = "Uab107367b6017b2b5fede655841f715c";
const LICENSE_EXPIRE = "2026-12-31"; // 2026-01-31
const ALLOW_DOMAIN = "line-dice-bot.onrender.com";

// ================= MEMORY =================
let OPEN = false;
let ROUND = 1;
const USERS = {};
const HISTORY = [];

// ================= VERIFY =================
function verify(req) {
  const sig = req.headers["x-line-signature"];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return sig === hash;
}

// ================= REPLY =================
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

// ================= FLEX =================
function flexBetSlip(d) {
  return {
    type: "flex",
    altText: "ใบรับโพย",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "✔️ ใบรับโพย", weight: "bold", size: "lg" },
          { type: "text", text: `รอบที่ ${d.round}`, color: "#888" },
          { type: "separator", margin: "md" },
          { type: "text", text: `โพย: ${d.bet}`, size: "md", margin: "md" },
          { type: "text", text: `ยอดแทง: ${d.amount}`, color: "#e74c3c" },
          { type: "text", text: `เครดิตคงเหลือ: ${d.credit}`, color: "#27ae60" },
        ],
      },
    },
  };
}

function flexHistory(list) {
  return {
    type: "flex",
    altText: "สถิติย้อนหลัง",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "📊 สถิติย้อนหลัง 12 รอบ", weight: "bold" },
          ...list.map(r => ({
            type: "text",
            text: `รอบ ${r.round} : ${r.d.join("-")} = ${r.sum}`,
            size: "sm",
          })),
        ],
      },
    },
  };
}

function flexAdminPanel() {
  return {
    type: "flex",
    altText: "แอดมิน",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "👑 แผงควบคุมแอดมิน", weight: "bold" },
          { type: "button", action: { type: "message", label: "🟢 เปิดรับแทง", text: "O" }},
          { type: "button", action: { type: "message", label: "🔴 ปิดรับแทง", text: "X" }},
          { type: "button", action: { type: "message", label: "🎲 ออกผล S123", text: "S123" }},
        ],
      },
    },
  };
}

// ================= CHECK =================
function licenseValid() {
  return new Date() <= new Date(LICENSE_EXPIRE);
}

// ================= ROUTE =================
app.get("/", (req, res) => {
  if (!req.headers.host.includes(ALLOW_DOMAIN))
    return res.status(403).send("DOMAIN NOT ALLOWED");
  res.send("LINE DICE BOT : RUNNING");
});

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  if (!verify(req)) return res.sendStatus(403);
  if (!licenseValid()) return res.sendStatus(403);

  const event = req.body.events?.[0];
  if (!event || event.type !== "message") return res.sendStatus(200);

  const text = event.message.text?.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (!USERS[userId]) USERS[userId] = { credit: 1000 };

  // ADMIN PANEL
  if (userId === ADMIN_ID && text === "ADMIN") {
    await reply(replyToken, [flexAdminPanel()]);
    return res.sendStatus(200);
  }

  if (text === "O") {
    OPEN = true;
    await reply(replyToken, [{ type: "text", text: "🟢 เปิดรับเดิมพัน" }]);
    return res.sendStatus(200);
  }

  if (text === "X") {
    OPEN = false;
    await reply(replyToken, [{ type: "text", text: "🔴 ปิดรับเดิมพัน" }]);
    return res.sendStatus(200);
  }

  if (/^\d+\/\d+$/.test(text)) {
    if (!OPEN) {
      await reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับแทง" }]);
      return res.sendStatus(200);
    }

    const [, amount] = text.split("/").map(Number);
    if (USERS[userId].credit < amount) {
      await reply(replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);
      return res.sendStatus(200);
    }

    USERS[userId].credit -= amount;
    await reply(replyToken, [
      flexBetSlip({
        bet: text,
        amount,
        credit: USERS[userId].credit,
        round: ROUND,
      }),
    ]);
    return res.sendStatus(200);
  }

  if (/^S\d{3}$/.test(text)) {
    const d = text.replace("S", "").split("").map(Number);
    const sum = d.reduce((a, b) => a + b, 0);

    HISTORY.unshift({ round: ROUND, d, sum });
    if (HISTORY.length > 12) HISTORY.pop();

    ROUND++;
    OPEN = false;

    await reply(replyToken, [
      { type: "text", text: `🎲 ผลออก ${d.join("-")} = ${sum}` },
    ]);
    return res.sendStatus(200);
  }

  if (text === "H") {
    await reply(replyToken, [flexHistory(HISTORY)]);
    return res.sendStatus(200);
  }

  if (text === "C") {
    await reply(replyToken, [
      { type: "text", text: `💰 เครดิต ${USERS[userId].credit}` },
    ]);
    return res.sendStatus(200);
  }

  await reply(replyToken, [{ type: "text", text: "❌ คำสั่งไม่ถูกต้อง" }]);
  res.sendStatus(200);
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("BOT RUNNING ON", PORT));
