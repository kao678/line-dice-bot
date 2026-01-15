const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ================= CONFIG =================
const CHANNEL_ACCESS_TOKEN = "+VPA52bvvqo8JEt5SWZxIUzLsp64QIp5UgQx7tDUu7eAxAfyJtYS+7WoZEJnudS+A8ZLDk3SZHUEAPLnY77BkBi7Tk8fxH+4hiNb1IfwoZxw7g0zvRbDXSApXTWNastwPJ8ztAg+6WeUic/6fmXypQdB04t89/1O/w1cDnyilFU=";
const CHANNEL_SECRET = "c158c823bb61a75d4ac5deac322c3f85";

// ================= MEMORY =================
let OPEN = false;
let ROUND = 1;
let LAST_RESULT = null;

const USERS = {}; 
// userId: { credit }

const HISTORY = []; 
// { round, d1, d2, d3, sum }

// ================= VERIFY =================
function verify(req) {
  const signature = req.headers["x-line-signature"];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return hash === signature;
}

// ================= REPLY =================
async function reply(replyToken, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken, messages },
    {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ================= FLEX DICE =================
function flexDice(d1, d2, d3, sum) {
  const dice = [d1, d2, d3].map(n => ({
    type: "image",
    url: `https://raw.githubusercontent.com/napatsw/line-dice/main/${n}.png`,
    size: "sm"
  }));

  return {
    type: "flex",
    altText: "ผลถั่ว",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: dice
          },
          {
            type: "text",
            text: `ผลรวม = ${sum}`,
            weight: "bold",
            align: "center",
            color: sum >= 11 ? "#ff0000" : "#ffff00"
          }
        ]
      }
    }
  };
}

// ================= FLEX HISTORY =================
function flexHistory() {
  return {
    type: "flex",
    altText: "สถิติย้อนหลัง",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "📊 สถิติย้อนหลัง",
            weight: "bold",
            color: "#ff0000",
            align: "center"
          },
          ...HISTORY.map(h => ({
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: `${h.round}`, flex: 1 },
              { type: "text", text: `${h.d1}-${h.d2}-${h.d3}`, flex: 3 },
              {
                type: "text",
                text: `${h.sum}`,
                flex: 1,
                align: "center",
                color: "#000000",
                backgroundColor: h.sum >= 11 ? "#ff0000" : "#ffff00"
              }
            ]
          }))
        ]
      }
    }
  };
}

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  if (!verify(req)) return res.sendStatus(403);

  const event = req.body.events[0];
  if (!event || event.type !== "message") return res.sendStatus(200);

  const text = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  if (!USERS[userId]) USERS[userId] = { credit: 1000 };

  // ---------- OPEN / CLOSE ----------
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

  // ---------- BET ----------
  if (text.includes("/")) {
    if (!OPEN) {
      await reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับแทง" }]);
      return res.sendStatus(200);
    }

    const [num, amt] = text.split("/");
    const money = parseInt(amt);

    if (USERS[userId].credit < money) {
      await reply(replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);
      return res.sendStatus(200);
    }

    USERS[userId].credit -= money;
    await reply(replyToken, [
      { type: "text", text: `✅ รับโพย ${text}\nคงเหลือ ${USERS[userId].credit}` }
    ]);
    return res.sendStatus(200);
  }

  // ---------- RESULT ----------
  if (text.startsWith("S")) {
    const n = text.replace("S", "").split("");
    if (n.length !== 3) {
      await reply(replyToken, [{ type: "text", text: "❌ ใช้ S123" }]);
      return res.sendStatus(200);
    }

    const d1 = +n[0], d2 = +n[1], d3 = +n[2];
    const sum = d1 + d2 + d3;

    LAST_RESULT = { round: ROUND, d1, d2, d3, sum };
    HISTORY.unshift(LAST_RESULT);
    if (HISTORY.length > 12) HISTORY.pop();

    await reply(replyToken, [
      flexDice(d1, d2, d3, sum),
      { type: "text", text: `🎯 เปิดที่ ${ROUND}` }
    ]);

    ROUND++;
    OPEN = false;
    return res.sendStatus(200);
  }

  // ---------- BACK ----------
  if (text === "BACK") {
    if (!LAST_RESULT) {
      await reply(replyToken, [{ type: "text", text: "❌ ไม่มีผลให้ย้อน" }]);
      return res.sendStatus(200);
    }
    HISTORY.shift();
    ROUND--;
    LAST_RESULT = null;
    await reply(replyToken, [{ type: "text", text: "♻️ ย้อนผลแล้ว" }]);
    return res.sendStatus(200);
  }

  // ---------- HISTORY ----------
  if (text === "H") {
    await reply(replyToken, [flexHistory()]);
    return res.sendStatus(200);
  }

  // ---------- CREDIT ----------
  if (text === "C") {
    await reply(replyToken, [
      { type: "text", text: `💰 เครดิตคงเหลือ ${USERS[userId].credit}` }
    ]);
    return res.sendStatus(200);
  }

  await reply(replyToken, [{ type: "text", text: "❌ คำสั่งไม่ถูกต้อง" }]);
  res.sendStatus(200);
});

// ================= START =================
app.listen(3000, () => console.log("BOT RUNNING"));
