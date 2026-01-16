const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID; // userId แอดมินตัวจริง

/* ================= MEMORY ================= */
let OPEN = false;
let ROUND = 1;
let ROUND_TOTAL = 0;

const USERS = {}; // userId -> { credit }
const HISTORY = [];

/* ===== ระบบสลิป ===== */
const PENDING_SLIPS = {}; // slipId -> { userId, amount, imageUrl, time }
const SLIP_LOG = [];

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

/* ================= FLEX ================= */
function flexSlipApprove({ slipId, userId, amount, imageUrl }) {
  return {
    type: "flex",
    altText: "อนุมัติสลิป",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "💳 แจ้งเติมเงิน", weight: "bold" },
          { type: "text", text: `ผู้ใช้: ${userId.slice(-6)}` },
          { type: "text", text: `ยอด: ${amount} บาท`, color: "#27ae60" },
          { type: "image", url: imageUrl, size: "full" },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "button",
                style: "primary",
                action: {
                  type: "message",
                  label: "✅ อนุมัติ",
                  text: `APPROVE ${slipId}`
                }
              },
              {
                type: "button",
                action: {
                  type: "message",
                  label: "❌ ปฏิเสธ",
                  text: `REJECT ${slipId}`
                }
              }
            ]
          }
        ]
      }
    }
  };
}

/* ================= ROUTE ================= */
app.get("/", (req, res) => {
  res.send("LINE BOT RUNNING");
});

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  try {
    if (!req.body.events) return res.sendStatus(200);
    if (!verify(req)) return res.sendStatus(200);

    const event = req.body.events[0];
    if (!event || !event.message) return res.sendStatus(200);

    const userId = event.source.userId;
    const replyToken = event.replyToken;

    if (!USERS[userId]) USERS[userId] = { credit: 1000 };

    /* ===== รับรูปสลิป ===== */
    if (event.message.type === "image") {
      const slipId = event.message.id;
      const imageUrl = `https://api-data.line.me/v2/bot/message/${slipId}/content`;

      const amount = 500; // ตอนนี้ fix ไว้ก่อน

      PENDING_SLIPS[slipId] = {
        userId,
        amount,
        imageUrl,
        time: new Date()
      };

      await reply(replyToken, [
        { type: "text", text: "📸 รับสลิปแล้ว รอแอดมินตรวจสอบ" }
      ]);

      // ส่งให้แอดมิน
      await axios.post(
        "https://api.line.me/v2/bot/message/push",
        {
          to: ADMIN_ID,
          messages: [
            flexSlipApprove({ slipId, userId, amount, imageUrl })
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      return res.sendStatus(200);
    }

    /* ===== รับข้อความ ===== */
    const texts = event.message.text
      .split("\n")
      .map(t => t.trim())
      .filter(Boolean);

    for (const text of texts) {

      // อนุมัติสลิป
      if (text.startsWith("APPROVE") && userId === ADMIN_ID) {
        const slipId = text.split(" ")[1];
        const slip = PENDING_SLIPS[slipId];
        if (!slip) continue;

        USERS[slip.userId].credit += slip.amount;
        SLIP_LOG.push(slip);
        delete PENDING_SLIPS[slipId];

        await reply(replyToken, [
          { type: "text", text: `✅ เติมเครดิต ${slip.amount} บาทแล้ว` }
        ]);
        continue;
      }

      // ปฏิเสธสลิป
      if (text.startsWith("REJECT") && userId === ADMIN_ID) {
        const slipId = text.split(" ")[1];
        delete PENDING_SLIPS[slipId];

        await reply(replyToken, [
          { type: "text", text: "❌ ปฏิเสธสลิปแล้ว" }
        ]);
        continue;
      }

      // เช็คเครดิต
      if (text === "C") {
        await reply(replyToken, [
          { type: "text", text: `💰 เครดิต ${USERS[userId].credit}` }
        ]);
        continue;
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(200);
  }
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("BOT RUNNING"));
