const axios = require("axios");

exports.replyText = async (replyToken, text, token) => {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages: [{ type: "text", text }]
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );
};
