// ================= COMMAND SYSTEM =================

function handleCommand({
  text,
  userId,
  userCode,
  room,
  ROOMS,
  USER_ROOM
}) {

  // ---------- ADMIN (ในห้องเล่น) ----------
  if (text === "O") {
    room.open = true;
    return { type: "open" };
  }

  if (text === "X") {
    room.open = false;
    return { type: "close" };
  }

  if (text.startsWith("S")) {
    const result = text.replace("S", "").trim();
    room.lastResult = result;
    room.open = false;
    return { type: "result", value: result };
  }

  if (text === "BACK") {
    room.lastResult = null;
    return { type: "text", text: "↩️ ย้อนการออกผลเรียบร้อย" };
  }

  if (text === "รีรอบ" || text === "RESET") {
    room.bets = [];
    room.open = false;
    return { type: "text", text: "🔄 รีรอบ / ล้างโพยแล้ว" };
  }

  if (text === "รีการแทง" || text === "REFUND") {
    for (let uid in room.users) {
      room.users[uid].credit += room.users[uid].tempBet || 0;
      room.users[uid].tempBet = 0;
    }
    room.bets = [];
    return { type: "text", text: "💸 คืนยอดให้ลูกค้าทั้งหมดแล้ว" };
  }

  // ---------- SETTINGS (ห้องฝาก) ----------
  if (text.startsWith("N/")) {
    room.waterLose = Number(text.split("/")[1]);
    return { type: "text", text: `ตั้งน้ำฝั่งเสีย ${room.waterLose}%` };
  }

  if (text.startsWith("NC/")) {
    room.waterWin = Number(text.split("/")[1]);
    return { type: "text", text: `ตั้งน้ำฝั่งได้ ${room.waterWin}%` };
  }

  if (text.startsWith("MIN/")) {
    room.min = Number(text.split("/")[1]);
    return { type: "text", text: `ขั้นต่ำ ${room.min}` };
  }

  if (text.startsWith("MAX/")) {
    room.max = Number(text.split("/")[1]);
    return { type: "text", text: `สูงสุดต่อโพย ${room.max}` };
  }

  if (text.startsWith("FULL/")) {
    room.full = Number(text.split("/")[1]);
    return { type: "text", text: `อั้นต่อคน ${room.full}` };
  }

  // ---------- CREDIT ----------
  if (/X\d+\+\d+/.test(text)) {
    const [id, amt] = text.split("+");
    room.users[id].credit += Number(amt);
    return { type: "text", text: `➕ เติมเครดิต ${id} +${amt}` };
  }

  if (/X\d+-\d+/.test(text)) {
    const [id, amt] = text.split("-");
    room.users[id].credit -= Number(amt);
    return { type: "text", text: `➖ ลบเครดิต ${id} -${amt}` };
  }

  if (text.endsWith(" CR")) {
    const id = text.split(" ")[0];
    return {
      type: "credit",
      userCode: id,
      credit: room.users[id]?.credit || 0
    };
  }

  // ---------- MEMBER ----------
  if (text === "C") {
    return {
      type: "credit",
      userCode,
      credit: room.users[userId].credit
    };
  }

  if (text === "DL" || text === "X") {
    room.bets = room.bets.filter(b => b.userId !== userId);
    return { type: "text", text: "❌ ยกเลิกการเดิมพันทั้งหมดแล้ว" };
  }

  // ---------- BET ----------
  if (/^\d+\/\d+$/.test(text)) {
    if (!room.open) return { type: "text", text: "❌ ปิดรับเดิมพัน" };

    const [face, amount] = text.split("/");
    const amt = Number(amount);

    if (amt < room.min || amt > room.max)
      return { type: "text", text: "❌ จำนวนเงินไม่ถูกต้อง" };

    room.bets.push({
      userId,
      face,
      amount: amt
    });

    room.users[userId].credit -= amt;
    room.users[userId].tempBet =
      (room.users[userId].tempBet || 0) + amt;

    return {
      type: "bet",
      betText: `${face}/${amt}`,
      credit: room.users[userId].credit
    };
  }

  return null;
}

module.exports = { handleCommand };
