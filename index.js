const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const LINE_TOKEN = process.env.LINE_TOKEN;

async function reply(replyToken, text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages: [{ type: "text", text }],
    },
    { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
  );
}

app.post("/webhook", async (req, res) => {
  const event = req.body.events[0];
  const msg = event.message.text.trim().toUpperCase();

  if (msg === "O") await reply(event.replyToken, "🟢 เปิดรับเดิมพัน");
  else if (msg === "X") await reply(event.replyToken, "🔴 ปิดรับเดิมพัน");
  else if (msg.startsWith("S"))
    await reply(event.replyToken, "🎯 ผลออก " + msg.replace("S", ""));

  res.sendStatus(200);
});

app.listen(3000);
