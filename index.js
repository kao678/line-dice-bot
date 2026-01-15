const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ================= CONFIG =================
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;

// ===== ระบบขาย / เช่า =====
const ADMIN_ID = process.env.ADMIN_ID; // ใส่ USER ID แอดมิน
const LICENSE_EXPIRE = "2026-12-31";

// ================= MEMORY =================
let OPEN = false;
let ROUND = 1;
const USERS = {};
const BETS = [];
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
function flexDiceResult(dice, sum) {
  return {
    type: "flex",
    altText: "ผลลูกเต๋า",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "🎲 ผลลูกเต๋า", weight: "bold", size: "lg" },
          { type: "separator", margin: "md" },
          {
            type: "text",
            text: dice.join("  "),
            size: "xxl",
            align: "center",
            margin: "lg",
          },
          {
            type: "text",
            text: `รวม = ${sum}`,
            size: "xl",
            align: "center",
            weight: "bold",
            color: "#e74c3c",
          },
        ],
      },
    },
  };
}

function flexSummary(list) {
  return {
    type: "flex",
    altText: "สรุปยอด",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "📊 สรุปยอดรอบนี้", weight: "bold", size: "lg" },
          { type: "separator", margin: "md" },
          ...list.map(r => ({
            type: "text",
            text: `${r.user} : ${r.result}`,
            size: "sm",
            color: r.result.startsWith("+") ? "#27ae60" : "#e74c3c",
          })),
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
  if (new Date() > new Date(LICENSE_EXPIRE)) return res.sendStatus(403);

  const event = req.body.events?.[0];
  if (!event || event.type !== "message") return res.sendStatus(200);

  const text = event.message.text?.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (!USERS[userId]) USERS[userId] = { credit: 1000 };

  // ================= ADMIN =================
  if (text === "O" && userId === ADMIN_ID) {
    OPEN = true;
    BETS.length = 0;
    await reply(replyToken, [{ type: "text", text: "🟢 เปิดรับเดิมพัน" }]);
    return res.sendStatus(200);
  }

  if (text === "X" && userId === ADMIN_ID) {
    OPEN = false;
    await reply(replyToken, [{ type: "text", text: "🔴 ปิดรับเดิมพัน" }]);
    return res.sendStatus(200);
  }

  // ================= BET =================
  if (/^\d+\/\d+$/.test(text)) {
    if (!OPEN) {
      await reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับแทง" }]);
      return res.sendStatus(200);
    }

    const [bet, amount] = text.split("/").map(Number);
    if (USERS[userId].credit < amount) {
      await reply(replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);
      return res.sendStatus(200);
    }

    USERS[userId].credit -= amount;
    BETS.push({ user: userId.slice(-4), bet, amount });

    await reply(replyToken, [
      { type: "text", text: `✔️ รับโพย ${text}` },
    ]);
    return res.sendStatus(200);
  }

  // ================= RESULT =================
  if (/^S\d{3}$/.test(text) && userId === ADMIN_ID) {
    const dice = text.replace("S", "").split("").map(Number);
    const sum = dice.reduce((a, b) => a + b, 0);

    const summary = BETS.map(b => ({
      user: b.user,
      result: sum === b.bet ? `+${b.amount * 2}` : `-${b.amount}`,
    }));

    HISTORY.unshift({ round: ROUND, dice, sum });
    if (HISTORY.length > 12) HISTORY.pop();

    ROUND++;
    OPEN = false;

    await reply(replyToken, [
      flexDiceResult(dice, sum),
      flexSummary(summary),
    ]);
    return res.sendStatus(200);
  }

  // ================= CREDIT =================
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
app.listen(PORT, () => console.log("BOT RUNNING"));
