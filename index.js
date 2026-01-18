const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ================= CONFIG (ต้องตั้งใน Render) =================
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID || ""; // ไม่มีไม่พัง

if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET) {
  console.error("❌ LINE_TOKEN หรือ LINE_SECRET ว่าง");
}

// ================= MEMORY =================
let OPEN = false;
let ROUND = 1;
const USERS = {};
const HISTORY = [];

// ================= VERIFY SIGNATURE =================
function verify(req) {
  try {
    const signature = req.headers["x-line-signature"];
    const body = JSON.stringify(req.body);
    const hash = crypto
      .createHmac("sha256", CHANNEL_SECRET)
      .update(body)
      .digest("base64");
    return signature === hash;
  } catch {
    return false;
  }
}

// ================= REPLY =================
async function reply(replyToken, messages) {
  if (!replyToken) return;
  try {
    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken,
        messages: Array.isArray(messages) ? messages : [messages],
      },
      {
        headers: {
          Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 3000,
      }
    );
  } catch (err) {
    console.error("❌ REPLY ERROR:", err.response?.data || err.message);
  }
}

// ================= FLEX =================
function flexBetSlip({ round, bet, amount, credit }) {
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
          { type: "text", text: `รอบที่ ${round}`, size: "sm", color: "#888888" },
          { type: "separator", margin: "md" },
          { type: "text", text: `โพย: ${bet}`, margin: "md" },
          { type: "text", text: `ยอดแทง: ${amount}`, color: "#e74c3c" },
          { type: "text", text: `เครดิตคงเหลือ: ${credit}`, color: "#27ae60" },
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
            size: "sm",
            text: `รอบ ${r.round} : ${r.d.join("-")} = ${r.sum}`,
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
          {
            type: "button",
            action: { type: "message", label: "🟢 เปิดรับแทง", text: "O" },
          },
          {
            type: "button",
            action: { type: "message", label: "🔴 ปิดรับแทง", text: "X" },
          },
          {
            type: "button",
            action: { type: "message", label: "🎲 ออกผล S123", text: "S123" },
          },
        ],
      },
    },
  };
}

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
  res.send("LINE DICE BOT : RUNNING");
});

// ================= WEBHOOK (หัวใจสำคัญ) =================
app.post("/webhook", (req, res) => {
  // ✅ ตอบ 200 ทันที กัน timeout / 502
  res.sendStatus(200);

  try {
    if (!verify(req)) return;

    const event = req.body.events?.[0];
    if (!event || event.type !== "message") return;

    const text = event.message.text?.trim();
    const userId = event.source.userId;
    const replyToken = event.replyToken;

    if (!text) return;
    if (!USERS[userId]) USERS[userId] = { credit: 1000 };

    // ===== ADMIN =====
    if (userId === ADMIN_ID && text === "ADMIN") {
      reply(replyToken, flexAdminPanel());
      return;
    }

    if (text === "O") {
      OPEN = true;
      reply(replyToken, { type: "text", text: "🟢 เปิดรับเดิมพัน" });
      return;
    }

    if (text === "X") {
      OPEN = false;
      reply(replyToken, { type: "text", text: "🔴 ปิดรับเดิมพัน" });
      return;
    }

    // ===== BET =====
    if (/^\d+\/\d+$/.test(text)) {
      if (!OPEN) {
        reply(replyToken, { type: "text", text: "❌ ยังไม่เปิดรับเดิมพัน" });
        return;
      }

      const [, amount] = text.split("/").map(Number);
      if (USERS[userId].credit < amount) {
        reply(replyToken, { type: "text", text: "❌ เครดิตไม่พอ" });
        return;
      }

      USERS[userId].credit -= amount;

      reply(
        replyToken,
        flexBetSlip({
          round: ROUND,
          bet: text,
          amount,
          credit: USERS[userId].credit,
        })
      );
      return;
    }

    // ===== RESULT =====
    if (/^S\d{3}$/.test(text)) {
      const d = text.replace("S", "").split("").map(Number);
      const sum = d.reduce((a, b) => a + b, 0);

      HISTORY.unshift({ round: ROUND, d, sum });
      if (HISTORY.length > 12) HISTORY.pop();

      ROUND++;
      OPEN = false;

      reply(replyToken, {
        type: "text",
        text: `🎲 ผลออก ${d.join("-")} = ${sum}`,
      });
      return;
    }

    // ===== HISTORY =====
    if (text === "H") {
      reply(replyToken, flexHistory(HISTORY));
      return;
    }

    // ===== CREDIT =====
    if (text === "C") {
      reply(replyToken, {
        type: "text",
        text: `💰 เครดิต ${USERS[userId].credit}`,
      });
      return;
    }

    reply(replyToken, { type: "text", text: "❌ คำสั่งไม่ถูกต้อง" });

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ BOT RUNNING ON PORT", PORT);
});
