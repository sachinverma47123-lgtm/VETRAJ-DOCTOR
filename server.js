const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const https = require("https");

// Reliable API call function — works on ALL Node versions
function callClaude(apiKey, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: "api.anthropic.com",
      port: 443,
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error("Parse error: " + body)); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 16 DOCTORS — RANDOM ROTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DOCTORS = [
  {name:"Dr. Rohit Saini",exp:10},{name:"Dr. Tanmay",exp:9},
  {name:"Dr. Aman",exp:8},{name:"Dr. Vineet Pal",exp:12},
  {name:"Dr. Neeraj Batra",exp:11},{name:"Dr. Neeraj Singhal",exp:14},
  {name:"Dr. Rajan Gangwar",exp:13},{name:"Dr. Gurpreet Singh",exp:10},
  {name:"Dr. Amit Saini",exp:9},{name:"Dr. Sushant Agrawal",exp:15},
  {name:"Dr. Sanjeet Singh",exp:11},{name:"Dr. Harsh Sharma",exp:8},
  {name:"Dr. Rajesh Saini",exp:20},{name:"Dr. Mohit Saini",exp:25},
  {name:"Dr. Nishant Singh",exp:12},{name:"Dr. David",exp:9}
];

const sessionDoctors = new Map();
function getDoctor(sid){
  if(!sid) return DOCTORS[Math.floor(Math.random()*DOCTORS.length)];
  if(!sessionDoctors.has(sid)){
    sessionDoctors.set(sid, DOCTORS[Math.floor(Math.random()*DOCTORS.length)]);
    setTimeout(()=>sessionDoctors.delete(sid), 2*60*60*1000);
  }
  return sessionDoctors.get(sid);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CSV DATA SAVE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DATA_FILE = path.join(__dirname, "vetraj_leads.csv");
function saveLead(d){
  const hdr = "Date,Time,Owner,Phone,Pet Name,Type,Age,Breed,Doctor,Problem\n";
  const now = new Date();
  const row = [
    now.toLocaleDateString("en-IN"), now.toLocaleTimeString("en-IN"),
    (d.ownerName||"").replace(/,/g," "), d.ownerPhone||"",
    (d.petName||"").replace(/,/g," "), d.petType||"",
    d.petAge||"", (d.petBreed||"").replace(/,/g," "),
    d.doctorName||"", (d.problem||"").replace(/,/g," ").replace(/\n/g," ")
  ].join(",")+"\n";
  if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, hdr+row);
  else fs.appendFileSync(DATA_FILE, row);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYSTEM PROMPT — CONSULTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildSystem(ctx, doc){
  const {ownerName,petName,petType,petAge,petBreed} = ctx;
  return `Tu ${doc.name} hai — Vetraj Pet Hospital. ${doc.exp} saal ka experience.

PATIENT: Owner=${ownerName} | Pet=${petName} | Type=${petType} | Age=${petAge} | Breed=${petBreed||"unknown"}

IDENTITY: Tu ${doc.name} hai — kabhi koi aur naam mat lo. Pet naam/type KABHI MAT POOCHH.

MESSAGE RULES:
- MAX 2 LINES — STRICT
- EK message = EK idea
- **word**=yellow [RED:word]=laal [GREEN:word]=hara [BLUE:word]=neela
- ${petName} ka naam hamesha use karo

FLOW:
1. Problem acknowledge + EK sawaal (1-2 lines)
2. Max 8 sawaal — ek ek karke
3. Diagnosis: "${petName} mein [RED:XYZ] ke signs hain." (1 line)
4. Warning: "**48 ghante** mein dhyan nahi → [RED:serious]" (1 line)
5. Video maango: "${petName} ki help ke liye video chahiye. Serious hain? **Yes/No**"

KABHI MAT DO: Paracetamol/Ibuprofen/Aspirin (DEADLY), Onion/Garlic/Chocolate (TOXIC)
FOOD: [RED:Packet food] = liver damage. [GREEN:Ghar ka khana] = best.
Full treatment NAHI — consultation pe lead karo.
EMERGENCY: "[RED:TURANT HOSPITAL] 📞 9568606006"`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HEALTH CHECKUP SYSTEM PROMPT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildHealthCheckSystem(ctx, doc){
  const {ownerName,petName,petType,petAge,petBreed} = ctx;
  return `Tu ${doc.name} hai — Vetraj Pet Hospital ka expert vet. ${doc.exp} saal ka experience.

PATIENT: Owner=${ownerName} | Pet=${petName} | Type=${petType} | Age=${petAge} | Breed=${petBreed||"unknown"}

TU EK HEALTH CHECKUP KAR RAHA HAI — examination ki tarah.

CHECKUP QUESTION SEQUENCE (max 8, ek ek karke):
1. "**${petName}** ko ghar ka khana dete hain ya packet food?"
2. "Ek din mein **kitni baar** khilate hain?"
3. "Deworming **kab** hui thi aakhri baar?"
4. "Vaccination **up to date** hai?"
5. "**Activity level** kaisa hai — normal/thoda kam/bahut kam?"
6. "Skin ya **coat** kaisa hai — shiny hai ya rough/dull?"
7. "**Pani** kitna pita hai din mein — normal lag raha hai?"
8. "Koi bhi **unusual behaviour** — jaise zyada soona, kam khana, khujli?"

DIAGNOSIS FORMAT (8 sawaalon ke baad):
Pehle: "**${petName}** ka health analysis kar liya maine."
Phir 2-3 specific issues point out karo jo answers se nikle.
Format: "${petName} mein [RED:issue1] aur [RED:issue2] ke signs hain."

FOOD CRITIQUE — ZAROORI:
Agar packet food deta hai: "[RED:Packet food] mein preservatives se **liver** aur **kidney** dheere dheere damage hote hain. Main **${petAge}** mein yeh cases bahut dekhta hun."
Agar ghar ka khana: "Ghar ka khana sahi hai — lekin [RED:nutrition balance] nahi hoga bina proper chart ke."
HAMESHA nutritional gap nikalo — yahi conversion point hai.

TONE: Caring doctor — examination kar raha hai. Engaging. ${petName} ke liye genuinely worried.
MAX 2 LINES per message. STRICT.
**word**=yellow [RED:word]=laal [GREEN:word]=hara`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post("/get-doctor", (req,res)=>{
  const doc = getDoctor(req.body.sessionId);
  res.json({doctor:doc});
});

app.post("/save-lead", (req,res)=>{
  try{ saveLead(req.body); res.json({success:true}); }
  catch(e){ res.json({success:false}); }
});

app.get("/download-leads", (req,res)=>{
  if(req.query.key !== "vetraj2024") return res.status(403).send("Access denied");
  if(!fs.existsSync(DATA_FILE)) return res.status(404).send("No data yet");
  res.download(DATA_FILE, "vetraj_leads.csv");
});

app.post("/chat", async(req,res)=>{
  try{
    const {messages, context, sessionId, mode} = req.body;
    if(!messages||!Array.isArray(messages)) return res.json({reply:"Dobara try karein 🙏"});

    const doc = getDoctor(sessionId);
    const sys = mode==="health" ? buildHealthCheckSystem(context||{},doc) : buildSystem(context||{},doc);

    const data = await callClaude(CLAUDE_KEY, {
      model:"claude-sonnet-4-20250514",
      max_tokens:250,
      system:sys,
      messages
    });
    if(data.error){ console.error(data.error.message); return res.json({reply:"Thoda technical issue — dobara try karein 🙏"}); }

    let reply = data.content?.[0]?.text || "Ek second — dobara try karein";
    reply = reply.replace(/\*\*([^*\n]+)\*\*/g,'<span class="hi">$1</span>');
    reply = reply.replace(/\[RED:([^\]]+)\]/g,'<span class="rhi">$1</span>');
    reply = reply.replace(/\[GREEN:([^\]]+)\]/g,'<span class="ghi">$1</span>');
    reply = reply.replace(/\[BLUE:([^\]]+)\]/g,'<span class="bhi">$1</span>');

    res.json({reply, doctor:doc});
  }catch(err){
    console.error(err.message);
    res.status(500).json({reply:"Connection issue — dobara try karein 🙏"});
  }
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

const PORT = process.env.PORT||3000;
app.listen(PORT,()=>console.log(`Vetraj AI — Port ${PORT} — Ready!`));
