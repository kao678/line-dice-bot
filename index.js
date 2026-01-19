// =======================================================
// LINE OPEN HOUSE DICE BOT (PRODUCTION CORE – SINGLE FILE)
// เครดิตจริง / OWNER เช่า / FLEX / พร้อมต่อ DB + BANK API
// =======================================================

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
const ADMIN_ID    = process.env.ADMIN_ID; // userId แอดมินหลัก

// ===== STATE (PRODUCTION CORE) =====
let BET_OPEN = false;
let ROUND = 1;

// OWNER = ลูกค้าเช่า (เพิ่ม/ลบได้จากแชท)
let OWNERS = new Set();

// ===== DATABASE (IN-MEMORY -> เปลี่ยนเป็น Mongo/MySQL ได้) =====
const DB = {
  users: {},     // userId -> { credit }
  bets: [],      // เดิมพันรอบปัจจุบัน
  history: []    // 12 รอบล่าสุด
};

// ===== BANK API ADAPTER (เสียบของจริงตรงนี้) =====
const BankAPI = {
  async depositSlip(imageUrl) {
    // TODO: ต่อ API ธนาคารจริง
    return { success: true, amount: 1000 };
  },
  async withdraw(account, amount) {
    // TODO: ต่อ API ธนาคารจริง
    return { success: true, ref: "BANK_REF_123" };
  }
};

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

const diceImg = n =>
  `https://scdn.line-apps.com/n/channel_devcenter/img/dice/dice_${n}.png`;

// ===== FLEX =====
const flexMenu = (role) => ({
  type:"flex", altText:"เมนู",
  contents:{ type:"bubble", body:{ type:"box", layout:"vertical", spacing:"sm", contents:[
    { type:"text", text:"OPEN HOUSE", align:"center", weight:"bold", color:"#ff2d2d" },
    { type:"text", text: BET_OPEN?"🟢 เปิดรับเดิมพัน":"🔴 ปิดรับเดิมพัน",
      align:"center", weight:"bold", color:BET_OPEN?"#2ecc71":"#ff2d2d" },
    { type:"text", text:`รอบที่ ${ROUND}`, align:"center", size:"sm", color:"#aaa" },
    { type:"separator" },
    { type:"text", text:"🎲 วิธีแทง", weight:"bold" },
    { type:"text", text:"1/100 2/100 3/100 4/100" , size:"sm"},
    { type:"text", text:"123/20 (สเปรย์) | 555/20 (เป่า)", size:"sm" },
    { type:"text", text:"C ดูเครดิต | X, DL ยกเลิก", size:"sm" },
    ...(role!=="USER" ? [
      { type:"separator" },
      { type:"text", text:"🔐 ผู้ดูแล", weight:"bold" },
      { type:"text", text:"O / X เปิด–ปิดรอบ", size:"sm" },
      { type:"text", text:"S661 ออกผล | RESET | BACK", size:"sm" }
    ]:[])
  ]}}
);

const flexSlip = ({name, uid, bet, deduct, balance}) => ({
  type:"flex", altText:"ใบรับโพย",
  contents:{ type:"bubble", styles:{body:{backgroundColor:"#1b1b1b"}}, body:{
    type:"box", layout:"vertical", spacing:"sm", contents:[
      { type:"text", text:name, color:"#ff3b3b", weight:"bold" },
      { type:"text", text:`ID: ${uid}`, size:"xs", color:"#aaa" },
      { type:"separator" },
      { type:"text", text:`แทง ${bet}`, size:"md", color:"#fff" },
      { type:"text", text:`หัก ${deduct}`, size:"sm", color:"#ff7675" },
      { type:"text", text:`คงเหลือ ${balance}`, size:"sm", color:"#2ecc71" }
    ]
  }}
);

const flexResult = (dice) => ({
  type:"flex", altText:"ผลออก",
  contents:{ type:"bubble", body:{ type:"box", layout:"vertical", contents:[
    { type:"text", text:"🎲 RESULT", align:"center", weight:"bold", color:"#ff2d2d" },
    { type:"box", layout:"horizontal", align:"center", spacing:"md",
      contents: dice.map(d=>({type:"image", url:diceImg(d), size:"sm"})) }
  ]}}
);

// ===== BET PARSER =====
function parseBet(text){
  let m = text.match(/^([1-4])\/(\d+)$/);
  if(m) return { type:"FACE", face:+m[1], amt:+m[2] };

  m = text.match(/^(\d{3})\/(\d+)$/);
  if(m){
    if(m[1]==="123") return { type:"SPRAY", amt:+m[2] };
    if(m[1]==="555") return { type:"BLOW", amt:+m[2] };
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
  const uid = ev.source.userId;
  const replyToken = ev.replyToken;

  const isAdmin = uid===ADMIN_ID;
  const isOwner = isAdmin || OWNERS.has(uid);
  const role = isAdmin?"ADMIN":(isOwner?"OWNER":"USER");

  DB.users[uid] ??= { credit: 0 };

  try{
    // ===== OWNER MGMT =====
    if(isAdmin && text.startsWith("OWNER+")){
      OWNERS.add(text.split("+")[1]);
      return reply(replyToken,{type:"text",text:"เพิ่ม OWNER แล้ว"});
    }
    if(isAdmin && text.startsWith("OWNER-")){
      OWNERS.delete(text.split("-")[1]);
      return reply(replyToken,{type:"text",text:"ลบ OWNER แล้ว"});
    }

    if(text==="MENU") return reply(replyToken, flexMenu(role));

    // ===== ADMIN / OWNER =====
    if(isOwner){
      if(text==="O"){ BET_OPEN=true; return reply(replyToken, flexMenu(role)); }
      if(text==="X"){ BET_OPEN=false; return reply(replyToken, flexMenu(role)); }
      if(text==="RESET"){ ROUND++; BET_OPEN=false; DB.bets=[]; return reply(replyToken,{type:"text",text:`รีรอบ #${ROUND}`}); }
      if(text==="BACK"){ DB.bets.pop(); return reply(replyToken,{type:"text",text:"ย้อนโพยล่าสุด"}); }
      if(/^S\d{3}$/.test(text)){
        const d=[+text[1],+text[2],+text[3]];
        BET_OPEN=false;
        DB.history.unshift({ round:ROUND, dice:d });
        DB.history=DB.history.slice(0,12);
        return reply(replyToken, flexResult(d));
      }
    }

    // ===== USER =====
    if(text==="C"){
      return reply(replyToken,{type:"text",text:`เครดิตคงเหลือ ${DB.users[uid].credit}`});
    }

    if(text==="X" || text==="DL"){
      DB.bets = DB.bets.filter(b=>b.uid!==uid);
      return reply(replyToken,{type:"text",text:"ยกเลิกโพยแล้ว"});
    }

    if(!BET_OPEN) return reply(replyToken,{type:"text",text:"❌ ปิดรับเดิมพัน"});

    const bet = parseBet(text);
    if(bet){
      if(DB.users[uid].credit < bet.amt)
        return reply(replyToken,{type:"text",text:"เครดิตไม่พอ"});
      DB.users[uid].credit -= bet.amt;
      DB.bets.push({ uid, bet });
      return reply(replyToken, flexSlip({
        name:"สมาชิก",
        uid: uid.slice(-4),
        bet:text,
        deduct: bet.amt,
        balance: DB.users[uid].credit
      }));
    }

  }catch(e){ console.error(e); }
});

// ===== HEALTH =====
app.get("/",(_,res)=>res.send("OPEN HOUSE DICE BOT : RUNNING"));

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("RUN",PORT));
