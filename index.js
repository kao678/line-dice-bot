const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ================= CONFIG =================
const CHANNEL_ACCESS_TOKEN = "วาง_CHANNEL_ACCESS_TOKEN_ตัวเต็ม";
const CHANNEL_SECRET = "วาง_CHANNEL_SECRET_ตัวเต็ม";

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
function flexCredit(userId, credit) {
  return {
    type: "flex",
    altText: "เครดิตคงเหลือ",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "💰 เครดิตคงเหลือ", weight: "bold", size: "lg", align: "center" },
          {
            type: "text",
            text: credit.toLocaleString() + " บาท",
            size: "xxl",
            weight: "bold",
            color: "#D32F2F",
            align: "center"
          },
          {
            type: "text",
            text: "ID : " + userId.slice(-6),
            size: "sm",
            color: "#888888",
            align: "center"
          }
        ]
      }
    }
  };
}

function flexSlip(text, credit) {
  return {
    type: "flex",
    altText: "ใบรับโพย",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "✅ รับโพยเรียบร้อย", weight: "bold", size: "lg", align: "center" },
          { type: "text", text, size: "xl", weight: "bold", align: "center" },
          { type: "separator" },
          {
            type: "text",
            text: "เครดิตคงเหลือ " + credit.toLocaleString() + " บาท",
            align: "center"
          }
        ]
      }
    }
  };
}

function flexHistory() {
  return {
    type: "flex",
    altText: "สถิติย้อนหลัง",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: "📊 สถิติย้อนหลัง 12 ตา", weight: "bold", size: "lg", align: "center" },
          ...HISTORY.map(h => ({
            type: "text",
            text: `รอบ ${h.round} : ${h.d.join("-")} = ${h.sum}`,
            size: "sm"
          }))
        ]
      }
    }
  };
}

// ================= STATUS PAGE =================
app.get("/", (req, res) => {
  res.send("LINE DICE BOT : RUNNING");
});

// ================= WEBHOOK =================
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

  // แทง เช่น 1/100
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
    await reply(replyToken, [flexSlip(text, USERS[userId].credit)]);
    return res.sendStatus(200);
  }

  // ออกผล S456
  if (/^S\d{3}$/.test(text)) {
    const d = text.replace("S", "").split("").map(Number);
    const sum = d[0] + d[1] + d[2];

    HISTORY.unshift({ round: ROUND, d, sum });
    if (HISTORY.length > 12) HISTORY.pop();

    await reply(replyToken, [
      { type: "text", text: `🎲 ${d.join("-")} = ${sum}` },
      flexHistory()
    ]);

    ROUND++;
    OPEN = false;
    return res.sendStatus(200);
  }

  // เครดิต
  if (text === "C") {
    await reply(replyToken, [flexCredit(userId, USERS[userId].credit)]);
    return res.sendStatus(200);
  }

  await reply(replyToken, [{ type: "text", text: "❌ คำสั่งไม่ถูกต้อง" }]);
  res.sendStatus(200);
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("BOT RUNNING ON", PORT));
