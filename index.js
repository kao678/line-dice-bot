const event = req.body.events?.[0];

if (
  !event ||
  event.type !== "message" ||
  !event.message ||
  event.message.type !== "text"
) {
  return res.sendStatus(200);
}

const text = event.message.text.trim();
