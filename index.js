// เปิดถั่ว + คำนวณผล
if (text === "เปิดถั่ว") {
  if (bets.length === 0) {
    replyText = "❌ ยังไม่มีโพย";
  } else {
    const result = Math.random() < 0.5 ? "ดำ" : "แดง";
    let summary = `🎲 ผลออก: ${result}\n\n`;

    bets.forEach((b, i) => {
      if (b.side === result) {
        summary += `#${i + 1} ✅ ชนะ +${b.amount * 2}\n`;
      } else {
        summary += `#${i + 1} ❌ แพ้ -${b.amount}\n`;
      }
    });

    bets = []; // ล้างโพย
    replyText = summary;
  }
}
