require("dotenv").config();
const express = require("express");

const app = express();

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    // ⭐ ตอบ 200 ทันที แบบไม่ทำอะไรต่อ
    res.status(200).send("OK");
  }
);

app.get("/", (_, res) => res.send("BOT RUNNING"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("SERVER RUNNING ON", PORT);
});require("dotenv").config();
const express = require("express");

const app = express();

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    // ⭐ ตอบ 200 ทันที แบบไม่ทำอะไรต่อ
    res.status(200).send("OK");
  }
);

app.get("/", (_, res) => res.send("BOT RUNNING"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("SERVER RUNNING ON", PORT);
});
