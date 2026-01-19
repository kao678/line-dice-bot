require("dotenv").config();
const express = require("express");

// 👉 เรียกไฟล์ที่เราแยกไว้
const verify = require("./verify");
const { replyText } = require("./line");
const state = require("./state");

const app = express();

const {
  LINE_TOKEN,
  LINE_SECRET,
  ADMIN_ID
} = process.env;

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {

    // สำคัญมาก: ตอบ 200 ก่อน
    res.sendStatus(200);

    // ตรวจลายเซ็น LINE
    const ok = verify(
      req.body,
      req.headers["x-line-signature"],
      LINE_SECRET
    );
    if (!ok) return;

    const body = JSON.parse(req.body.toString());

    for (const ev of body.events) {
      const uid = ev.source?.userId;
      const text = ev.message?.text?.toUpperCase();

      // ===== USER =====
      if (text === "MENU") {
        await replyText(ev.replyToken, "MENU OK", LINE_TOKEN);
      }

      // ===== ADMIN =====
      if (uid === ADMIN_ID && text === "O") {
        state.BET_OPEN = true;
        await replyText(ev.replyToken, "🟢 เปิดแล้ว", LINE_TOKEN);
      }

      if (uid === ADMIN_ID && text === "X") {
        state.BET_OPEN = false;
        await replyText(ev.replyToken, "🔴 ปิดแล้ว", LINE_TOKEN);
      }
    }
  }
);

app.get("/", (_, res) => res.send("BOT RUNNING"));
app.listen(process.env.PORT || 3000);
