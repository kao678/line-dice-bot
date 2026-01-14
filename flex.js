// ================= FLEX MESSAGE SYSTEM =================
// Theme : Dark / Red / Casino
// Use : Dice / Hi-Lo / Open Dice Bot

function flexOpen(roomId) {
  return {
    type: "flex",
    altText: "เปิดรับเดิมพัน",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#111111" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🟢 เปิดรับเดิมพัน",
            weight: "bold",
            size: "xl",
            color: "#00ff66",
            align: "center"
          },
          {
            type: "text",
            text: `ห้อง ${roomId}`,
            color: "#ffffff",
            align: "center",
            margin: "md"
          }
        ]
      }
    }
  };
}

function flexClose(roomId) {
  return {
    type: "flex",
    altText: "ปิดรับเดิมพัน",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#111111" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🔴 ปิดรับเดิมพัน",
            weight: "bold",
            size: "xl",
            color: "#ff3333",
            align: "center"
          },
          {
            type: "text",
            text: `ห้อง ${roomId}`,
            color: "#ffffff",
            align: "center",
            margin: "md"
          }
        ]
      }
    }
  };
}

function flexBetSlip(userCode, betText, credit) {
  return {
    type: "flex",
    altText: "รับโพย",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#1a1a1a" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🎟️ รับโพย",
            weight: "bold",
            size: "lg",
            color: "#ffcc00",
            align: "center"
          },
          {
            type: "text",
            text: `ID : ${userCode}`,
            color: "#ffffff",
            margin: "md"
          },
          {
            type: "text",
            text: betText,
            color: "#ff6666",
            wrap: true
          },
          {
            type: "separator",
            margin: "md"
          },
          {
            type: "text",
            text: `เครดิตคงเหลือ : ${credit}`,
            color: "#00ff66",
            margin: "md"
          }
        ]
      }
    }
  };
}

function flexResult(diceArr, total) {
  return {
    type: "flex",
    altText: "ผลออก",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#000000" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "🎲 ผลออก",
            weight: "bold",
            size: "xl",
            color: "#ff3333",
            align: "center"
          },
          {
            type: "text",
            text: diceArr.join(" - "),
            size: "lg",
            color: "#ffffff",
            align: "center",
            margin: "md"
          },
          {
            type: "text",
            text: `รวม = ${total}`,
            size: "lg",
            color: "#ffcc00",
            align: "center",
            margin: "sm"
          }
        ]
      }
    }
  };
}

function flexCredit(userCode, credit) {
  return {
    type: "flex",
    altText: "เครดิต",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#111111" } },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "💰 เครดิตสมาชิก",
            weight: "bold",
            size: "lg",
            color: "#ffcc00",
            align: "center"
          },
          {
            type: "text",
            text: `ID : ${userCode}`,
            color: "#ffffff",
            align: "center",
            margin: "md"
          },
          {
            type: "text",
            text: `${credit} บาท`,
            size: "xl",
            color: "#00ff66",
            align: "center",
            margin: "md"
          }
        ]
      }
    }
  };
}

// EXPORT
module.exports = {
  flexOpen,
  flexClose,
  flexBetSlip,
  flexResult,
  flexCredit
};
