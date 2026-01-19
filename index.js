app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {

    // ⭐ ตอบ 200 ก่อน (สำคัญมาก)
    res.sendStatus(200);

    const ok = verify(
      req.body,
      req.headers["x-line-signature"],
      LINE_SECRET
    );
    if (!ok) {
      console.log("INVALID SIGNATURE");
      return;
    }

    const body = JSON.parse(req.body.toString());

    for (const ev of body.events) {
      const uid = ev.source?.userId;
      const text = ev.message?.text?.toUpperCase();

      if (text === "MENU") {
        await replyText(ev.replyToken, "MENU OK", LINE_TOKEN);
      }
    }
  }
);
