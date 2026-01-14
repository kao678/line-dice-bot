const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ===== CONFIG =====
const LINE_TOKEN = process.env.LINE_TOKEN;
const PORT = process.env.PORT || 3000;

// ===== MEMORY =====
const ROOMS = {};
const USER_ROOM = {};
const ADMINS = new Set();
const BLOCKED = new Set();

// ===== LINE REPLY =====
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

// ===== FLEX =====
const flex = (title, value, color="#00ff99") => ({
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
        { type: "text", text: value, size: "xl", color }
      ]
    }
  }
});

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") return res.sendStatus(200);

    const userId = event.source.userId;
    const text = event.message.text.trim();
    const token = event.replyToken;

    if (ADMINS.size === 0) ADMINS.add(userId);
    if (BLOCKED.has(userId)) {
      await reply(token,[{type:"text",text:"⛔ คุณถูกบล็อก"}]);
      return res.sendStatus(200);
    }

    // userid
    if (text === "userid") {
      await reply(token,[{type:"text",text:`🆔 ${userId}`}]);
      return res.sendStatus(200);
    }

    // สร้างห้อง
    if (text.startsWith("สร้างห้อง ")) {
      if (!ADMINS.has(userId)) return res.sendStatus(200);
      const roomId = text.split(" ")[1];
      ROOMS[roomId] = { owner:userId, open:false, users:{}, bets:[], last:null };
      await reply(token,[{type:"text",text:`✅ สร้างห้อง ${roomId}`}]);
      return res.sendStatus(200);
    }

    // เข้าห้อง
    if (text.startsWith("เข้าห้อง ")) {
      const roomId = text.split(" ")[1];
      if (!ROOMS[roomId]) {
        await reply(token,[{type:"text",text:"❌ ไม่พบห้อง"}]);
        return res.sendStatus(200);
      }
      USER_ROOM[userId] = roomId;
      ROOMS[roomId].users[userId] ||= { credit:1000 };
      await reply(token,[{type:"text",text:`🏠 เข้าห้อง ${roomId}`}]);
      return res.sendStatus(200);
    }

    const roomId = USER_ROOM[userId];
    if (!roomId) {
      await reply(token,[{type:"text",text:"พิมพ์: เข้าห้อง ห้องID"}]);
      return res.sendStatus(200);
    }

    const room = ROOMS[roomId];
    const user = room.users[userId];

    // เปิด / ปิด
    if (text === "O" && userId === room.owner) {
      room.open = true;
      await reply(token,[{type:"text",text:"🟢 เปิดรับเดิมพัน"}]);
      return res.sendStatus(200);
    }
    if (text === "X" && userId === room.owner) {
      room.open = false;
      await reply(token,[{type:"text",text:"🔴 ปิดรับเดิมพัน"}]);
      return res.sendStatus(200);
    }

    // แทง
    if (text.includes("/")) {
      if (!room.open) {
        await reply(token,[{type:"text",text:"❌ ยังไม่เปิด"}]);
        return res.sendStatus(200);
      }
      const [face,amt] = text.split("/");
      const amount = parseInt(amt);
      if (user.credit < amount) {
        await reply(token,[{type:"text",text:"❌ เครดิตไม่พอ"}]);
        return res.sendStatus(200);
      }
      user.credit -= amount;
      room.bets.push({ userId, face, amount });
      await reply(token,[flex("รับโพย",`${face}/${amount}`)]);
      return res.sendStatus(200);
    }

    // เช็คเครดิต
    if (text === "C") {
      await reply(token,[flex("เครดิต",`${user.credit} ฿`,"#ffff00")]);
      return res.sendStatus(200);
    }

    // ออกผล
    if (text.startsWith("S") && userId === room.owner) {
      const result = text.substring(1);
      room.last = result;
      await reply(token,[flex("ผลออก",result,"#ff3333")]);
      return res.sendStatus(200);
    }

    // รีรอบ / RESET
    if ((text==="RESET"||text==="รีรอบ") && userId===room.owner) {
      room.bets=[];
      await reply(token,[{type:"text",text:"♻️ รีรอบแล้ว"}]);
      return res.sendStatus(200);
    }

    // คืนเงิน
    if ((text==="REFUND"||text==="รีการแทง") && userId===room.owner) {
      room.bets.forEach(b=>{
        room.users[b.userId].credit+=b.amount;
      });
      room.bets=[];
      await reply(token,[{type:"text",text:"💸 คืนเงินแล้ว"}]);
      return res.sendStatus(200);
    }

    // BLOCK
    if (text.startsWith("BLOCK/") && ADMINS.has(userId)) {
      const id=text.split("/")[1];
      BLOCKED.add(id);
      await reply(token,[{type:"text",text:"⛔ บล็อกแล้ว"}]);
      return res.sendStatus(200);
    }

    await reply(token,[{type:"text",text:"❓ ไม่เข้าใจคำสั่ง"}]);
    return res.sendStatus(200);

  } catch (e) {
    console.error(e);
    return res.sendStatus(200);
  }
});

app.listen(PORT,()=>console.log("BOT RUNNING",PORT));
