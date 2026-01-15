const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(express.json());

// ================= CONFIG (แก้ตรงนี้) =================
const CHANNEL_ACCESS_TOKEN = "h8DN3tQr0471j6ivcrsJnhXOyhhZpaq6EmYzZB2tCdSKexJGBLo0n0W9Ox6CXMvlA8ZLDk3SZHUEAPLnY77BkBi7Tk8fxH+4hiNb1IfwoZxi5FmWXzTzd80FQ0r+Jd5Sa9zSXobXpxSOpLDBvndg5wdB04t89/1O/w1cDnyilFU=";
const CHANNEL_SECRET = "c158c823bb61a75d4ac5deac322c3f85";
const ADMIN_ID = "Uab107367b6017b2b5fede655841f715c";

// 🔒 ระบบปล่อยเช่า
const LICENSE_EXPIRE = "2026-12-31"; // วันหมดอายุ YYYY-MM-DD
const ALLOW_DOMAIN = "line-dice-bot.onrender.com"; // โดเมนที่อนุญาต

// ================= DATABASE =================
const db = new sqlite3.Database("./bot.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      credit INTEGER DEFAULT 1000
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round INTEGER,
      d1 INTEGER,
      d2 INTEGER,
      d3 INTEGER,
      sum INTEGER,
      created DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ================= STATE =================
let OPEN = false;
let ROUND = 1;

// ================= LICENSE CHECK =================
function licenseValid(req) {
  const today = new Date().toISOString().slice(0, 10);
  if (today > LICENSE_EXPIRE) return false;

  const host = req.headers.host || "";
  if (!host.includes(ALLOW_DOMAIN)) return false;

  return true;
}

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
function diceImg(n) {
  return {
    type: "image",
    url: `https://raw.githubusercontent.com/napatsw/line-dice/main/${n}.png`,
    size: "sm"
  };
}

function flexDice(d1, d2, d3, sum) {
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
            contents: [diceImg(d1), diceImg(d2), diceImg(d3)],
            justifyContent: "center",
            spacing: "md"
          },
          {
            type: "text",
            text: `${sum}`,
            size: "5xl",
            weight: "bold",
            align: "center",
            color: sum >= 11 ? "#FF0000" : "#FFD700"
          }
        ]
      }
    }
  };
}

function flexCredit(userId, credit) {
  return {
    type: "flex",
    altText: "เครดิต",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "💰 เครดิตคงเหลือ", weight: "bold", align: "center" },
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
            text: "ID: " + userId.slice(-6),
            size: "sm",
            color: "#999",
            align: "center"
          }
        ]
      }
    }
  };
}

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("LINE DICE BOT (RENT VERSION) RUNNING");
});

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  // 🔒 เช็ค License
  if (!licenseValid(req)) return res.sendStatus(403);

  if (!verify(req)) return res.sendStatus(403);

  const event = req.body.events?.[0];
  if (!event || event.type !== "message" || event.message.type !== "text")
    return res.sendStatus(200);

  const text = event.message.text.trim();
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // สมัครผู้ใช้
  db.run(
    "INSERT OR IGNORE INTO users (userId, credit) VALUES (?, 1000)",
    [userId]
  );

  // ===== เช็คเครดิต =====
  if (text === "C") {
    db.get(
      "SELECT credit FROM users WHERE userId = ?",
      [userId],
      async (_, r) => {
        await reply(replyToken, [flexCredit(userId, r.credit)]);
      }
    );
    return res.sendStatus(200);
  }

  // ================= ADMIN =================
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
      const sum = d[0] + d[1] + d[2];

      db.run(
        "INSERT INTO history (round, d1, d2, d3, sum) VALUES (?, ?, ?, ?, ?)",
        [ROUND, d[0], d[1], d[2], sum]
      );

      await reply(replyToken, [flexDice(d[0], d[1], d[2], sum)]);

      ROUND++;
      OPEN = false;
      return res.sendStatus(200);
    }
  }

  // ================= USER BET =================
  if (/^\d+\/\d+$/.test(text)) {
    if (!OPEN) {
      await reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับแทง" }]);
      return res.sendStatus(200);
    }

    const [, amount] = text.split("/").map(Number);

    db.get(
      "SELECT credit FROM users WHERE userId = ?",
      [userId],
      async (_, r) => {
        if (r.credit < amount) {
          await reply(replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);
          return;
        }

        db.run(
          "UPDATE users SET credit = credit - ? WHERE userId = ?",
          [amount, userId]
        );

        await reply(replyToken, [
          { type: "text", text: `✅ รับโพย ${text}` }
        ]);
      }
    );

    return res.sendStatus(200);
  }

  // ดู userid (ใช้ตอนตั้งแอดมิน)
  if (text === "userid") {
    await reply(replyToken, [{ type: "text", text: userId }]);
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("LINE DICE BOT RENT VERSION RUNNING ON", PORT)
);
