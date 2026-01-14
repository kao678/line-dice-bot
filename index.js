const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

/* ========= CONFIG ========= */
const LINE_TOKEN = process.env.LINE_TOKEN;

/* ========= DATA ========= */
// ห้องทั้งหมด
const ROOMS = {};
// ผู้ใช้กำลังอยู่ห้องไหน
const USER_ROOM = {};

/*
ROOMS = {
  roomId: {
    owner: userId,
    open: true/false,
    users: { userId: { credit } },
    bets: [ { userId, face, amount } ]
  }
}
*/

/* ========= UTIL ========= */
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

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

/* ========= FLEX ========= */
function flexBetSlip(userCode, face, amount, credit) {
  return {
    type: "flex",
    altText: "รับโพย",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#1a1a1a" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `ID ${userCode}`,
            weight: "bold",
            color: "#ff3333"
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              {
                type: "text",
                text: String(face),
                size: "xxl",
                weight: "bold",
                color: "#ffffff"
              },
              {
                type: "text",
                text: `${amount}`,
                align: "end",
                color: "#aaaaaa"
              }
            ]
          },
          { type: "separator", margin: "md" },
          {
            type: "text",
            text: `เครดิตคงเหลือ ${credit}`,
            size: "sm",
            color: "#888888",
            margin: "md"
          }
        ]
      }
    }
  };
}

function flexResult(result) {
  return {
    type: "flex",
    altText: "ผลออก",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#000000" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🎲 ผลออก",
            align: "center",
            color: "#aaaaaa"
          },
          {
            type: "text",
            text: String(result),
            size: "xxl",
            weight: "bold",
            align: "center",
            color: "#ff3333",
            margin: "md"
          }
        ]
      }
    }
  };
}

/* ========= WEBHOOK ========= */
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") return res.sendStatus(200);

    const userId = event.source.userId;
    const text = event.message.text.trim();
    const userCode = userId.slice(-4);

    /* ---- สร้างห้อง ---- */
    if (text.startsWith("สร้างห้อง ")) {
      const roomId = text.split(" ")[1];
      if (ROOMS[roomId]) {
        await reply(event.replyToken, [{ type: "text", text: "❌ ห้องนี้มีอยู่แล้ว" }]);
        return res.sendStatus(200);
      }
      ROOMS[roomId] = {
        owner: userId,
        open: false,
        users: {},
        bets: []
      };
      await reply(event.replyToken, [{ type: "text", text: `✅ สร้างห้อง ${roomId} สำเร็จ` }]);
      return res.sendStatus(200);
    }

    /* ---- เข้าห้อง ---- */
    if (text.startsWith("เข้าห้อง ")) {
      const roomId = text.split(" ")[1];
      if (!ROOMS[roomId]) {
        await reply(event.replyToken, [{ type: "text", text: "❌ ไม่พบห้องนี้" }]);
        return res.sendStatus(200);
      }
      USER_ROOM[userId] = roomId;
      if (!ROOMS[roomId].users[userId]) {
        ROOMS[roomId].users[userId] = { credit: 5000 };
      }
      await reply(event.replyToken, [{ type: "text", text: `📥 เข้าห้อง ${roomId}` }]);
      return res.sendStatus(200);
    }

    const roomId = USER_ROOM[userId];
    if (!roomId) {
      await reply(event.replyToken, [{ type: "text", text: "พิมพ์: เข้าห้อง ห้องID" }]);
      return res.sendStatus(200);
    }

    const room = ROOMS[roomId];

    /* ---- เปิด / ปิด (เจ้าของห้อง) ---- */
    if (text === "เปิด" && room.owner === userId) {
      room.open = true;
      await reply(event.replyToken, [{ type: "text", text: "🟢 เปิดรับแทง" }]);
      return res.sendStatus(200);
    }
    if (text === "ปิด" && room.owner === userId) {
      room.open = false;
      await reply(event.replyToken, [{ type: "text", text: "🔴 ปิดรับแทง" }]);
      return res.sendStatus(200);
    }

    /* ---- ดูเครดิต ---- */
    if (text === "เครดิต") {
      await reply(event.replyToken, [
        { type: "text", text: `💰 เครดิตคงเหลือ: ${room.users[userId].credit}` }
      ]);
      return res.sendStatus(200);
    }

    /* ---- รับโพย 2/100 ---- */
    if (room.open && text.match(/^\d+\/\d+$/)) {
      const [face, amount] = text.split("/").map(Number);

      if (room.users[userId].credit < amount) {
        await reply(event.replyToken, [{ type: "text", text: "❌ เครดิตไม่พอ" }]);
        return res.sendStatus(200);
      }

      room.users[userId].credit -= amount;
      room.bets.push({ userId, face, amount });

      await reply(event.replyToken, [
        flexBetSlip(userCode, face, amount, room.users[userId].credit)
      ]);
      return res.sendStatus(200);
    }

    /* ---- ออกผล (เจ้าของห้อง) ---- */
    if (text === "ออก" && room.owner === userId) {
      const result = rollDice();

      room.bets.forEach(b => {
        if (b.face === result) {
          room.users[b.userId].credit += b.amount * 2;
        }
      });

      room.bets = [];
      await reply(event.replyToken, [flexResult(result)]);
      return res.sendStatus(200);
    }

    await reply(event.replyToken, [
      { type: "text", text: "คำสั่ง: สร้างห้อง | เข้าห้อง | เปิด | ปิด | 2/100 | ออก | เครดิต" }
    ]);
    res.sendStatus(200);
  } catch (e) {
    console.log(e);
    res.sendStatus(200);
  }
});

/* ========= TEST ========= */
app.get("/", (req, res) => {
  res.send("LINE MULTI ROOM DICE BOT ONLINE");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING"));
