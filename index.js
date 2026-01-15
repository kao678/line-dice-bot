const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

/* ================= CONFIG (แก้แค่ตรงนี้) ================= */

// 👉 Token จาก LINE Developers
const CHANNEL_ACCESS_TOKEN = "วาง_CHANNEL_ACCESS_TOKEN_ตัวเต็ม";
const CHANNEL_SECRET = "วาง_CHANNEL_SECRET_ตัวเต็ม";

// 👉 LINE userId แอดมิน (พิมพ์ userid กับบอทเอา)
const ADMIN_ID = "Uxxxxxxxxxxxxxxxxxxxxxxxx";

// 👉 วันหมดอายุบอท (หมดแล้วบอทหยุดตอบ)
const LICENSE_EXPIRE = "2026-12-31";

// 👉 โดเมนที่อนุญาต (จาก Render)
const ALLOW_DOMAIN = "line-dice-bot.onrender.com";

/* ========================================================= */

let OPEN = false;
let ROUND = 1;
const USERS = {};
const HISTORY = [];

/* ================= SECURITY ================= */

function isLicenseValid() {
  const today = new Date().toISOString().slice(0, 10);
  return today <= LICENSE_EXPIRE;
}

function checkDomain(req) {
  const host = req.headers.host;
  return host && host.includes(ALLOW_DOMAIN);
}

function verify(req) {
  const sig = req.headers["x-line-signature"];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return sig === hash;
}

/* ================= LINE REPLY ================= */

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

/* ================= CHECK STATUS ================= */

app.get("/", (req, res) => {
  res.send("LINE DICE BOT : RUNNING");
});

/* ================= WEBHOOK ================= */

app.post("/webhook", async (req, res) => {
  if (!checkDomain(req)) return res.sendStatus(403);
  if (!verify(req)) return res.sendStatus(403);
  if (!isLicenseValid()) return res.sendStatus(403);

  const event = req.body.events?.[0];
  if (!event || event.type !== "message") return res.sendStatus(200);

  const text = event.message.text?.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (!USERS[userId]) USERS[userId] = { credit: 1000 };

  /* ===== ADMIN ONLY ===== */
  if (userId === ADMIN_ID) {
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

    if (/^S\d{3}$/.test(text)) {
      const d = text.replace("S", "").split("").map(Number);
      const sum = d.reduce((a, b) => a + b, 0);

      HISTORY.unshift({ round: ROUND, d, sum });
      if (HISTORY.length > 12) HISTORY.pop();

      await reply(replyToken, [
        { type: "text", text: `🎲 ผลออก ${d.join("-")} = ${sum}` },
      ]);

      ROUND++;
      OPEN = false;
      return res.sendStatus(200);
    }
  }

  /* ===== USER COMMAND ===== */

  if (text === "C") {
    await reply(replyToken, [
      { type: "text", text: `💰 เครดิตคงเหลือ ${USERS[userId].credit}` },
    ]);
    return res.sendStatus(200);
  }

  if (/^\d+\/\d+$/.test(text)) {
    if (!OPEN) {
      await reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับแทง" }]);
      return res.sendStatus(200);
    }

    const [bet, money] = text.split("/").map(Number);
    if (USERS[userId].credit < money) {
      await reply(replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);
      return res.sendStatus(200);
    }

    USERS[userId].credit -= money;

    await reply(replyToken, [
      {
        type: "text",
        text: `✅ รับโพย\n🎯 แทง ${bet}\n💸 ${money}\n💰 คงเหลือ ${USERS[userId].credit}`,
      },
    ]);

    return res.sendStatus(200);
  }

  if (text === "userid") {
    await reply(replyToken, [{ type: "text", text: userId }]);
    return res.sendStatus(200);
  }

  await reply(replyToken, [{ type: "text", text: "❌ คำสั่งไม่ถูกต้อง" }]);
  res.sendStatus(200);
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("BOT RUNNING ON", PORT));
