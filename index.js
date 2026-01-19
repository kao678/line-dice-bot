// ===== LINE OPEN HOUSE DICE BOT (PRODUCTION) =====
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();

// ===== RAW BODY FOR LINE VERIFY =====
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
    limit: "2mb"
  })
);

// ===== CONFIG =====
const LINE_TOKEN = process.env.LINE_TOKEN;
const LINE_SECRET = process.env.LINE_SECRET;
const ADMIN_ID = process.env.ADMIN_ID; // userId แอดมิน

// ===== GAME STATE =====
let BET_OPEN = false;
let ROUND = 1;
let HISTORY = []; // { round, dice:[d1,d2,d3], sum, result }

// ===== UTIL =====
function reply(replyToken, messages) {
  return axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages: Array.isArray(messages) ? messages : [messages]
    },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

function ok(res) {
  res.status(200).send("OK");
}

function verify(req) {
  const signature = req.headers["x-line-signature"];
  const hash = crypto
    .createHmac("sha256", LINE_SECRET)
    .update(req.rawBody)
    .digest("base64");
  return hash === signature;
}

// ===== LINE OFFICIAL DICE IMAGE =====
function diceImg(n) {
  return `https://scdn.line-apps.com/n/channel_devcenter/img/dice/dice_${n}.png`;
}

// ===== FLEX =====
function flexStatus() {
  return {
    type: "flex",
    altText: "สถานะบ้าน",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#0f0f0f" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "OPEN HOUSE",
            color: "#ff2d2d",
            weight: "bold",
            align: "center",
            size: "lg"
          },
          {
            type: "text",
            text: BET_OPEN ? "🟢 เปิดรับเดิมพัน" : "🔴 ปิดรับเดิมพัน",
            color: BET_OPEN ? "#2ecc71" : "#ff2d2d",
            align: "center",
            margin: "md",
            size: "xl",
            weight: "bold"
          },
          {
            type: "text",
            text: `รอบที่ ${ROUND}`,
            align: "center",
            size: "sm",
            color: "#aaaaaa",
            margin: "sm"
          }
        ]
      }
    }
  };
}

function flexResult(d1, d2, d3) {
  const sum = d1 + d2 + d3;
  const result = sum <= 7 ? "ต่ำ" : sum <= 11 ? "กลาง" : "สูง";
  const color =
    result === "ต่ำ"
      ? "#3498db"
      : result === "กลาง"
      ? "#f1c40f"
      : "#ff2d2d";

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
            text: "🎲 RESULT",
            align: "center",
            color: "#ff2d2d",
            weight: "bold",
            size: "lg"
          },
          {
            type: "box",
            layout: "horizontal",
            align: "center",
            spacing: "md",
            margin: "md",
            contents: [
              { type: "image", url: diceImg(d1), size: "sm" },
              { type: "image", url: diceImg(d2), size: "sm" },
              { type: "image", url: diceImg(d3), size: "sm" }
            ]
          },
          {
            type: "text",
            text: `รวม ${sum} (${result})`,
            align: "center",
            margin: "md",
            color,
            size: "lg",
            weight: "bold"
          }
        ]
      }
    }
  };
}

function flexHistory() {
  return {
    type: "flex",
    altText: "สถิติย้อนหลัง",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#111111" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "📊 สถิติย้อนหลัง",
            color: "#ff2d2d",
            weight: "bold"
          },
          ...HISTORY.map(h => ({
            type: "text",
            text: `รอบ ${h.round} : ${h.dice.join("-")} = ${h.sum} (${h.result})`,
            size: "sm",
            color: "#ffffff",
            margin: "sm"
          }))
        ]
      }
    }
  };
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  ok(res);
  if (!verify(req)) return;

  const event = req.body.events?.[0];
  if (!event || event.type !== "message" || event.message.type !== "text")
    return;

  const text = event.message.text.trim().toUpperCase();
  const replyToken = event.replyToken;
  const userId = event.source.userId;
  const isAdmin = userId === ADMIN_ID;

  try {
    // ===== ADMIN COMMAND =====
    if (isAdmin) {
      if (text === "O") {
        BET_OPEN = true;
        return reply(replyToken, flexStatus());
      }

      if (text === "X") {
        BET_OPEN = false;
        return reply(replyToken, flexStatus());
      }

      if (text === "RESET") {
        ROUND++;
        BET_OPEN = false;
        return reply(replyToken, {
          type: "text",
          text: `🔄 รีรอบ เริ่มรอบที่ ${ROUND}`
        });
      }

      if (text === "BACK") {
        if (HISTORY.length > 0) {
          HISTORY.shift();
          ROUND--;
        }
        return reply(replyToken, { type: "text", text: "↩️ ย้อนผลล่าสุด" });
      }

      if (/^S\d{3}$/.test(text)) {
        const d1 = Number(text[1]);
        const d2 = Number(text[2]);
        const d3 = Number(text[3]);
        const sum = d1 + d2 + d3;
        const result = sum <= 7 ? "ต่ำ" : sum <= 11 ? "กลาง" : "สูง";

        BET_OPEN = false;

        HISTORY.unshift({
          round: ROUND,
          dice: [d1, d2, d3],
          sum,
          result
        });

        HISTORY = HISTORY.slice(0, 12);

        return reply(replyToken, [
          flexResult(d1, d2, d3),
          flexHistory()
        ]);
      }
    }

    // ===== USER =====
    if (!BET_OPEN) {
      return reply(replyToken, {
        type: "text",
        text: "❌ ปิดรับเดิมพัน"
      });
    }

  } catch (e) {
    console.error(e);
  }
});

// ===== HEALTH =====
app.get("/", (_, res) =>
  res.send("LINE OPEN HOUSE DICE BOT : RUNNING")
);

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING ON", PORT));
