const express = require("express");
const app = express();

app.use(express.json());

app.post("/webhook", (req, res) => {
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("LINE BOT ONLINE");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT);
