const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN;

// เก็บโพยชั่วคราว (เวอร์ชันพื้นฐาน)
let bets = [];

// webhook
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") {
      return res.sendStatus(200);
    }

    const text = event.message.text.trim();
    let replyText = "❌ คำสั่งไม่ถูกต้อง";

    // แทงถั่ว
    if (text.startsWith("แทงถั่ว")) {
      const parts = text.split(" ");
      if (parts.length === 3) {
        const side = parts[1]; // ดำ / แดง
        const amount = parseInt(parts[2]);

        if ((side === "ดำ" || side === "แดง") && amount > 0) {
          bets.push({
            userId: event.source.userId,
            side,
            amount
          });

          replyText = `🎲 รับโพยแล้ว\nฝั่ง: ${side}\nเงิน: ${amount}`;
        }
      }
    }

    // เปิดถั่ว
    if (text === "เปิดถั่ว") {
      const result = Math.random() < 0.5 ? "ดำ" : "แดง";
      replyText = `🎲 ผลออก: ${result}\n(กำลังคำนวณผล...)`;
    }

    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken: event.replyToken,
        messages: [{ type: "text", text: replyText }]
      },
      {
        headers: {
          Authorization: `Bearer ${LINE_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(200);
  }
});

// หน้าเช็กเซิร์ฟเวอร์
app.get("/", (req, res) => {
  res.send("LINE BOT ONLINE");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));
