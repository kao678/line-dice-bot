const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

// ================= CONFIG =================
const CHANNEL_ACCESS_TOKEN = "+VPA52bvvqo8JEt5SWZxIUzLsp64QIp5UgQx7tDUu7eAxAfyJtYS+7WoZEJnudS+A8ZLDk3SZHUEAPLnY77BkBi7Tk8fxH+4hiNb1IfwoZxw7g0zvRbDXSApXTWNastwPJ8ztAg+6WeUic/6fmXypQdB04t89/1O/w1cDnyilFU=";
const CHANNEL_SECRET = "c158c823bb61a75d4ac5deac322c3f85";
const PORT = process.env.PORT || 3000;

// ================= STATE =================
let OPEN = false;
let ROUND = 1;
let LAST_RESULT = null;

const USERS = {}; // userId: { credit, name }
const HISTORY = [];
const ADMINS = new Set(); // ล็อกแอดมิน

// ================= VERIFY =================
function verify(req) {
  const signature = req.headers["x-line-signature"];
  const body = JSON.stringify(req.body);
  const hash = crypto.createHmac("sha256", CHANNEL_SECRET).update(body).digest("base64");
  return hash === signature;
}

// ================= REPLY =================
async function reply(replyToken, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken, messages },
    { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" } }
  );
}

// ================= FLEX =================
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
          { type: "box", layout: "horizontal", contents: dice },
          {
            type: "text",
            text: `ผลรวม ${sum}`,
            weight: "bold",
            align: "center",
            size: "xl",
            color: sum >= 11 ? "#FF0000" : "#FFD700",
            margin: "md"
          }
        ]
      }
    }
  };
}

function flexCredit(name, credit, shortId) {
  return {
    type: "flex",
    altText: "เครดิต",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1A1A1A",
        contents: [
          { type: "text", text: name, weight: "bold", size: "lg", color: "#00FF00" },
          { type: "text", text: `คงเหลือ ${credit}`, size: "xl", weight: "bold", color: "#FFFFFF", margin: "md" },
          { type: "separator", margin: "md" },
          { type: "text", text: `ID: ${shortId}`, size: "sm", color: "#AAAAAA", margin: "md" }
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
        contents: [
          { type: "text", text: "📊 สถิติย้อนหลัง", weight: "bold", align: "center", color: "#FF0000" },
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
                backgroundColor: h.sum >= 11 ? "#FF0000" : "#FFD700"
              }
            ]
          }))
        ]
      }
    }
  };
}

// ================= UTIL =================
function getUser(userId) {
  if (!USERS[userId]) USERS[userId] = { credit: 1000, name: "ไม่ระบุชื่อ" };
  return USERS[userId];
}
function isAdmin(userId) {
  if (ADMINS.size === 0) ADMINS.add(userId); // คนแรกเป็นแอดมิน
  return ADMINS.has(userId);
}

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  if (!verify(req)) return res.sendStatus(403);

  const event = req.body.events?.[0];
  if (!event || event.type !== "message") return res.sendStatus(200);

  const text = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  const user = getUser(userId);

  // ===== ตั้งชื่อ =====
  if (text.startsWith("NM/")) {
    user.name = text.replace("NM/", "").trim();
    await reply(replyToken, [{ type: "text", text: `✅ ตั้งชื่อ ${user.name}` }]);
    return res.sendStatus(200);
  }

  // ================= ADMIN =================
  if (isAdmin(userId)) {
    if (text === "O" || text === "OPEN") {
      OPEN = true;
      await reply(replyToken, [{ type: "text", text: "🟢 เปิดรับเดิมพัน" }]);
      return res.sendStatus(200);
    }
    if (text === "X" || text === "CLOSE") {
      OPEN = false;
      await reply(replyToken, [{ type: "text", text: "🔴 ปิดรับเดิมพัน" }]);
      return res.sendStatus(200);
    }
    if (text === "RESET") {
      OPEN = false; LAST_RESULT = null;
      await reply(replyToken, [{ type: "text", text: "♻️ รีเซ็ตเรียบร้อย" }]);
      return res.sendStatus(200);
    }
    if (text === "BACK") {
      HISTORY.shift();
      ROUND = Math.max(1, ROUND - 1);
      await reply(replyToken, [{ type: "text", text: "↩️ ย้อนผลแล้ว" }]);
      return res.sendStatus(200);
    }
    // เติม/ลบเครดิต X0001+999 / X0001-999
    if (/^X\d+[+-]\d+$/.test(text)) {
      const [, code, sign, amt] = text.match(/^X(\d+)([+-])(\d+)$/);
      const targetId = Object.keys(USERS).find(u => u.endsWith(code));
      if (!targetId) {
        await reply(replyToken, [{ type: "text", text: "❌ ไม่พบสมาชิก" }]);
        return res.sendStatus(200);
      }
      USERS[targetId].credit += sign === "+" ? +amt : -amt;
      await reply(replyToken, [{ type: "text", text: "✅ ปรับเครดิตแล้ว" }]);
      return res.sendStatus(200);
    }
    // เช็คเครดิตสมาชิก X0001 CR
    if (/^X\d+\sCR$/.test(text)) {
      const code = text.match(/^X(\d+)\sCR$/)[1];
      const targetId = Object.keys(USERS).find(u => u.endsWith(code));
      if (!targetId) {
        await reply(replyToken, [{ type: "text", text: "❌ ไม่พบสมาชิก" }]);
        return res.sendStatus(200);
      }
      const t = USERS[targetId];
      await reply(replyToken, [flexCredit(t.name, t.credit, targetId.slice(-4))]);
      return res.sendStatus(200);
    }
    // ออกผล
    if (text.startsWith("S")) {
      const nums = text.replace("S", "").split("").map(Number);
      if (nums.length !== 3) {
        await reply(replyToken, [{ type: "text", text: "❌ ใช้ S123" }]);
        return res.sendStatus(200);
      }
      const [d1, d2, d3] = nums;
      const sum = d1 + d2 + d3;
      LAST_RESULT = { round: ROUND, d1, d2, d3, sum };
      HISTORY.unshift(LAST_RESULT);
      if (HISTORY.length > 12) HISTORY.pop();
      await reply(replyToken, [flexDice(d1, d2, d3, sum), { type: "text", text: `🎯 เปิดที่ ${ROUND}` }]);
      ROUND++; OPEN = false;
      return res.sendStatus(200);
    }
  }

  // ================= USER =================
  if (/^\d+\/\d+$/.test(text)) {
    if (!OPEN) {
      await reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับแทง" }]);
      return res.sendStatus(200);
    }
    const [, amt] = text.split("/");
    const money = parseInt(amt);
    if (user.credit < money) {
      await reply(replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);
      return res.sendStatus(200);
    }
    user.credit -= money;
    await reply(replyToken, [{ type: "text", text: `✅ รับโพย ${text}` }]);
    return res.sendStatus(200);
  }

  if (text === "C") {
    await reply(replyToken, [flexCredit(user.name, user.credit, userId.slice(-4))]);
    return res.sendStatus(200);
  }

  if (text === "H") {
    await reply(replyToken, [flexHistory()]);
    return res.sendStatus(200);
  }

  await reply(replyToken, [{ type: "text", text: "❌ คำสั่งไม่ถูกต้อง" }]);
  res.sendStatus(200);
});

// ================= START =================
app.listen(PORT, () => console.log("BOT RUNNING"));
