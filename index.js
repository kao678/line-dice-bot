const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ================= CONFIG =================
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID || null;

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
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      { replyToken: token, messages },
      {
        headers: {
          Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );
  } catch (e) {
    console.error("REPLY ERROR", e.message);
  }
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
          { type: "text", text: `โพย: ${d.bet}`, margin: "md" },
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
    altText: "แผงแอดมิน",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "👑 แผงควบคุมแอดมิน", weight: "bold" },
          { type: "button", action: { type: "message", label: "🟢 เปิดรับแทง", text: "O" }},
          { type: "button", action: { type: "message", label: "🔴 ปิดรับแทง", text: "X" }},
          { type: "button", action: { type: "message", label: "🎲 ออกผล S456", text: "S456" }},
        ],
      },
    },
  };
}

// ================= HEALTH =================
app.get("/", (req, res) => {
  res.send("LINE DICE BOT : RUNNING");
});

// ================= WEBHOOK =================
app.post("/webhook", (req, res) => {
  // ✅ ตอบ LINE ทันที กัน timeout
  res.status(200).send("OK");

  if (!verify(req)) return;

  const event = req.body.events?.[0];
  if (!event || event.type !== "message") return;

  const text = event.message.text?.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (!USERS[userId]) USERS[userId] = { credit: 1000 };

  (async () => {
    // ADMIN PANEL
    if ((ADMIN_ID ? userId === ADMIN_ID : true) && text === "ADMIN") {
      await reply(replyToken, [flexAdminPanel()]);
      return;
    }

    if (text === "O") {
      OPEN = true;
      await reply(replyToken, [{ type: "text", text: "🟢 เปิดรับเดิมพัน" }]);
      return;
    }

    if (text === "X") {
      OPEN = false;
      await reply(replyToken, [{ type: "text", text: "🔴 ปิดรับเดิมพัน" }]);
      return;
    }

    if (/^\d+\/\d+$/.test(text)) {
      if (!OPEN) {
        await reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับแทง" }]);
        return;
      }

      const [, amount] = text.split("/").map(Number);
      if (USERS[userId].credit < amount) {
        await reply(replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);
        return;
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
      return;
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
      return;
    }

    if (text === "H") {
      await reply(replyToken, [flexHistory(HISTORY)]);
      return;
    }

    if (text === "C") {
      await reply(replyToken, [
        { type: "text", text: `💰 เครดิต ${USERS[userId].credit}` },
      ]);
      return;
    }

    await reply(replyToken, [{ type: "text", text: "❌ คำสั่งไม่ถูกต้อง" }]);
  })();
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("BOT RUNNING ON", PORT));
