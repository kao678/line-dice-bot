// ===== LINE Dice Bot : Single-file Production =====
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
app.use(express.json({ limit: "2mb" }));

// ===== CONFIG (อ่านจาก Environment เท่านั้น) =====
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;
const CHANNEL_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID || "";

// ===== BASIC STATE (เดโม / ปรับต่อได้) =====
let BET_OPEN = true;
let HISTORY = []; // เก็บ 12 รอบล่าสุด [{round, dice:[d1,d2,d3], result}]
let ROUND = 1;

// ===== UTIL =====
function reply(token, messages) {
  return axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken: token, messages: Array.isArray(messages) ? messages : [messages] },
    { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
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

// ===== FLEX TEMPLATES =====
function flexSlip({ name, uid, bet, deduct, balance }) {
  return {
    type: "flex",
    altText: "ใบรับโพย",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#1b1b1b" } },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              {
                type: "image",
                url: "https://i.imgur.com/4M34hi2.png",
                size: "sm",
                aspectMode: "cover",
                cornerRadius: "50%"
              },
              {
                type: "box",
                layout: "vertical",
                contents: [
                  { type: "text", text: name, color: "#ff3b3b", weight: "bold" },
                  { type: "text", text: `ID: ${uid}`, size: "xs", color: "#aaaaaa" }
                ]
              }
            ]
          },
          { type: "separator", margin: "md", color: "#333333" },
          { type: "text", text: `${bet}  ✔️`, size: "lg", color: "#ffffff" },
          { type: "text", text: `หักล่วงหน้า ${deduct}`, size: "sm", color: "#ff7675" },
          { type: "text", text: `คงเหลือ ${balance}`, size: "sm", color: "#2ecc71" }
        ]
      }
    }
  };
}

function diceImg(n) {
  return `https://i.imgur.com/dice${n}.png`; // เตรียมรูป dice1..dice6
}

function flexResult(d1, d2, d3) {
  return {
    type: "flex",
    altText: "ผลออก",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          { type: "image", url: diceImg(d1), size: "sm" },
          { type: "image", url: diceImg(d2), size: "sm" },
          { type: "image", url: diceImg(d3), size: "sm" }
        ]
      }
    }
  };
}

function colorByResult(n) {
  if (n === 1) return "#ffffff";
  if (n === 2) return "#2ecc71";
  if (n === 3) return "#f1c40f";
  return "#ffffff";
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
          { type: "text", text: "สถิติย้อนหลัง 12 รอบ", color: "#ff3b3b", weight: "bold", align: "center" },
          ...rows.map(r => ({
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              { type: "text", text: r.round.toString(), size: "sm", color: "#aaaaaa", flex: 1 },
              ...r.dice.map(d => ({ type: "image", url: diceImg(d), size: "xs" })),
              { type: "text", text: r.result.toString(), align: "center", color: colorByResult(r.result), weight: "bold" }
            ]
          }))
        ]
      }
    }
  };
}

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
          { type: "text", text: "แอดมินควบคุมรอบ", weight: "bold" },
          { type: "text", text: BET_OPEN ? "🟢 เปิดรับเดิมพัน" : "🔴 ปิดรับเดิมพัน" }
        ]
      }
    }
  };
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  // ตอบ 200 ทันที แก้ timeout
  ok200(res);

  if (!verify(req)) return;

  const event = req.body.events?.[0];
  if (!event || event.type !== "message" || event.message.type !== "text") return;

  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId = event.source.userId;
  const isAdmin = ADMIN_ID && userId === ADMIN_ID;

  try {
    // ===== ADMIN COMMANDS =====
    if (isAdmin) {
      if (text === "O") {
        BET_OPEN = true;
        return reply(replyToken, flexAdminStatus());
      }
      if (text === "X") {
        BET_OPEN = false;
        return reply(replyToken, flexAdminStatus());
      }
      // ออกผล S123 เช่น S661
      if (/^S\d{3}$/.test(text)) {
        const d1 = parseInt(text[1]);
        const d2 = parseInt(text[2]);
        const d3 = parseInt(text[3]);
        const sum = d1 + d2 + d3;
        const result = sum <= 7 ? 1 : sum <= 11 ? 2 : 3;

        HISTORY.unshift({ round: ROUND++, dice: [d1, d2, d3], result });
        HISTORY = HISTORY.slice(0, 12);

        await reply(replyToken, [
          flexResult(d1, d2, d3),
          flexHistory(HISTORY)
        ]);
        return;
      }
    }

    // ===== USER COMMANDS =====
    if (text === "C") {
      return reply(replyToken, {
        type: "text",
        text: "คงเหลือ 0 (เดโม)"
      });
    }

    // รับโพย 1/240
    if (/^\d+\/\d+$/.test(text)) {
      if (!BET_OPEN) {
        return reply(replyToken, { type: "text", text: "❌ ปิดรับเดิมพัน" });
      }
      return reply(replyToken, flexSlip({
        name: "สมาชิก",
        uid: "X0000",
        bet: text,
        deduct: 720,
        balance: 4811
      }));
    }

  } catch (e) {
    console.error(e.message);
  }
});

// ===== HEALTH CHECK =====
app.get("/", (_, res) => res.send("บอทลูกเต๋าไลน์: กำลังทำงาน"));

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUN", PORT));
