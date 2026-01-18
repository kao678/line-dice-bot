const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

/* เก็บ raw body สำหรับ verify */
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ================= CONFIG =================
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID;

// ====== รูปภาพ ======
const IMG_OPEN  = "https://i.imgur.com/OPEN.png";
const IMG_CLOSE = "https://i.imgur.com/CLOSE.png";
const IMG_DICE = {
  1: "https://i.imgur.com/dice1.png",
  2: "https://i.imgur.com/dice2.png",
  3: "https://i.imgur.com/dice3.png",
  4: "https://i.imgur.com/dice4.png",
  5: "https://i.imgur.com/dice5.png",
  6: "https://i.imgur.com/dice6.png"
};

// ================= MEMORY =================
let OPEN = false;
let ROUND = 1;

const USERS = {}; 
// userId: { name, credit, totalBet }

const HISTORY = [];

// ================= VERIFY =================
function verify(req) {
  const sig = req.headers["x-line-signature"];
  if (!sig) return false;
  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(req.rawBody)
    .digest("base64");
  return sig === hash;
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

// ================= FLEX =================
function flexHowToBet() {
  return {
    type: "flex",
    altText: "วิธีการแทงถั่ว KRMOBILE.37",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#111111" } },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "🎲 KRMOBILE.37", weight: "bold", size: "xl", color: "#ff3b3b", align: "center" },
          { type: "text", text: "วิธีการแทงถั่วบางซื่อ", size: "sm", color: "#cccccc", align: "center" },
          { type: "separator", margin: "md", color: "#333333" },

          { type: "text", text: "1/100 = แทง 1 ⬜", color: "#ffffff", size: "sm" },
          { type: "text", text: "2/100 = แทง 2 🟩", color: "#00ff6a", size: "sm" },
          { type: "text", text: "3/100 = แทง 3 🟨", color: "#f1c40f", size: "sm" },
          { type: "text", text: "4/100 = แทง 4 🟥", color: "#ff3b3b", size: "sm" },

          { type: "separator", margin: "md", color: "#333333" },

          { type: "text", text: "🎯 แทงพิเศษ", weight: "bold", color: "#ffffff" },
          { type: "text", text: "123/20 = แทงสเปรย์ (จ่าย 25 ต่อ)", size: "sm", color: "#cccccc" },
          { type: "text", text: "555/20 = แทงเป่า (จ่าย 100 ต่อ)", size: "sm", color: "#cccccc" },

          { type: "separator", margin: "md", color: "#333333" },
          { type: "text", text: "🇹🇭 โปร่งใส ซื่อตรง บริการทุกระดับ 🇹🇭", size: "xs", color: "#aaaaaa", align: "center" },
          { type: "text", text: "💯 ฝาก–ถอนได้ 24 ชม. ไม่จำกัด 💯", size: "xs", color: "#aaaaaa", align: "center" },
          { type: "text", text: "🕒 เปิดให้บริการ 24 ชั่วโมง 🕕", size: "xs", color: "#aaaaaa", align: "center" },
        ]
      }
    }
  };
}

// ================= ROUTE =================
app.get("/", (req, res) => {
  res.send("LINE DICE BOT : RUNNING");
});

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  try {
    if (!verify(req)) return res.sendStatus(200);

    const event = req.body.events?.[0];
    if (!event || event.type !== "message") return res.sendStatus(200);

    const text = event.message.text?.trim();
    const replyToken = event.replyToken;
    const userId = event.source.userId;

    if (!USERS[userId]) {
      USERS[userId] = { name: "สมาชิก", credit: 1000, totalBet: 0 };
    }

    // ===== INFO =====
    if (text === "INFO") {
      await reply(replyToken, flexHowToBet());
      return res.sendStatus(200);
    }

    // ===== เปิด =====
    if (text === "O" && userId === ADMIN_ID) {
      OPEN = true;
      await reply(replyToken, [
        { type: "image", originalContentUrl: IMG_OPEN, previewImageUrl: IMG_OPEN },
        { type: "text", text: "🟢 เปิดรับเดิมพัน\nรอบที่ " + ROUND }
      ]);
      return res.sendStatus(200);
    }

    // ===== ปิด =====
    if (text === "X" && userId === ADMIN_ID) {
      OPEN = false;
      await reply(replyToken, [
        { type: "image", originalContentUrl: IMG_CLOSE, previewImageUrl: IMG_CLOSE },
        { type: "text", text: "🔴 ปิดรับเดิมพัน" }
      ]);
      return res.sendStatus(200);
    }

    // ===== แทง =====
    if (/^\d+\/\d+$/.test(text)) {
      if (!OPEN) {
        await reply(replyToken, { type: "text", text: "❌ ยังไม่เปิดรับแทง" });
        return res.sendStatus(200);
      }

      const [, amount] = text.split("/").map(Number);
      if (USERS[userId].credit < amount) {
        await reply(replyToken, { type: "text", text: "❌ เครดิตไม่พอ" });
        return res.sendStatus(200);
      }

      USERS[userId].credit -= amount;
      USERS[userId].totalBet += amount;

      await reply(replyToken, {
        type: "text",
        text: `✅ รับโพย ${text}\nเครดิตคงเหลือ ${USERS[userId].credit}`
      });
      return res.sendStatus(200);
    }

    // ===== ออกผล =====
    if (/^S\d{3}$/.test(text) && userId === ADMIN_ID) {
      const d = text.replace("S", "").split("").map(Number);
      const sum = d.reduce((a, b) => a + b, 0);

      ROUND++;
      OPEN = false;

      await reply(replyToken, [
        { type: "image", originalContentUrl: IMG_DICE[d[0]], previewImageUrl: IMG_DICE[d[0]] },
        { type: "image", originalContentUrl: IMG_DICE[d[1]], previewImageUrl: IMG_DICE[d[1]] },
        { type: "image", originalContentUrl: IMG_DICE[d[2]], previewImageUrl: IMG_DICE[d[2]] },
        { type: "text", text: `🎲 ผลออก ${d.join("-")} = ${sum}` }
      ]);
      return res.sendStatus(200);
    }

    // ===== เครดิต =====
    if (text === "C") {
      await reply(replyToken, { type: "text", text: `💰 เครดิต ${USERS[userId].credit}` });
      return res.sendStatus(200);
    }

    await reply(replyToken, { type: "text", text: "❌ คำสั่งไม่ถูกต้อง" });
    return res.sendStatus(200);

  } catch (e) {
    console.error(e);
    return res.sendStatus(200);
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("BOT RUNNING ON", PORT);
});
