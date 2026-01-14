// ================= IMPORT =================
const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

// ================= CONFIG =================
const LINE_TOKEN = process.env.LINE_TOKEN;
const PORT = process.env.PORT || 3000;

// ================= MEMORY DB =================
const ROOMS = {};        // ห้องทั้งหมด
const USER_ROOM = {};   // user อยู่ห้องไหน
const ADMINS = new Set();

// ================= LINE REPLY =================
async function reply(token, messages) {
  return axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken: token, messages },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ================= FLEX =================
function flexStatus(title, value, color = "#ff3333") {
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
          { type: "text", text: title, weight: "bold", color: "#ffffff" },
          { type: "text", text: value, color, size: "lg" }
        ]
      }
    }
  };
}

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") return res.sendStatus(200);

    const userId = event.source.userId;
    const text = event.message.text.trim();
    const replyToken = event.replyToken;

    // auto admin คนแรก
    if (ADMINS.size === 0) ADMINS.add(userId);

    // ================= USERID =================
    if (text === "userid") {
      await reply(replyToken, [
        { type: "text", text: `🆔 userId:\n${userId}` }
      ]);
      return res.sendStatus(200);
    }

    // ================= CREATE ROOM =================
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
        min: 1,
        max: 999999,
      };
      await reply(replyToken, [{ type: "text", text: `✅ สร้างห้อง ${roomId} สำเร็จ` }]);
      return res.sendStatus(200);
    }

    // ================= JOIN ROOM =================
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
      await reply(replyToken, [{ type: "text", text: `📥 เข้าห้อง ${roomId}` }]);
      return res.sendStatus(200);
    }

    const roomId = USER_ROOM[userId];
    if (!roomId || !ROOMS[roomId]) {
      await reply(replyToken, [{ type: "text", text: "พิมพ์: เข้าห้อง ห้องID" }]);
      return res.sendStatus(200);
    }

    const room = ROOMS[roomId];

    // ================= ADMIN COMMAND =================
    if (ADMINS.has(userId)) {

      if (text === "O") {
        room.open = true;
        await reply(replyToken, [flexStatus("เปิดรับเดิมพัน", "OPEN", "#00ff66")]);
        return res.sendStatus(200);
      }

      if (text === "X") {
        room.open = false;
        await reply(replyToken, [flexStatus("ปิดรับเดิมพัน", "CLOSE", "#ff3333")]);
        return res.sendStatus(200);
      }

      if (text === "RESET" || text === "รีรอบ") {
        room.bets = [];
        await reply(replyToken, [{ type: "text", text: "♻️ รีรอบเรียบร้อย" }]);
        return res.sendStatus(200);
      }

      if (text.startsWith("S")) {
        const result = text.substring(1);
        await reply(replyToken, [flexStatus("ผลออก", result, "#ffaa00")]);
        room.bets = [];
        return res.sendStatus(200);
      }

      if (text.includes("+")) {
        const [uid, amount] = text.split("+");
        if (room.users[uid]) {
          room.users[uid].credit += parseInt(amount);
          await reply(replyToken, [{ type: "text", text: `➕ เติม ${amount}` }]);
        }
        return res.sendStatus(200);
      }

      if (text.includes("-")) {
        const [uid, amount] = text.split("-");
        if (room.users[uid]) {
          room.users[uid].credit -= parseInt(amount);
          await reply(replyToken, [{ type: "text", text: `➖ ลบ ${amount}` }]);
        }
        return res.sendStatus(200);
      }
    }

    // ================= USER BET =================
    if (text.includes("/")) {
      if (!room.open) {
        await reply(replyToken, [{ type: "text", text: "❌ ยังไม่เปิดรับแทง" }]);
        return res.sendStatus(200);
      }

      const [face, amount] = text.split("/");
      const bet = parseInt(amount);
      const user = room.users[userId];

      if (!user || user.credit < bet) {
        await reply(replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);
        return res.sendStatus(200);
      }

      user.credit -= bet;
      room.bets.push({ userId, face, bet });

      await reply(replyToken, [
        flexStatus("รับโพย", `${face} / ${bet}`, "#00ccff")
      ]);
      return res.sendStatus(200);
    }

    // ================= CREDIT =================
    if (text === "C") {
      await reply(replyToken, [
        { type: "text", text: `💰 เครดิต: ${room.users[userId].credit}` }
      ]);
      return res.sendStatus(200);
    }

    await reply(replyToken, [{ type: "text", text: "❌ คำสั่งไม่ถูกต้อง" }]);
    return res.sendStatus(200);

  } catch (e) {
    console.error(e);
    return res.sendStatus(200);
  }
});

// ================= START =================
app.listen(PORT, () => console.log("Bot running on", PORT));
