// ================== IMPORT ==================
const express = require("express");
const axios = require("axios");
const { handleCommand } = require("./commands");
const app = express();
app.use(express.json());

// ================== CONFIG ==================
const LINE_TOKEN = process.env.LINE_TOKEN;
const PORT = process.env.PORT || 3000;

// ================== MEMORY DB ==================
const ROOMS = {};        // ห้องเล่น
const USER_ROOM = {};   // user อยู่ห้องไหน
const ADMINS = new Set(); // admin userId

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

// ================== FLEX BASIC ==================
function flexText(title, color, value) {
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#111111" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: title, weight: "bold", color: "#ff3333" },
          { type: "text", text: value, color: color, size: "lg", align: "center" },
        ],
      },
    },
  };
}

// ================== WEBHOOK ==================
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") return res.sendStatus(200);

    const userId = event.source.userId;
    const text = event.message.text.trim();
    const replyToken = event.replyToken;

    // ================== ADMIN AUTO ==================
    if (ADMINS.size === 0) ADMINS.add(userId);

    // ================== USERID ==================
    if (text === "userid") {
      await reply(replyToken, [{ type: "text", text: `🆔 userId:\n${userId}` }]);
      return res.sendStatus(200);
    }

    // ================== CREATE ROOM ==================
    if (text.startsWith("สร้างห้อง ")) {
      if (!ADMINS.has(userId)) {
        await reply(replyToken, [{ type: "text", text: "❌ ไม่มีสิทธิ์" }]);
        return res.sendStatus(200);
      }

      const roomId = text.split(" ")[1];
      ROOMS[roomId] = {
        owner: userId,
        open: false,
        users: {},
        bets: [],
      };

      await reply(replyToken, [{ type: "text", text: `✅ สร้างห้อง ${roomId} สำเร็จ` }]);
      return res.sendStatus(200);
    }

    // ================== JOIN ROOM ==================
    if (text.startsWith("เข้าห้อง ")) {
      const roomId = text.split(" ")[1];
      if (!ROOMS[roomId]) {
        await reply(replyToken, [{ type: "text", text: "❌ ไม่พบห้องนี้" }]);
        return res.sendStatus(200);
      }

      USER_ROOM[userId] = roomId;
      if (!ROOMS[roomId].users[userId]) {
        ROOMS[roomId].users[userId] = { credit: 0 };
      }

      await reply(replyToken, [{ type: "text", text: `🏠 เข้าห้อง ${roomId}` }]);
      return res.sendStatus(200);
    }

    const roomId = USER_ROOM[userId];
    if (!roomId) {
      await reply(replyToken, [{ type: "text", text: "พิมพ์: เข้าห้อง ห้องID" }]);
      return res.sendStatus(200);
    }

    const room = ROOMS[roomId];

    // ================== OPEN / CLOSE ==================
    if (text === "O" && userId === room.owner) {
      room.open = true;
      await reply(replyToken, [flexText("เปิดรับเดิมพัน", "#00ff00", "OPEN")]);
      return res.sendStatus(200);
    }

    if (text === "X" && userId === room.owner) {
      room.open = false;
      await reply(replyToken, [flexText("ปิดรับเดิมพัน", "#ff0000", "CLOSE")]);
      return res.sendStatus(200);
    }

    // ================== CREDIT ==================
    if (text === "C") {
      const credit = room.users[userId]?.credit || 0;
      await reply(replyToken, [flexText("เครดิตคงเหลือ", "#ffff00", `${credit} บาท`)]);
      return res.sendStatus(200);
    }

    // ================== BET ==================
    if (/^\d+\/\d+$/.test(text)) {
      if (!room.open) {
        await reply(replyToken, [{ type: "text", text: "❌ ปิดรับเดิมพัน" }]);
        return res.sendStatus(200);
      }

      const [face, amount] = text.split("/").map(Number);
      room.bets.push({ userId, face, amount });

      await reply(replyToken, [
        flexText("รับเดิมพัน", "#00ffff", `${face} = ${amount} บาท`),
      ]);
      return res.sendStatus(200);
    }

    // ================== DEFAULT ==================
    await reply(replyToken, [{ type: "text", text: "❌ คำสั่งไม่ถูกต้อง" }]);
    return res.sendStatus(200);
  } catch (e) {
    console.error(e);
    return res.sendStatus(200);
  }
});

// ================== START ==================
app.listen(PORT, () => console.log("BOT RUNNING"));
