const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

// ===== CONFIG / ENV CHECK =====
const LINE_TOKEN  = process.env.LINE_TOKEN;
const LINE_SECRET = process.env.LINE_SECRET;
const ADMIN_ID    = process.env.ADMIN_ID;
const PORT = process.env.PORT || 3000;

if(!LINE_TOKEN || !LINE_SECRET || !ADMIN_ID){
  console.error("Missing required env vars. Please set LINE_TOKEN, LINE_SECRET, ADMIN_ID");
  process.exit(1);
}

const app = express();

// ===== HELPERS =====
// reply (uses reply API if replyToken present, otherwise push)
const reply = async (replyToken, to, messages) => {
  const payload = {
    messages: Array.isArray(messages) ? messages : [messages]
  };

  const headers = {
    Authorization: `Bearer ${LINE_TOKEN}`,
    "Content-Type": "application/json"
  };

  try {
    if (replyToken) {
      // reply
      await axios.post("https://api.line.me/v2/bot/message/reply", {
        replyToken,
        ...payload
      }, { headers });
      return;
    }
    // fallback: push
    if (!to) throw new Error("No replyToken and no user id to push");
    await axios.post("https://api.line.me/v2/bot/message/push", {
      to,
      ...payload
    }, { headers });
  } catch (err) {
    console.error("LINE API error:", err.response?.data || err.message);
    throw err;
  }
};

// timing-safe signature verification
const verifySignature = (rawBodyBuffer, signature) => {
  if (!signature) return false;
  const hash = crypto.createHmac("sha256", LINE_SECRET)
    .update(rawBodyBuffer).digest("base64");

  // use timingSafeEqual
  const a = Buffer.from(hash);
  const b = Buffer.from(signature);
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
};

// ===== STATE =====
let BET_OPEN = false;
let ROUND = 1;
const CREDIT = {};   // { uid: number }
const PENDING = {};  // { uid: { bet, amount } }

// ===== FLEX / UI HELPERS (unchanged logic, but keep simple) =====
const btn = (label,data)=>({
  type:"button", style:"secondary", height:"sm",
  action:{ type:"postback", label, data }
});

const flexMenu = (isAdmin)=>({
  type:"flex", altText:"เมนู",
  contents:{ type:"bubble", body:{
    type:"box", layout:"vertical", spacing:"md", contents:[
      { type:"text", text:"🎲 OPEN HOUSE", align:"center", weight:"bold", color:"#ff2d2d" },
      { type:"text", text: BET_OPEN?"🟢 เปิดรับเดิมพัน":"🔴 ปิดรับเดิมพัน",
        align:"center", color:BET_OPEN?"#2ecc71":"#ff2d2d" },
      { type:"text", text:`รอบที่ ${ROUND}`, size:"sm", align:"center", color:"#aaa" },
      { type:"separator" },

      { type:"text", text:"🎯 เลือกแทง", weight:"bold" },
      { type:"box", layout:"horizontal", spacing:"sm",
        contents:[ btn("1","BET:1"), btn("2","BET:2"), btn("3","BET:3"), btn("4","BET:4") ] },
      { type:"box", layout:"horizontal", spacing:"sm",
        contents:[ btn("123 (สเปรย์)","BET:123"), btn("555 (เป่า)","BET:555") ] },

      { type:"separator" },
      { type:"box", layout:"horizontal", spacing:"sm",
        contents:[ btn("💰 เครดิต","C"), btn("🆔 MY ID","MYID") ] },

      ...(isAdmin?[
        { type:"separator" },
        { type:"box", layout:"horizontal", spacing:"sm",
          contents:[ btn("🟢 เปิดรอบ","O"), btn("🔴 ปิดรอบ","X") ] }
      ]:[])
    ]
  }}
});

const flexAmount = (bet)=>({
  type:"flex", altText:"เลือกจำนวน",
  contents:{ type:"bubble", body:{
    type:"box", layout:"vertical", spacing:"md", contents:[
      { type:"text", text:`เลือกจำนวนเงิน (${bet})`, weight:"bold" },
      { type:"box", layout:"horizontal", spacing:"sm",
        contents:[ btn("100","AMT:100"), btn("200","AMT:200"), btn("500","AMT:500") ] },
      { type:"button", style:"secondary", action:{ type:"postback", label:"ยกเลิก", data:"CANCEL" } }
    ]
  }}
});

const flexConfirm = (bet, amount)=>({
  type:"flex", altText:"ยืนยันโพย",
  contents:{ type:"bubble", body:{
    type:"box", layout:"vertical", spacing:"md", contents:[
      { type:"text", text:"ยืนยันโพย", weight:"bold", color:"#ff2d2d" },
      { type:"text", text:`แทง: ${bet}` },
      { type:"text", text:`จำนวน: ${amount}` },
      { type:"box", layout:"horizontal", spacing:"sm",
        contents:[ btn("✅ ยืนยัน","CONFIRM"), btn("❌ ยกเลิก","CANCEL") ] }
    ]
  }}
});

