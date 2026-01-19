const axios = require("axios");
const { LINE_TOKEN } = require("../config/env");

exports.reply = async (replyToken, to, messages) => {
  const headers = {
    Authorization: `Bearer ${LINE_TOKEN}`,
    "Content-Type": "application/json"
  };

  const body = {
    messages: Array.isArray(messages) ? messages : [messages]
  };

  try {
    if (replyToken) {
      await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        { replyToken, ...body },
        { headers }
      );
    } else if (to) {
      await axios.post(
        "https://api.line.me/v2/bot/message/push",
        { to, ...body },
        { headers }
      );
    }
  } catch (e) {
    console.error("LINE ERROR", e.response?.data || e.message);
  }
};
