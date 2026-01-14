// ================== IMPORT ==================
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ================== CONFIG ==================
const LINE_TOKEN = process.env.LINE_TOKEN;
const PORT = process.env.PORT || 3000;

// ================== MEMORY DB ==================
const ROOMS = {};        // roomId => room data
const USERS = {};        // userId => { credit, name }
const ADMINS = new Set(); // admin userId
let CURRENT_RESULT = null;
let HISTORY = [];

// ================== LINE REPLY ==================
async function reply(token, messages) {
  return axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken: token, messages },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// ================== FLEX : ลูกเต๋า 3 ลูก ==================
function flexDice(dices, sum) {
  return {
    type: "flex",
    altText: `ผลออก ${sum}`,
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#1a1a1a" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "md",
            contents: dices.map(n => ({
              type: "image",
              url: `https://raw.githubusercontent.com/kao678/dice-img/main/${n}.png`,
              size: "sm",
            })),
          },
          {
            type: "text",
            text: `${sum}`,
            size: "xxl",
            weight: "bold",
            align: "center",
            color: "#FFD700",
            margin: "lg",
          },
        ],
      },
    },
  };
}

// ================== FLEX : การ์ดเครดิต ==================
function flexCredit(name, credit, code) {
  return {
    type: "flex",
    altText: "เครดิต",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#222" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: name, weight: "bold", color: "#ff3333" },
          { type: "text", text: `คงเหลือ ${credit.toLocaleString()} บาท`, color: "#00ff66", size: "lg" },
          { type: "text", text: `ID: ${code}`, size: "sm", color: "#999" },
        ],
      },
    },
  };
}

// ================== UTIL ==================
function isAdmin(userId) {
  if (ADMINS.size === 0) ADMINS.add(userId);
  return ADMINS.has(userId);
}

function getUser(userId) {
  if (!USERS[userId]) {
    USERS[userId] = { credit: 0, name: "ไม่ระบุชื่อ" };
  }
  return USERS[userId];
}

// ================== WEBHOOK ==================
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") return res.sendStatus(200);

    const userId = event.source.userId;
    const text = event.message.text?.trim();
    const replyToken = event.replyToken;

    const user = getUser(userId);

    // ===== userid =====
    if (text === "userid") {
      await reply(replyToken, [{ type: "text", text: `ID: ${userId}` }]);
      return res.sendStatus(200);
    }

    // ===== ตั้งชื่อ =====
    if (text.startsWith("NM/")) {
      user.name = text.split("/")[1];
      await reply(replyToken, [{ type: "text", text: `✅ บันทึกชื่อ ${user.name}` }]);
      return res.sendStatus(200);
    }

    // ================= ADMIN =================
    if (isAdmin(userId)) {

      // เปิด / ปิด รับเดิมพัน
      if (text === "O") {
        await reply(replyToken, [{ type: "text", text: "🟢 เปิดรับเดิมพัน" }]);
        return res.sendStatus(200);
      }
      if (text === "X") {
        await reply(replyToken, [{ type: "text", text: "🔴 ปิดรับเดิมพัน" }]);
        return res.sendStatus(200);
      }

      // ออกผล S123
      if (text.startsWith("S")) {
        const nums = text.replace("S", "").split("").map(n => parseInt(n));
        if (nums.length === 3) {
          const sum = nums.reduce((a, b) => a + b, 0);
          CURRENT_RESULT = { nums, sum };
          HISTORY.unshift(CURRENT_RESULT);
          await reply(replyToken, [flexDice(nums, sum)]);
        }
        return res.sendStatus(200);
      }

      // BACK
      if (text === "BACK") {
        HISTORY.shift();
        CURRENT_RESULT = HISTORY[0] || null;
        await reply(replyToken, [{ type: "text", text: "↩️ ย้อนผลแล้ว" }]);
        return res.sendStatus(200);
      }

      // RESET / รีรอบ
      if (text === "RESET" || text === "รีรอบ") {
        CURRENT_RESULT = null;
        await reply(replyToken, [{ type: "text", text: "♻️ รีรอบเรียบร้อย" }]);
        return res.sendStatus(200);
      }

      // เติม / ลบ เครดิต
      if (/X\d+[+-]\d+/.test(text)) {
        const [code, amount] = text.split(/([+-])/);
        const uid = Object.keys(USERS).find(u => u.endsWith(code.replace("X", "")));
        if (uid) {
          USERS[uid].credit += parseInt(amount);
          await reply(replyToken, [{ type: "text", text: "✅ ปรับเครดิตแล้ว" }]);
        }
        return res.sendStatus(200);
      }
    }

    // ================= USER =================

    // แทง 1/999
    if (/^\d+\/\d+$/.test(text)) {
      const [face, amt] = text.split("/").map(Number);
      user.credit -= amt;
      await reply(replyToken, [{ type: "text", text: `✅ รับโพย ${face}/${amt}` }]);
      return res.sendStatus(200);
    }

    // เช็คเครดิต
    if (text === "C") {
      await reply(replyToken, [flexCredit(user.name, user.credit, userId.slice(-4))]);
      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(200);
  }
});

app.listen(PORT, () => console.log("BOT RUN", PORT));
