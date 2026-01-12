const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 👉 ดึง Token จาก Render
const LINE_TOKEN = process.env.LINE_TOKEN;

// รับ webhook จาก LINE
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== "message") {
      return res.sendStatus(200);
    }

    const userText = event.message.text;

    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: `บอททำงานแล้ว ✅\nคุณพิมพ์ว่า: ${userText}`
          }
        ]
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
    console.log(err);
    res.sendStatus(200);
  }
});

// หน้าเว็บทดสอบ
app.get("/", (req, res) => {
  res.send("LINE BOT ONLINE");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running");
});
