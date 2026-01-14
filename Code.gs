function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ev = data.events[0];
  if (!ev || !ev.message || ev.message.type !== "text") return ok();

  const msg = ev.message.text.trim();
  const uid = ev.source.userId;
  const gid = ev.source.groupId || "";

  if (gid === ROOM_PLAY) {
    if (isAdmin(uid)) return adminPlay(msg, ev);
    return userPlay(msg, ev);
  }

  if (gid === ROOM_PAY) {
    if (!isAdmin(uid)) return reply(ev, "❌ ห้องนี้เฉพาะแอดมิน");
    return adminPay(msg, ev);
  }

  return ok();
}
