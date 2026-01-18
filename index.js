const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

/* สำคัญมาก */
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ================= CONFIG =================
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID;

// ================= VERIFY =================
function verify(req) {
  const signature = req.headers["x-line-signature"];
  if (!signature) return false;

  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(req.rawBody)
    .digest("base64");

  return signature === hash;
}

// ================= REPLY =================
async function reply(replyToken, messages) {
  return axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages: Array.isArray(messages) ? messages : [messages],
    },
    {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 5000,
    }
  );
}

// ================= ROUTE =================
app.get("/", (req, res) => {
  res.send("LINE BOT RUNNING");
});

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  try {
    if (!verify(req)) {
      return res.sendStatus(200);
    }

    const event = req.body.events?.[0];
    if (!event || event.type !== "message") {
      return res.sendStatus(200);
    }

    const text = event.message.text?.trim();
    const replyToken = event.replyToken;
    const userId = event.source.userId;

    // ทดสอบตอบ
    if (text === "ping") {
      await reply(replyToken, {
        type: "text",
        text: "pong ✅",
      });
      return res.sendStatus(200);
    }

    if (text === "C") {
      await reply(replyToken, {
        type: "text",
        text: "💰 เครดิต 1000",
      });
      return res.sendStatus(200);
    }

    if (text === "O" && userId === ADMIN_ID) {
      await reply(replyToken, {
        type: "text",
        text: "🟢 เปิดรับเดิมพัน",
      });
      return res.sendStatus(200);
    }

    await reply(replyToken, {
      type: "text",
      text: "❌ คำสั่งไม่ถูกต้อง",
    });

    return res.sendStatus(200);
  } catch (err) {
    console.error("WEBHOOK ERROR:", err.message);
    return res.sendStatus(200);
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("BOT RUNNING ON", PORT);
});
