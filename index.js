// ===== LINE OPEN HOUSE DICE BOT (DEMO / STUB) =====
// ⚠️ เดโมเพื่อทดสอบโฟลว์/หน้าตา Flex ไม่ผูกการเงินจริง
const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();

// ===== RAW BODY (LINE VERIFY) =====
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); },
  limit: "2mb"
}));

// ===== ENV =====
const LINE_TOKEN  = process.env.LINE_TOKEN;
const LINE_SECRET = process.env.LINE_SECRET;
const ADMIN_ID    = process.env.ADMIN_ID; // userId แอดมินสูงสุด

// ===== ROLES / STATE =====
let OWNERS = new Set();          // ลูกค้าเช่า (เพิ่ม/ลบจากแชท)
let BET_OPEN = false;
let ROUND = 1;

// เครดิตเดโม
let CREDIT = {};                // { userId: number }
let BETS = [];                  // เดิมพันรอบนี้
let HISTORY = [];               // 12 รอบล่าสุด

// ===== UTIL =====
const reply = (replyToken, messages) => axios.post(
  "https://api.line.me/v2/bot/message/reply",
  { replyToken, messages: Array.isArray(messages)?messages:[messages] },
  { headers:{ Authorization:`Bearer ${LINE_TOKEN}` } }
);

const ok = res => res.status(200).send("OK");

const verify = req => {
  const sig = req.headers["x-line-signature"];
  const hash = crypto.createHmac("sha256", LINE_SECRET)
    .update(req.rawBody).digest("base64");
  return sig === hash;
};

// LINE dice image
const diceImg = n => `https://scdn.line-apps.com/n/channel_devcenter/img/dice/dice_${n}.png`;
async function getBalance(db, userId) {
  const r = await db.query(
    "SELECT balance FROM users WHERE id=$1",
    [userId]
  );
  return r.rows[0]?.balance || 0;
}

async function addBalance(db, userId, amount, type, ref="") {
  await db.query("BEGIN");
  await db.query(
    "INSERT INTO users(id,balance) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
    [userId, 0]
  );
  await db.query(
    "UPDATE users SET balance = balance + $1 WHERE id=$2",
    [amount, userId]
  );
  await db.query(
    "INSERT INTO transactions(user_id,type,amount,ref) VALUES($1,$2,$3,$4)",
    [userId, type, amount, ref]
  );
  await db.query("COMMIT");
}
// ===== FLEX (เมนู/สถานะ) =====
const flexMenu = (role) => ({
  type:"flex", altText:"เมนู",
  contents:{
    type:"bubble",
    body:{ type:"box", layout:"vertical", spacing:"sm", contents:[
      { type:"text", text:"OPEN HOUSE", weight:"bold", align:"center", color:"#ff2d2d", size:"lg" },
      { type:"text", text: BET_OPEN?"🟢 เปิดรับเดิมพัน":"🔴 ปิดรับเดิมพัน", align:"center",
        color: BET_OPEN?"#2ecc71":"#ff2d2d", weight:"bold" },
      { type:"text", text:`รอบที่ ${ROUND}`, align:"center", size:"sm", color:"#aaa" },
      { type:"separator" },
      { type:"text", text:"คำสั่งหลัก", weight:"bold" },
      { type:"text", text:"• 1/100, 2/100, 3/100, 4/100" },
      { type:"text", text:"• 123/20 (สเปรย์), 555/20 (เป่า)" },
      { type:"text", text:"• C ดูเครดิต, X หรือ DL ยกเลิก" },
      ...(role!=="USER" ? [
        { type:"separator" },
        { type:"text", text:"คำสั่งผู้ดูแล", weight:"bold" },
        { type:"text", text:"• O / X เปิด–ปิดรอบ" },
        { type:"text", text:"• S661 ออกผล" },
        { type:"text", text:"• BACK / RESET" },
      ]:[])
    ]}
  }
});

const flexSlip = ({name, uid, bet, deduct, balance}) => ({
  type:"flex", altText:"ใบรับโพย",
  contents:{ type:"bubble", styles:{body:{backgroundColor:"#1b1b1b"}}, body:{
    type:"box", layout:"vertical", spacing:"sm", contents:[
      { type:"text", text:name, color:"#ff3b3b", weight:"bold" },
      { type:"text", text:`ID: ${uid}`, size:"xs", color:"#aaa" },
      { type:"separator" },
      { type:"text", text:`แทง ${bet}`, color:"#fff", size:"lg" },
      { type:"text", text:`หักล่วงหน้า ${deduct}`, color:"#ff7675", size:"sm" },
      { type:"text", text:`คงเหลือ ${balance}`, color:"#2ecc71", size:"sm" }
    ]
  }}
});

const flexResult = (d) => ({
  type:"flex", altText:"ผลออก",
  contents:{ type:"bubble", body:{ type:"box", layout:"vertical", contents:[
    { type:"text", text:"🎲 RESULT", align:"center", weight:"bold", color:"#ff2d2d" },
    { type:"box", layout:"horizontal", align:"center", spacing:"md",
      contents: d.map(x=>({type:"image", url:diceImg(x), size:"sm"})) }
  ]}}
});

