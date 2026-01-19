// ===== LINE Dice Bot : Single-file Production (FIXED) =====
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
app.use(express.json({ limit: "2mb" }));

// ===== CONFIG =====
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID || "";

// ===== STATE =====
let BET_OPEN = true;
let HISTORY = [];
let ROUND = 1;

// ===== UTIL =====
function reply(token, messages) {
  return axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken: token,
      messages: Array.isArray(messages) ? messages : [messages]
    },
    {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

function ok200(res) {
  res.status(200).send("OK");
}

// ===== SIGNATURE VERIFY =====
function verify(req) {
  const signature = req.headers["x-line-signature"];
  const body = JSON.stringify(req.body);
  const hash = crypto
    .createHmac("sha256", CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return hash === signature;
}

// ===== FLEX =====
function flexAdminStatus() {
  return {
    type: "flex",
    altText: "สถานะรอบ",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "แอดมินควบคุมรอบ", weight: "bold", align: "center" },
          {
            type: "text",
            text: BET_OPEN ? "🟢 เปิดรับเดิมพัน" : "🔴 ปิดรับเดิมพัน",
            align: "center",
            margin: "md"
          }
        ]
      }
    }
  };
}

function flexSlip({ bet, deduct, balance }) {
  return {
    type: "flex",
    altText: "ใบรับโพย",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "📄 ใบรับโพย", weight: "bold", size: "lg" },
          { type: "separator", margin: "md" },
          { type: "text", text: `🎯 โพย : ${bet}`, margin: "md" },
          { type: "text", text: `💸 หัก : ${deduct}` },
          { type: "text", text: `💰 คงเหลือ : ${balance}` }
        ]
      }
    }
  };
}

function flexResult(d1, d2, d3) {
  const sum = d1 + d2 + d3;
  const result = sum <= 7 ? "ต่ำ" : sum <= 11 ? "กลาง" : "สูง";

  return {
    type: "flex",
    altText: "ผลออก",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "🎲 ผลออก", weight: "bold", size: "lg", align: "center" },
          {
            type: "text",
            text: `${d1} • ${d2} • ${d3}`,
            size: "xl",
            align: "center",
            margin: "md"
          },
          {
            type: "text",
            text: `ผลรวม : ${sum} (${result})`,
            align: "center",
            margin: "sm"
          }
        ]
      }
    }
  };
}

function flexHistory(rows) {
  return {
    type: "flex",
    altText: "สถิติย้อนหลัง",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "📊 สถิติย้อนหลัง 12 รอบ", weight: "bold" },
          ...rows.map(r => ({
            type: "text",
            text: `รอบ ${r.round} : ${r.dice.join("-")} = ${r.result}`,
            size: "sm",
            margin: "sm"
          }))
        ]
      }
    }
  };
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  ok200(res);
  if (!verify(req)) return;

  const event = req.body.events?.[0];
  if (!event || event.type !== "message" || event.message.type !== "text") return;

  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId = event.source.userId;
  const isAdmin = ADMIN_ID && userId === ADMIN_ID;

  try {
    // ===== ADMIN =====
    if (isAdmin) {
      if (text === "O") {
        BET_OPEN = true;
        return reply(replyToken, flexAdminStatus());
      }
      if (text === "X") {
        BET_OPEN = false;
        return reply(replyToken, flexAdminStatus());
      }
      if (/^S\d{3}$/.test(text)) {
        const d1 = +text[1];
        const d2 = +text[2];
        const d3 = +text[3];
        const sum = d1 + d2 + d3;
        const result = sum <= 7 ? "ต่ำ" : sum <= 11 ? "กลาง" : "สูง";

        HISTORY.unshift({ round: ROUND++, dice: [d1, d2, d3], result });
        HISTORY = HISTORY.slice(0, 12);

        return reply(replyToken, [
          flexResult(d1, d2, d3),
          flexHistory(HISTORY)
        ]);
      }
    }

    // ===== USER =====
    if (/^\d+\/\d+$/.test(text)) {
      if (!BET_OPEN) {
        return reply(replyToken, { type: "text", text: "❌ ปิดรับเดิมพัน" });
      }
      return reply(replyToken, flexSlip({
        bet: text,
        deduct: 100,
        balance: 4900
      }));
    }

  } catch (e) {
    console.error(e);
  }
});

// ===== HEALTH =====
app.get("/", (_, res) => res.send("LINE DICE BOT RUNNING"));

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUN", PORT));
