const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ================= CONFIG =================
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID; // userId แอดมิน

if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET) {
  console.error("❌ Missing LINE_TOKEN or LINE_SECRET");
  process.exit(1);
}

// ================= MEMORY =================
let OPEN = false;
let ROUND = 1;

// เก็บเครดิตแยกตาม user ในกลุ่มเดียวกัน
const USERS = {}; // key = userId
const HISTORY = []; // เก็บผลย้อนหลัง 12 รอบ

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
      }
    );
  } catch (err) {
    console.error("❌ Reply error:", err.response?.data || err.message);
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
          { type: "text", text: `ยอดแทง: ${amount}`, color: "#E74C3C" },
          { type: "text", text: `เครดิตคงเหลือ: ${credit}`, color: "#27AE60" },
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
          ...list.map((r) => ({
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
          {
            type: "button",
            action: { type: "message", label: "🟢 เปิดรับเดิมพัน", text: "O" },
          },
          {
            type: "button",
            action: { type: "message", label: "🔴 ปิดรับเดิมพัน", text: "X" },
          },
          {
            type: "button",
            action: { type: "message", label: "🎲 ออกผล (ตัวอย่าง S456)", text: "S456" },
          },
        ],
      },
    },
  };
}

// ================= ROUTE =================
app.get("/", (req, res) => {
  res.send("LINE DICE BOT : RUNNING");
});

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  if (!verify(req)) return res.sendStatus(403);

  const event = req.body.events?.[0];
  if (!event || event.type !== "message") return res.sendStatus(200);

  const text = event.message.text?.trim();
  const replyToken = event.replyToken;

  // ⭐ จุดสำคัญที่สุด (แก้บอทไม่ตอบในกลุ่ม)
  const userId =
    event.source.userId ||
    event.source.groupId ||
    event.source.roomId;

  if (!userId) return res.sendStatus(200);

  if (!USERS[userId]) USERS[userId] = { credit: 1000 };

  // ===== ADMIN PANEL =====
  if (text === "ADMIN" && userId === ADMIN_ID) {
    await reply(replyToken, [flexAdminPanel()]);
    return res.sendStatus(200);
  }

  // ===== เปิดรับ =====
  if (text === "O") {
    OPEN = true;
    await reply(replyToken, [{ type: "text", text: "🟢 เปิดรับเดิมพัน" }]);
    return res.sendStatus(200);
  }

  // ===== ปิดรับ =====
  if (text === "X") {
    OPEN = false;
    await reply(replyToken, [{ type: "text", text: "🔴 ปิดรับเดิมพัน" }]);
    return res.sendStatus(200);
  }

  // ===== แทง =====
  if (/^\d+\/\d+$/.test(text)) {
    if (!OPEN) {
      await reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับเดิมพัน" }]);
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
        round: ROUND,
        bet: text,
        amount,
        credit: USERS[userId].credit,
      }),
    ]);
    return res.sendStatus(200);
  }

  // ===== ออกผล =====
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

  // ===== สถิติ =====
  if (text === "H") {
    await reply(replyToken, [flexHistory(HISTORY)]);
    return res.sendStatus(200);
  }

  // ===== เครดิต =====
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
app.listen(PORT, () => console.log("✅ BOT RUNNING ON", PORT));