const flexSummary = (rows) => ({
  type:"flex", altText:"สรุปเดิมพัน",
  contents:{ type:"bubble", body:{ type:"box", layout:"vertical", contents:[
    { type:"text", text:"สรุปเดิมพัน", weight:"bold", color:"#ff2d2d" },
    ...rows.map(r=>({ type:"text", text:r, size:"sm" }))
  ]}}
});
function flexSlipSmall({ name, uid, bet, deduct, balance }) {
  return {
    type: "flex",
    altText: "ใบรับโพย",
    contents: {
      type: "bubble",
      styles: { body: { backgroundColor: "#111111" } },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "8px",
        spacing: "xs",
        contents: [
          {
            type: "text",
            text: `${name} (${uid})`,
            size: "xs",
            color: "#ff3b3b",
            weight: "bold"
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: bet, size: "sm", flex: 2 },
              { type: "text", text: `-${deduct}`, size: "sm", color: "#ff7675", align: "end" }
            ]
          },
          {
            type: "text",
            text: `คงเหลือ ${balance}`,
            size: "xs",
            color: "#2ecc71",
            align: "end"
          }
        ]
      }
    }
  };
}
function flexResultSmall(d1, d2, d3) {
  return {
    type: "flex",
    altText: "ผลออก",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        paddingAll: "6px",
        contents: [
          { type: "image", url: diceImg(d1), size: "xs" },
          { type: "image", url: diceImg(d2), size: "xs" },
          { type: "image", url: diceImg(d3), size: "xs" }
        ]
      }
    }
  };
}
function flexSummarySmall(rows) {
  return {
    type: "flex",
    altText: "สรุปเดิมพัน",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "8px",
        contents: [
          { type: "text", text: "สรุปเดิมพัน", size: "sm", weight: "bold", color: "#ff3b3b" },
          ...rows.map(r => ({
            type: "text",
            text: r,
            size: "xs",
            color: r.includes("-") ? "#ff7675" : "#2ecc71"
          }))
        ]
      }
    }
  };
}

// ===== PARSE BET =====
function parseBet(text){
  // 1/100 2/100 3/100 4/100
  let m = text.match(/^([1-4])\/(\d+)$/);
  if(m) return { type:"FACE", face:+m[1], amt:+m[2] };

  // 123/20 spray, 555/20 blow
  m = text.match(/^(\d{3})\/(\d+)$/);
  if(m){
    if(m[1]==="123") return { type:"SPRAY", code:"123", amt:+m[2] };
    if(m[1]==="555") return { type:"BLOW",  code:"555", amt:+m[2] };
  }
  return null;
}

// ===== WEBHOOK =====
app.post("/webhook", async (req,res)=>{
  ok(res);
  if(!verify(req)) return;

  const ev = req.body.events?.[0];
  if(!ev || ev.type!=="message" || ev.message.type!=="text") return;

  const text = ev.message.text.trim().toUpperCase();
  const replyToken = ev.replyToken;
  const uid = ev.source.userId;

  const isAdmin = uid===ADMIN_ID;
  const isOwner = OWNERS.has(uid) || isAdmin;
  const role = isAdmin?"ADMIN":(isOwner?"OWNER":"USER");

  CREDIT[uid] ??= 10000; // เครดิตเดโมตั้งต้น

  try{
    // ===== ROLE MGMT (ADMIN) =====
    if(isAdmin && text.startsWith("OWNER+")){
      const id = text.split("+")[1];
      OWNERS.add(id);
      return reply(replyToken,{type:"text",text:`เพิ่ม OWNER ${id}`});
    }
    if(isAdmin && text.startsWith("OWNER-")){
      const id = text.split("-")[1];
      OWNERS.delete(id);
      return reply(replyToken,{type:"text",text:`ลบ OWNER ${id}`});
    }

    // ===== MENU =====
    if(text==="MENU") return reply(replyToken, flexMenu(role));

    // ===== ADMIN / OWNER =====
    if(isOwner){
      if(text==="O"){ BET_OPEN=true; return reply(replyToken, flexMenu(role)); }
      if(text==="X"){ BET_OPEN=false; return reply(replyToken, flexMenu(role)); }
      if(text==="RESET"){ ROUND++; BET_OPEN=false; BETS=[]; return reply(replyToken,{type:"text",text:`รีรอบ #${ROUND}`}); }
      if(text==="BACK"){ BETS.pop(); return reply(replyToken,{type:"text",text:"ย้อนโพยล่าสุด"}); }
      if(/^S\d{3}$/.test(text)){
        const d=[+text[1],+text[2],+text[3]];
        BET_OPEN=false;
        HISTORY.unshift({ round:ROUND, dice:d });
        HISTORY=HISTORY.slice(0,12);
        return reply(replyToken, [flexResult(d), flexSummary([
          `รอบ ${ROUND} ปิดรับแล้ว`,
          `จำนวนโพย ${BETS.length}`
        ])]);
      }
    }

    // ===== USER =====
    if(text==="C"){
      return reply(replyToken,{type:"text",text:`เครดิตคงเหลือ ${CREDIT[uid]}`});
    }

    if(text==="X" || text==="DL"){
      BETS = BETS.filter(b=>b.uid!==uid);
      return reply(replyToken,{type:"text",text:"ยกเลิกโพยแล้ว"});
    }

    if(!BET_OPEN){
      return reply(replyToken,{type:"text",text:"❌ ปิดรับเดิมพัน"});
    }

    const bet = parseBet(text);
    if(bet){
      // กติกาขั้นต่ำ (เดโม)
      if(bet.amt<20) return reply(replyToken,{type:"text",text:"ขั้นต่ำไม่ถึง"});
      CREDIT[uid]-=bet.amt;
      BETS.push({ uid, bet });
      return reply(replyToken, flexSlip({
        name:"สมาชิก",
        uid: uid.slice(-4),
        bet:text,
        deduct: bet.amt,
        balance: CREDIT[uid]
      }));
    }

  }catch(e){ console.error(e); }
});

// ===== HEALTH =====
app.get("/",(_,res)=>res.send("OPEN HOUSE DICE BOT : DEMO RUNNING"));

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("RUN",PORT));
