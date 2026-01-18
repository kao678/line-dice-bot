const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

/* สำคัญมาก: เก็บ rawBody ไว้ verify */
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ================= CONFIG =================
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID;

// ================= MEMORY =================
let OPEN = false;
let ROUND = 1;

const USERS = {}; 
// userId: { name, credit, totalBet, totalPay }

const HISTORY = []; 
// { round, d, sum }

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

// ================= FLEX =================
function flexSummary(data) {
  return {
    type: "flex",
    altText: "สรุปยอดขั้นโปร",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#111111" } },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "🧾 สรุปยอดขั้นโปร",
            weight: "bold",
            size: "xl",
            color: "#ff3b3b",
            align: "center",
          },
          {
            type: "text",
            text: data.date,
            size: "sm",
            color: "#aaaaaa",
            align: "center",
          },
          { type: "separator", margin: "md", color: "#333333" },

          summaryRow("💰 ยอดแทงรวม", data.totalBet, "#ffffff"),
          summaryRow("📈 ยอดจ่ายลูกค้า", data.totalPay, "#ff7675"),
          summaryRow("🏦 กำไรบ้าน", data.profit, "#2ecc71"),
          summaryRow("🎲 จำนวนรอบ", data.rounds, "#f1c40f"),
        ],
      },
    },
  };
}

function summaryRow(label, value, color) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: "#bbbbbb", flex: 3 },
      {
        type: "text",
        text: value.toLocaleString() + " บาท",
        size: "sm",
        weight: "bold",
        color,
        align: "end",
        flex: 2,
      },
    ],
  };
}

function flexMemberSummary(list) {
  return {
    type: "flex",
    altText: "สรุปยอดแยกตามสมาชิก",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#111111" } },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "👥 สรุปยอดแยกตามสมาชิก",
            weight: "bold",
            size: "lg",
            color: "#ff3b3b",
            align: "center",
          },
          { type: "separator", margin: "md", color: "#333333" },
          ...list.map(u => ({
            type: "box",
            layout: "vertical",
            margin: "sm",
            contents: [
              {
                type: "text",
                text: u.name || "ไม่ระบุชื่อ",
                size: "sm",
                color: "#ffffff",
                weight: "bold",
              },
              {
                type: "text",
                text: `ยอดแทง: ${u.totalBet.toLocaleString()} บาท`,
                size: "xs",
                color: "#f1c40f",
              },
            ],
          })),
        ],
      },
    },
  };
}

// ================= ROUTE =================
app.get("/", (req, res) => {
  res.send("LINE BOT RUNNING");
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
      USERS[userId] = {
        name: "ไม่ระบุชื่อ",
        credit: 1000,
        totalBet: 0,
        totalPay: 0,
      };
    }

    // ===== ทดสอบ =====
    if (text === "ping") {
      await reply(replyToken, { type: "text", text: "pong ✅" });
      return res.sendStatus(200);
    }

    // ===== เปิด / ปิด =====
    if (text === "O" && userId === ADMIN_ID) {
      OPEN = true;
      await reply(replyToken, { type: "text", text: "🟢 เปิดรับเดิมพัน" });
      return res.sendStatus(200);
    }

    if (text === "X" && userId === ADMIN_ID) {
      OPEN = false;
      await reply(replyToken, { type: "text", text: "🔴 ปิดรับเดิมพัน" });
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
        text: `✅ รับโพย ${text}\nเครดิตคงเหลือ ${USERS[userId].credit}`,
      });
      return res.sendStatus(200);
    }

    // ===== ออกผล =====
    if (/^S\d{3}$/.test(text) && userId === ADMIN_ID) {
      const d = text.replace("S", "").split("").map(Number);
      const sum = d.reduce((a, b) => a + b, 0);

      HISTORY.unshift({ round: ROUND, d, sum });
      if (HISTORY.length > 12) HISTORY.pop();

      ROUND++;
      OPEN = false;

      await reply(replyToken, {
        type: "text",
        text: `🎲 ผลออก ${d.join("-")} = ${sum}`,
      });
      return res.sendStatus(200);
    }

    // ===== เครดิต =====
    if (text === "C") {
      await reply(replyToken, {
        type: "text",
        text: `💰 เครดิต ${USERS[userId].credit}`,
      });
      return res.sendStatus(200);
    }

    // ===== SUMMARY (แอดมิน) =====
    if (text === "SUMMARY" && userId === ADMIN_ID) {
      const totalBet = Object.values(USERS).reduce((s, u) => s + u.totalBet, 0);
      const totalPay = Object.values(USERS).reduce((s, u) => s + u.totalPay, 0);

      await reply(replyToken, flexSummary({
        date: new Date().toLocaleDateString("th-TH"),
        totalBet,
        totalPay,
        profit: totalBet - totalPay,
        rounds: ROUND - 1,
      }));
      return res.sendStatus(200);
    }

    // ===== MEMBER (แอดมิน) =====
    if (text === "MEMBER" && userId === ADMIN_ID) {
      const list = Object.values(USERS)
        .filter(u => u.totalBet > 0)
        .sort((a, b) => b.totalBet - a.totalBet);

      await reply(replyToken, flexMemberSummary(list));
      return res.sendStatus(200);
    }

    await reply(replyToken, { type: "text", text: "❌ คำสั่งไม่ถูกต้อง" });
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