// ===== MIDDLEWARE =====
// For other routes, use normal JSON parser
app.use(express.json({ limit: "2mb" }));

// For webhook we need raw buffer to verify signature exactly as received.
// We mount a raw parser only for /webhook
const rawBodyParser = express.raw({ type: "application/json", limit: "2mb" });

// ===== WEBHOOK =====
app.post("/webhook", rawBodyParser, async (req, res) => {
  // verify signature first
  const signature = req.headers["x-line-signature"];
  const rawBody = req.body; // Buffer from express.raw

  if (!verifySignature(rawBody, signature)) {
    console.warn("Invalid signature - rejecting request");
    return res.status(401).send("Invalid signature");
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch (err) {
    console.error("Invalid JSON body", err);
    return res.status(400).send("Invalid JSON");
  }

  // respond early with 200 so LINE doesn't retry while we process.
  // Still continue processing asynchronously (but keep awaited to log errors).
  res.status(200).send("OK");

  const events = Array.isArray(body.events) ? body.events : [];

  for (const ev of events) {
    // handle each event safely
    (async () => {
      try {
        const eventType = ev.type;
        let text = "";
        if (eventType === "postback") {
          // postback.data is a string we set in action.data
          text = String(ev.postback?.data || "").trim();
        } else if (eventType === "message" && ev.message?.type === "text") {
          text = String(ev.message.text || "").trim().toUpperCase();
        } else {
          // ignore other event types for now
          return;
        }

        const uid = ev.source?.userId || null;
        const replyToken = ev.replyToken || null;
        const isAdmin = uid && uid === ADMIN_ID;

        if (!uid) {
          console.warn("No userId in event source - skipping");
        }

        // ensure initial credit
        if (uid) CREDIT[uid] ??= 10000;

        // BASIC
        if (text === "MENU") {
          return await reply(replyToken, uid, flexMenu(isAdmin));
        }
        if (text === "C") {
          return await reply(replyToken, uid, { type: "text", text: `เครดิตคงเหลือ ${CREDIT[uid]}` });
        }
        if (text === "MYID") {
          return await reply(replyToken, uid, { type: "text", text: `USER ID:\n${uid}` });
        }

        // ADMIN
        if (isAdmin) {
          if (text === "O") {
            BET_OPEN = true;
            return await reply(replyToken, uid, flexMenu(true));
          }
          if (text === "X") {
            BET_OPEN = false;
            return await reply(replyToken, uid, flexMenu(true));
          }
        }

        // BET FLOW
        if (text.startsWith("BET:")) {
          if (!BET_OPEN) return await reply(replyToken, uid, { type: "text", text: "❌ ปิดรับเดิมพัน" });
          const bet = text.split(":")[1] || "";
          PENDING[uid] = { bet };
          return await reply(replyToken, uid, flexAmount(bet));
        }

        if (text.startsWith("AMT:")) {
          if (!PENDING[uid]) return;
          const amount = Number(text.split(":")[1]) || 0;
          if (amount <= 0) return await reply(replyToken, uid, { type: "text", text: "จำนวนไม่ถูกต้อง" });
          PENDING[uid].amount = amount;
          return await reply(replyToken, uid, flexConfirm(PENDING[uid].bet, amount));
        }

        if (text === "CONFIRM") {
          const p = PENDING[uid];
          if (!p) return;
          if (CREDIT[uid] < p.amount) {
            delete PENDING[uid];
            return await reply(replyToken, uid, { type: "text", text: "เครดิตไม่พอ" });
          }
          CREDIT[uid] -= p.amount;
          delete PENDING[uid];
          return await reply(replyToken, uid, {
            type: "text",
            text: `รับโพยเรียบร้อย\nหัก ${p.amount}\nคงเหลือ ${CREDIT[uid]}`
          });
        }

        if (text === "CANCEL") {
          delete PENDING[uid];
          return await reply(replyToken, uid, { type: "text", text: "ยกเลิกแล้ว" });
        }

      } catch (err) {
        console.error("Error processing event:", err);
        // try to notify user (best-effort)
        try {
          const uid = ev.source?.userId || null;
          const replyToken = ev.replyToken || null;
          if (uid || replyToken) {
            await reply(replyToken, uid, { type: "text", text: "เกิดข้อผิดพลาดภายในระบบ" });
          }
        } catch (e) {
          console.error("Failed to send error message to user", e);
        }
      }
    })();
  } // end for events
});

// ===== HEALTH =====
app.get("/", (_, res) => res.send("OPEN HOUSE BOT RUNNING"));

// ===== START =====
app.listen(PORT, () => console.log("RUN", PORT));
