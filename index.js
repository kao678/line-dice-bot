const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID;

/* ================= DB ================= */
const DB_PATH = path.join(__dirname, "storage", "db.json");

function loadDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

/* ================= VERIFY ================= */
function verify(req) {
  const sig = req.headers["x-line-signature"];
  if (!sig) return false;
  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(JSON.stringify(req.body))
    .digest("base64");
  return sig === hash;
}

/* ================= REPLY ================= */
async function reply(token, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken: token, messages },
    {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

/* ================= ROUTE ================= */
app.get("/", (req, res) => {
  res.send("LINE BOT SELL VERSION : RUNNING");
});

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  try {
    if (!verify(req)) return res.sendStatus(403);
    if (!req.body.events) return res.sendStatus(200);

    const event = req.body.events[0];
    if (!event || event.type !== "message") return res.sendStatus(200);

    const replyToken = event.replyToken;
    const text = event.message.text?.trim();

    const userId =
      event.source.userId ||
      event.source.groupId ||
      event.source.roomId;

    const groupId = event.source.groupId || null;

    let db = loadDB();

    /* ===== ล็อกกลุ่มเดียว (อัตโนมัติ) ===== */
    if (!db.config.groupId && groupId && userId === ADMIN_ID) {
      db.config.groupId = groupId;
      saveDB(db);
    }

    if (db.config.groupId && groupId !== db.config.groupId) {
      return res.sendStatus(200); // เงียบถ้าไม่ใช่กลุ่มนี้
    }

    /* ===== เพิ่มแอดมิน ===== */
    if (!db.config.admins.includes(ADMIN_ID)) {
      db.config.admins.push(ADMIN_ID);
      saveDB(db);
    }

    /* ===== init สมาชิก ===== */
    if (!db.members[userId]) {
      db.members[userId] = {
        credit: 1000,
        blocked: false,
        totalRound: 0
      };
      saveDB(db);
    }

    /* ===== คำสั่งพื้นฐาน ===== */

    // เช็คเครดิต
    if (text === "C") {
      await reply(replyToken, [
        { type: "text", text: `💰 เครดิต ${db.members[userId].credit}` }
      ]);
      return res.sendStatus(200);
    }

    // เปิดรับเดิมพัน
    if (text === "O" && db.config.admins.includes(userId)) {
      db.config.open = true;
      saveDB(db);
      await reply(replyToken, [{ type: "text", text: "🟢 เปิดรับเดิมพัน" }]);
      return res.sendStatus(200);
    }

    // ปิดรับเดิมพัน
    if (text === "X" && db.config.admins.includes(userId)) {
      db.config.open = false;
      saveDB(db);
      await reply(replyToken, [{ type: "text", text: "🔴 ปิดรับเดิมพัน" }]);
      return res.sendStatus(200);
    }

    // แทง 1/100
    if (/^\d+\/\d+$/.test(text)) {
      if (!db.config.open) {
        await reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับแทง" }]);
        return res.sendStatus(200);
      }

      const [, amount] = text.split("/").map(Number);

      if (db.members[userId].credit < amount) {
        await reply(replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);
        return res.sendStatus(200);
      }

      db.members[userId].credit -= amount;
      db.members[userId].totalRound += 1;
      saveDB(db);

      await reply(replyToken, [
        { type: "text", text: `✅ รับโพย ${text}` }
      ]);
      return res.sendStatus(200);
    }

    await reply(replyToken, [{ type: "text", text: "❌ คำสั่งไม่ถูกต้อง" }]);
    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(200);
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("BOT RUNNING (SELL VERSION)"));
