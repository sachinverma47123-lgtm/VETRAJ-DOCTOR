const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const https = require("https");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CLAUDE API — HTTPS DIRECT (most reliable)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function callClaude(system, messages) {
  return new Promise((resolve, reject) => {
    if (!CLAUDE_KEY) {
      return reject(new Error("API key missing"));
    }

    // Ensure messages is valid
    const validMessages = Array.isArray(messages) && messages.length > 0
      ? messages
      : [{ role: "user", content: "Hello" }];

    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: system,
      messages: validMessages
    });

    const options = {
      hostname: "api.anthropic.com",
      port: 443,
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01"
      }
    };

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", chunk => responseData += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed);
        } catch (e) {
          reject(new Error("Parse failed: " + responseData.substring(0, 200)));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.setTimeout(25000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.write(body);
    req.end();
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOCTORS
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

const sessionDocs = new Map();
function getDoctor(sid) {
  if (!sid) return DOCTORS[Math.floor(Math.random() * DOCTORS.length)];
  if (!sessionDocs.has(sid)) {
    sessionDocs.set(sid, DOCTORS[Math.floor(Math.random() * DOCTORS.length)]);
    setTimeout(() => sessionDocs.delete(sid), 2 * 60 * 60 * 1000);
  }
  return sessionDocs.get(sid);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CSV SAVE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DATA_FILE = path.join(__dirname, "vetraj_leads.csv");
function saveLead(d) {
  const header = "Date,Time,Owner,Phone,Pet,Type,Age,Breed,Doctor,Problem\n";
  const now = new Date();
  const row = [
    now.toLocaleDateString("en-IN"),
    now.toLocaleTimeString("en-IN"),
    (d.ownerName || "").replace(/,/g, " "),
    d.ownerPhone || "",
    (d.petName || "").replace(/,/g, " "),
    d.petType || "",
    d.petAge || "",
    (d.petBreed || "").replace(/,/g, " "),
    d.doctorName || "",
    (d.problem || "").replace(/,/g, " ").replace(/\n/g, " ")
  ].join(",") + "\n";
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, header + row);
  else fs.appendFileSync(DATA_FILE, row);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYSTEM PROMPTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function getConsultSystem(ctx, doc, msgCount = 0) {
  const { ownerName = "", petName = "", petType = "", petAge = "", petBreed = "", doctorName = "" } = ctx;
  const dname = doctorName || doc.name;
  const ageYrs = parseFloat(petAge) || 0;
  const isPuppy = ageYrs > 0 && ageYrs <= 1.5;
  const isSenior = ageYrs >= 7;

  // Phase control — strict
  const canProject = msgCount >= 6;
  const canPush = msgCount >= 8;

  return `Tu ${dname} hai — Vetraj Pet Hospital. ${doc.exp} saal ka experience. Tu ek real, experienced aur warm veterinary doctor hai.

PATIENT:
Owner: ${ownerName} ji | Pet: ${petName} | Type: ${petType} | Age: ${petAge} | Breed: ${petBreed || "mixed"}
${isPuppy ? "⚠️ ALERT: " + petName + " bahut chhota/chhhoti hai — Parvovirus aur Distemper risk MAXIMUM" : ""}
${isSenior ? "⚠️ ALERT: " + petName + " senior hai — organ failure risk zyada" : ""}

CURRENT MESSAGE NUMBER: ${msgCount}
${canPush ? "✅ 8+ messages ho gaye — ab PUSH karo" : canProject ? "✅ 6+ messages ho gaye — ab DISEASE PROJECTION karo" : "🔴 Abhi sirf SYMPTOMS collect karo — koi projection ya push NAHI"}

━━━━ LANGUAGE ━━━━
- Bilkul simple Hindi — jaise WhatsApp pe real doctor
- "fikr" bolo, "chinta" nahi | "dhyan" bolo, "concern" nahi
- Har message mein ${petName} ka naam use karo
- MAX 2 LINES — KABHI ZYADA NAHI
- **word** = yellow | [RED:word] = laal | [GREEN:word] = hara

━━━━ PHASE 1 — SYMPTOMS COLLECT (message 1 se 5) ━━━━
Sirf ek ek sawaal puchho — natural flow mein:
1. "${petName} ko yeh **kitne din** se ho raha hai?"
2. "Khana kha raha/rahi hai ${petName} theek se?"
3. "Pani pi raha/rahi hai ya nahi pi raha/rahi?"
4. "Potty/ulti mein kuch alag — **color** kaisa, **blood** toh nahi?"
5. "${petName} thaka/thaki hua/hui lagta/lagti hai ya thoda khel bhi raha/rahi hai?"

━━━━ PHASE 2 — DEEP SYMPTOMS (message 6-7) ━━━━
Ab aur detail lo:
- "**Body pe haath** lagao — garmi lag rahi hai?"
- "**Naak** se kuch? **Aankhein** kaisi hain — saaf ya gandi?"
- "Potty **kitni baar** ho rahi din mein?"
- "Pehle kabhi aisa hua tha ${petName} ke saath?"
- "**Vaccination** complete hai ${petName} ki?"

━━━━ PHASE 3 — DISEASE PROJECTION (sirf 6+ ke baad) ━━━━
${canProject ? `
Ab symptoms ke hisaab se age-based analysis karo:

LOOSE MOTION ke liye:
${isPuppy ? `"${petName} itna/itni chhota/chhhoti hai — mujhe [RED:Parvovirus] ki sabse zyada fikr hai." + newline + "Is age mein Parvo [RED:bahut tezi se khatarnak] hota hai — aur yeh loose motion uska pehla sign hai."` : isSenior ? `"${petName} ki age mein loose motion [RED:kidney ya liver] ki problem ka sign ho sakta hai." + newline + "Senior pets mein yeh [RED:jaldi serious] ho jaata hai."` : `"${petName} ke yeh symptoms teen cheezein ho sakti hain — [RED:bacterial infection], [RED:parasites], ya [RED:parvovirus]." + newline + "Bina jaanche pakka nahi keh sakta — ek baar theek se dekhna zaroori hai."`}

ULTI ke liye:
${isPuppy ? `"${petName} ki umar mein ulti — [RED:Parvovirus ya Distemper] ka strong chance hai." + newline + "Yeh dono [RED:bahut dangerous] hain chhote pets ke liye."` : `"Ulti ka matlab [RED:gastritis], [RED:kidney issue], ya [RED:kuch kha liya] ho sakta hai." + newline + "Ulti ka rang kya tha — uspe depend karta hai."`}

KHANSI ke liye:
${isPuppy ? `"Chhote pets mein khansi [RED:Kennel Cough ya Distemper] ho sakti hai." + newline + "Is age mein [RED:jaldi dhyan dena] zaroori hai."` : isSenior ? `"${petName} ki age mein khansi [RED:heart ya lung problem] ho sakti hai." + newline + "Senior pets mein yeh [RED:seriously lena chahiye]."` : `"Khansi [RED:Kennel Cough], [RED:allergy], ya [RED:heart issue] ka sign ho sakta hai." + newline + "Raat mein zyada hoti hai toh heart pe zyada doubt hai."`}
` : "Disease projection ke liye 6+ messages chahiye — abhi aur symptoms collect karo."}

━━━━ PHASE 4 — PUSH (sirf 8+ ke baad) ━━━━
${canPush ? `
"${ownerName} ji — ${petName} ke yeh saare symptoms sun ke mujhe [RED:bahut fikr] ho rahi hai."
"Ek **video consultation** mein theek se dekh sakta hun — tab pakka bata paunga kya ho raha hai ${petName} ko."
[YES/NO buttons]` : "Push ke liye 8+ messages chahiye."}

━━━━ BRAND RULE ━━━━
❌ Pedigree, Royal Canin, Drools, Purina — KABHI NAHI
✅ Sirf: "packet food"
✅ Vetraj products: Ganvet Liver Tonic, VAMKIL Deworming, Vetraj Probiotic

━━━━ NEVER ━━━━
❌ Paracetamol / Ibuprofen / Aspirin — DEADLY
❌ Onion / Garlic / Chocolate — TOXIC
❌ Koi bhi medicine suggest karna
❌ Diet ya home treatment batana

EMERGENCY: "[RED:Abhi doctor ke paas le jaao] 📞 9568606006"`;
}


function getHealthSystem(ctx, doc) {
  const { ownerName = "", petName = "", petType = "", petAge = "", petBreed = "", doctorName = "" } = ctx;
  const dname = doctorName || doc.name;
  return `Tu ${dname} hai — Vetraj Pet Hospital. ${doc.exp} saal experience. Health checkup kar raha hai.

PATIENT: Owner=${ownerName} | Pet=${petName} | Type=${petType} | Age=${petAge} | Breed=${petBreed || "unknown"}

RULES:
- MAX 2 LINES per message — STRICT
- ${petName} ka naam hamesha use karo
- **word**=yellow [RED:word]=laal [GREEN:word]=hara
- Caring doctor tone

━━━━ BRAND NAME RULE — KABHI MAT TODNA ━━━━
KABHI BHAI KISI BHI PRODUCT KA BRAND NAME MAT LO.
❌ Pedigree, Royal Canin, Drools, Purina — KABHI NAHI
❌ Kisi bhi medicine ka brand naam — KABHI NAHI
✅ Sirf "packet food" bolna hai
✅ Sirf salt/generic naam: "liver tonic", "multivitamin", "deworming medicine"
✅ Sirf Vetraj ke apne products: "Ganvet Liver Tonic", "VAMKIL Deworming"

━━━━ CHECKUP QUESTIONS (ek ek, 8 max) ━━━━
1. "**Ghar ka khana** dete hain ya **packet food**?"
2. "Din mein **kitni baar** khilate hain?"
3. "**Deworming** kab hui thi?"
4. "**Vaccination** up to date hai?"
5. "**Activity** normal hai ya thaka hua lagta hai?"
6. "**Coat/skin** kaisi hai — shiny ya dull?"
7. "**Pani** normal pita hai?"
8. "Koi **unusual behaviour** recently?"

━━━━ DIAGNOSIS (8 ke baad) ━━━━
"**${petName}** ka analysis kar liya."
"${petName} mein [RED:issue] ke signs hain."
Gap zaroori nikalo — nutritional ya health related.

━━━━ FOOD CRITIQUE ━━━━
Packet food pe: "[RED:Packet food] se ${petName} ka **liver** dheere damage ho raha hai."
Ghar ka khana pe: "[RED:Nutrition balance] nahi milega bina proper chart ke."
KABHI packet food ka brand naam mat lo.

━━━━ DANGEROUS — KABHI MAT DO ━━━━
Paracetamol/Ibuprofen/Aspirin — DEADLY for pets
Onion/Garlic/Chocolate — TOXIC`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FORMAT REPLY — highlights + brand filter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function formatReply(text) {
  // BRAND NAME FILTER — replace competitor names with generic terms
  const brandReplacements = [
    [/pedigree/gi, "packet food"],
    [/royal\s*canin/gi, "packet food"],
    [/drools/gi, "packet food"],
    [/purina/gi, "packet food"],
    [/whiskas/gi, "packet food"],
    [/hills\s*(science\s*diet)?/gi, "packet food"],
    [/acana/gi, "packet food"],
    [/orijen/gi, "packet food"],
    [/farmina/gi, "packet food"],
    [/eukanuba/gi, "packet food"],
  ];
  for (const [pattern, replacement] of brandReplacements) {
    text = text.replace(pattern, replacement);
  }

  // Highlights
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<span class="hi">$1</span>');
  text = text.replace(/\[RED:([^\]]+)\]/g, '<span class="rhi">$1</span>');
  text = text.replace(/\[GREEN:([^\]]+)\]/g, '<span class="ghi">$1</span>');
  text = text.replace(/\[BLUE:([^\]]+)\]/g, '<span class="bhi">$1</span>');
  return text;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post("/get-doctor", (req, res) => {
  try {
    const doc = getDoctor(req.body.sessionId);
    res.json({ doctor: doc });
  } catch (e) {
    res.json({ doctor: DOCTORS[0] });
  }
});

app.post("/save-lead", (req, res) => {
  try { saveLead(req.body); res.json({ success: true }); }
  catch (e) { res.json({ success: false }); }
});

// ━━━━ APPOINTMENTS — Save & Get ━━━━
const APPT_FILE = path.join(__dirname, "vetraj_appointments.json");

function saveAppointment(data) {
  let appts = [];
  if (fs.existsSync(APPT_FILE)) {
    try { appts = JSON.parse(fs.readFileSync(APPT_FILE, "utf8")); } catch(e) { appts = []; }
  }
  data.id = Date.now();
  data.createdAt = new Date().toISOString();
  data.status = data.status || "booked";
  appts.push(data);
  fs.writeFileSync(APPT_FILE, JSON.stringify(appts, null, 2));
}

app.post("/save-appointment", (req, res) => {
  try { saveAppointment(req.body); res.json({ success: true }); }
  catch (e) { console.error("Appointment save error:", e); res.json({ success: false }); }
});

app.get("/get-appointments", (req, res) => {
  const key = req.query.key;
  if (key !== "vetraj2024") return res.status(403).json({ error: "Access denied" });
  try {
    if (!fs.existsSync(APPT_FILE)) return res.json({ appointments: [] });
    const appts = JSON.parse(fs.readFileSync(APPT_FILE, "utf8"));
    res.json({ appointments: appts });
  } catch (e) { res.json({ appointments: [] }); }
});

app.post("/update-appointment", (req, res) => {
  const key = req.query.key;
  if (key !== "vetraj2024") return res.status(403).json({ error: "Access denied" });
  try {
    const { id, status, doctor } = req.body;
    let appts = [];
    if (fs.existsSync(APPT_FILE)) {
      appts = JSON.parse(fs.readFileSync(APPT_FILE, "utf8"));
    }
    const idx = appts.findIndex(a => a.id === id);
    if (idx !== -1) {
      if (status) appts[idx].status = status;
      if (doctor) appts[idx].doctor = doctor;
    }
    fs.writeFileSync(APPT_FILE, JSON.stringify(appts, null, 2));
    res.json({ success: true });
  } catch (e) { res.json({ success: false }); }
});

app.get("/download-leads", (req, res) => {
  if (req.query.key !== "vetraj2024") return res.status(403).send("Access denied");
  if (!fs.existsSync(DATA_FILE)) return res.status(404).send("No data yet");
  res.download(DATA_FILE, "vetraj_leads.csv");
});

// ━━━━ DOCTORS MANAGEMENT ━━━━
const DOCTORS_FILE = path.join(__dirname, "vetraj_doctors.json");
const DEFAULT_DOCTORS_LIST = [
  {id:1,name:"Dr. Rohit Saini",exp:10,spec:"Dog & Cat Specialist",phone:"",available:true,type:"vet"},
  {id:2,name:"Dr. Tanmay",exp:9,spec:"Small Animal Vet",phone:"",available:true,type:"vet"},
  {id:3,name:"Dr. Aman",exp:8,spec:"General Veterinary",phone:"",available:true,type:"vet"},
  {id:4,name:"Dr. Vineet Pal",exp:12,spec:"Dog Specialist",phone:"",available:true,type:"vet"},
  {id:5,name:"Dr. Neeraj Batra",exp:11,spec:"Cat & Dog Vet",phone:"",available:true,type:"vet"},
  {id:6,name:"Dr. Neeraj Singhal",exp:14,spec:"Senior Vet",phone:"",available:true,type:"vet"},
  {id:7,name:"Dr. Rajan Gangwar",exp:13,spec:"Dog Specialist",phone:"",available:true,type:"vet"},
  {id:8,name:"Dr. Gurpreet Singh",exp:10,spec:"General Vet",phone:"",available:true,type:"vet"},
  {id:9,name:"Dr. Amit Saini",exp:9,spec:"Small Animal",phone:"",available:true,type:"vet"},
  {id:10,name:"Dr. Sushant Agrawal",exp:15,spec:"Senior Specialist",phone:"",available:true,type:"vet"},
  {id:11,name:"Dr. Sanjeet Singh",exp:11,spec:"Dog & Cat Vet",phone:"",available:true,type:"vet"},
  {id:12,name:"Dr. Harsh Sharma",exp:8,spec:"General Vet",phone:"",available:true,type:"vet"},
  {id:13,name:"Dr. Rajesh Saini",exp:20,spec:"Senior Vet",phone:"",available:true,type:"vet"},
  {id:14,name:"Dr. Mohit Saini",exp:25,spec:"Founder & Chief Vet",phone:"9568606006",available:true,type:"vet"},
  {id:15,name:"Dr. Nishant Singh",exp:12,spec:"Dog Specialist",phone:"",available:true,type:"vet"},
  {id:16,name:"Dr. David",exp:9,spec:"Small Animal Vet",phone:"",available:true,type:"vet"},
  {id:17,name:"Nutrition Expert",exp:8,spec:"Pet Nutrition & Diet",phone:"",available:true,type:"nutrition"},
];

function getDoctors() {
  if (fs.existsSync(DOCTORS_FILE)) {
    try { return JSON.parse(fs.readFileSync(DOCTORS_FILE,"utf8")); } catch(e) {}
  }
  return DEFAULT_DOCTORS_LIST;
}
function saveDoctors(docs) { fs.writeFileSync(DOCTORS_FILE, JSON.stringify(docs,null,2)); }

app.get("/get-doctors", (req,res) => res.json({doctors: getDoctors()}));

app.post("/save-doctor", (req,res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  const docs = getDoctors();
  const d = req.body;
  if(d.id) {
    const i = docs.findIndex(x=>x.id===d.id);
    if(i!==-1) docs[i]={...docs[i],...d};
    else docs.push({...d, id: Date.now()});
  } else {
    docs.push({...d, id: Date.now(), available:true});
  }
  saveDoctors(docs);
  res.json({success:true});
});

app.post("/delete-doctor", (req,res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  const docs = getDoctors().filter(d=>d.id !== req.body.id);
  saveDoctors(docs);
  res.json({success:true});
});

app.post("/toggle-doctor", (req,res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  const docs = getDoctors();
  const i = docs.findIndex(d=>d.id===req.body.id);
  if(i!==-1) docs[i].available = !docs[i].available;
  saveDoctors(docs);
  res.json({success:true, available: docs[i]?.available});
});

// ━━━━ AUTO DISTRIBUTE ━━━━
app.post("/auto-distribute", (req,res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  try {
    const appts = fs.existsSync(APPT_FILE) ? JSON.parse(fs.readFileSync(APPT_FILE,"utf8")) : [];
    const docs = getDoctors().filter(d=>d.available);
    const unassigned = appts.filter(a=>!a.doctor || a.doctor==='');
    if(!unassigned.length || !docs.length) return res.json({success:true, distributed:0});

    // Count current load per doctor
    const load = {};
    docs.forEach(d=>load[d.name]=appts.filter(a=>a.doctor===d.name&&a.status!=='done'&&a.status!=='refund').length);

    // Round-robin by load
    let count = 0;
    unassigned.forEach(appt => {
      // Find doctor with least load, match specialty if needed
      let best = docs.reduce((a,b) => (load[a.name]||0)<=(load[b.name]||0)?a:b);
      // If problem mentions food/nutrition, prefer nutrition type
      if(appt.problem && /food|khana|diet|nutrition|weight/i.test(appt.problem)) {
        const nutri = docs.find(d=>d.type==='nutrition'&&d.available);
        if(nutri) best = nutri;
      }
      const idx = appts.findIndex(a=>a.id===appt.id);
      if(idx!==-1) { appts[idx].doctor = best.name; load[best.name]=(load[best.name]||0)+1; count++; }
    });

    fs.writeFileSync(APPT_FILE, JSON.stringify(appts,null,2));
    res.json({success:true, distributed:count});
  } catch(e) { res.json({success:false, error:e.message}); }
});

// ━━━━ CATEGORIES ━━━━
const CATS_FILE = path.join(__dirname, "vetraj_categories.json");
const DEFAULT_CATS = [
  {id:'liver',emoji:'🍃',name:'Liver Support'},
  {id:'deworming',emoji:'💊',name:'Deworming'},
  {id:'digestive',emoji:'🧫',name:'Digestive'},
  {id:'skin',emoji:'✨',name:'Skin Care'},
  {id:'vitamins',emoji:'💎',name:'Vitamins'},
  {id:'other',emoji:'🐾',name:'Other'},
];

app.get("/get-categories", (req, res) => {
  if(fs.existsSync(CATS_FILE)){
    try{ return res.json({categories: JSON.parse(fs.readFileSync(CATS_FILE,"utf8"))}); }catch(e){}
  }
  res.json({categories: DEFAULT_CATS});
});

app.post("/save-categories", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  fs.writeFileSync(CATS_FILE, JSON.stringify(req.body.categories, null, 2));
  res.json({success:true});
});

// ━━━━ PRODUCTS ━━━━
const PROD_FILE = path.join(__dirname, "vetraj_products.json");

const DEFAULT_PRODUCTS_SERVER = [
  {id:1,name:"Ganvet Liver Tonic",emoji:"🍃",img:"",category:"liver",mrp:399,price:299,stock:50,expiry:"2026-12",offer:"Bestseller",badge:"hot",rating:4.8,reviews:1247,desc:"Sugar-free liver tonic — dogs & cats ke liye sabse trusted liver support",tags:["Sugar Free","Dogs & Cats","Daily Use","100ml"],benefits:["Liver cells ko damage se bachata hai","Immunity badhata hai","Natural herbal formula","Appetite aur energy improve karta hai"],link:"https://vetraj.com/ganvet-liver-tonic",recs:[2,3,4]},
  {id:2,name:"VAMKIL Deworming",emoji:"💊",img:"",category:"deworming",mrp:199,price:149,stock:40,expiry:"2026-10",offer:"Vet Recommended",badge:"rec",rating:4.7,reviews:892,desc:"30ml deworming suspension — sab tarah ke keede khatam safely",tags:["30ml","Dogs & Cats","Monthly Use","Safe for Puppies"],benefits:["Roundworms tapeworms sab khatam","Puppies ke liye bhi safe","24 ghante mein kaam shuru","Easy to give"],link:"",recs:[1,3,5]},
  {id:3,name:"Vetraj Probiotic",emoji:"🧫",img:"",category:"digestive",mrp:299,price:199,stock:30,expiry:"2026-08",offer:"New Launch",badge:"new",rating:4.6,reviews:634,desc:"Gut health ke liye — loose motion constipation sab theek karta hai",tags:["Gut Health","30 Sachets","Daily Use","All Pets"],benefits:["Good bacteria badhata hai","Loose motion aur constipation fix","Immunity improve hoti hai","Appetite theek hota hai"],link:"",recs:[1,2,4]},
  {id:4,name:"Vetraj Skin Care Kit",emoji:"✨",img:"",category:"skin",mrp:599,price:399,stock:20,expiry:"2026-12",offer:"33% Off",badge:"sale",rating:4.5,reviews:421,desc:"Complete skin care — khujali rashes dry skin sab ka solution",tags:["Shampoo + Serum","Anti-Itch","Coat Shine","All Breeds"],benefits:["Khujali turant kam hoti hai","Coat shiny aur healthy","Infections se bachata hai","No harsh chemicals"],link:"",recs:[1,3,5]},
  {id:5,name:"Calcium & Multivitamin",emoji:"💎",img:"",category:"vitamins",mrp:349,price:249,stock:60,expiry:"2026-11",offer:"Popular",badge:"rec",rating:4.7,reviews:567,desc:"Complete nutrition — bones strong muscles healthy overall wellness",tags:["Calcium","60 Tablets","Puppies & Adults","Daily Use"],benefits:["Bones aur joints strong","Muscles healthy rehti hain","Brain development puppies ke liye","Daily energy maintain"],link:"",recs:[1,2,3]},
  {id:6,name:"Vetraj ORS Hydration",emoji:"💧",img:"",category:"digestive",mrp:149,price:99,stock:100,expiry:"2026-09",offer:"Must Have",badge:"new",rating:4.6,reviews:312,desc:"Emergency hydration — loose motion ya ulti ke baad instant recovery",tags:["10 Sachets","Emergency Use","All Pets","Instant Relief"],benefits:["Dehydration turant theek","Electrolytes restore","Loose motion mein first help","Easy to give"],link:"",recs:[3,1,2]},
];

function getProducts() {
  if(fs.existsSync(PROD_FILE)){
    try{
      const data = JSON.parse(fs.readFileSync(PROD_FILE,"utf8"));
      if(data && data.length > 0) return data;
    }catch(e){}
  }
  // First time — save defaults to file aur return karo
  fs.writeFileSync(PROD_FILE, JSON.stringify(DEFAULT_PRODUCTS_SERVER, null, 2));
  return DEFAULT_PRODUCTS_SERVER;
}

app.get("/get-products", (req, res) => {
  res.json({ products: getProducts() });
});

app.post("/save-product", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  const prods = getProducts();
  const p = req.body;
  if(p.id) {
    const i = prods.findIndex(x => x.id === p.id);
    if(i !== -1) prods[i] = {...prods[i], ...p};
    else prods.push({...p, createdAt: new Date().toISOString()});
  } else {
    prods.push({...p, id: Date.now(), createdAt: new Date().toISOString()});
  }
  fs.writeFileSync(PROD_FILE, JSON.stringify(prods, null, 2));
  res.json({ success: true });
});

app.post("/delete-product", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  const prods = getProducts().filter(p => p.id !== req.body.id);
  fs.writeFileSync(PROD_FILE, JSON.stringify(prods, null, 2));
  res.json({ success: true });
});

// Track product orders
app.post("/track-order", (req, res) => {
  const ORDER_FILE = path.join(__dirname, "vetraj_orders.json");
  let orders = [];
  if(fs.existsSync(ORDER_FILE)){try{orders=JSON.parse(fs.readFileSync(ORDER_FILE,"utf8"));}catch(e){}}
  orders.unshift({...req.body, id: Date.now(), time: new Date().toISOString()});
  if(orders.length > 1000) orders = orders.slice(0, 1000);
  fs.writeFileSync(ORDER_FILE, JSON.stringify(orders, null, 2));
  res.json({ success: true });
});

// Save full order
const ORDERS_FILE = path.join(__dirname, "vetraj_orders.json");
app.post("/save-order", (req, res) => {
  let orders = [];
  if(fs.existsSync(ORDERS_FILE)){try{orders=JSON.parse(fs.readFileSync(ORDERS_FILE,"utf8"));}catch(e){}}
  const order = {...req.body, serverTime: new Date().toISOString(), status: req.body.status || "confirmed"};
  orders.unshift(order);
  if(orders.length > 5000) orders = orders.slice(0, 5000);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));

  // Send email notification if configured
  console.log(`New Order: ${order.orderId} — ${order.productName} — ₹${order.total} — ${order.customer?.name}`);
  res.json({ success: true, orderId: order.orderId });
});

app.get("/get-orders", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  try{
    const orders = fs.existsSync(ORDERS_FILE) ? JSON.parse(fs.readFileSync(ORDERS_FILE,"utf8")) : [];
    const status = req.query.status;
    const filtered = status && status !== 'all' ? orders.filter(o=>o.status===status) : orders;
    res.json({ orders: filtered });
  }catch(e){ res.json({ orders: [] }); }
});

app.post("/update-order-status", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  try{
    const {orderId, status} = req.body;
    let orders = fs.existsSync(ORDERS_FILE) ? JSON.parse(fs.readFileSync(ORDERS_FILE,"utf8")) : [];
    const idx = orders.findIndex(o=>o.orderId===orderId);
    if(idx !== -1){ orders[idx].status = status; orders[idx].updatedAt = new Date().toISOString(); }
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders,null,2));
    res.json({success:true});
  }catch(e){res.json({success:false});}
});

// Generate shipping label
app.get("/generate-label/:orderId", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  try{
    const orders = fs.existsSync(ORDERS_FILE) ? JSON.parse(fs.readFileSync(ORDERS_FILE,"utf8")) : [];
    const order = orders.find(o=>o.orderId===req.params.orderId);
    if(!order) return res.status(404).json({error:"Order not found"});

    // Generate barcode string (simple)
    const barcode = order.orderId.replace('VET-','') + order.customer.pincode;

    const labelHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Shipping Label — ${order.orderId}</title>
    <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:Arial,sans-serif;padding:10px;}
    .label{border:3px solid #000;padding:14px;max-width:400px;background:#fff;}
    .hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:10px;}
    .logo{font-size:18px;font-weight:900;}
    .order-id{font-size:16px;font-weight:900;color:#dc2626;}
    .section{margin-bottom:10px;}
    .label-h{font-size:10px;font-weight:700;text-transform:uppercase;color:#666;margin-bottom:3px;}
    .label-v{font-size:14px;font-weight:700;color:#000;}
    .barcode{font-family:'Courier New',monospace;font-size:22px;letter-spacing:4px;text-align:center;margin:10px 0;padding:8px;border:1px solid #ccc;background:#f9f9f9;}
    .barcode-num{text-align:center;font-size:12px;color:#666;}
    .prod-box{background:#f0fdf4;border:2px solid #86efac;border-radius:4px;padding:10px;margin-bottom:10px;}
    .print-btn{background:#0a1628;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;width:100%;margin-top:10px;}
    @media print{.print-btn{display:none;}.label{border:2px solid #000;}}
    </style></head><body>
    <div class="label">
      <div class="hdr">
        <div><div class="logo">🐾 VETRAJ</div><div style="font-size:10px;color:#666;">Pet Hospital — vetraj.com</div></div>
        <div class="order-id">#${order.orderId}</div>
      </div>
      <div class="prod-box">
        <div class="label-h">Product</div>
        <div class="label-v">${order.productName}</div>
        <div style="font-size:12px;color:#666;">Qty: ${order.qty} | Amount: ₹${order.total}</div>
      </div>
      <div class="section">
        <div class="label-h">📦 Ship To</div>
        <div class="label-v">${order.customer.name}</div>
        <div style="font-size:13px;">${order.customer.address}</div>
        <div style="font-size:14px;font-weight:900;margin-top:4px;">PIN: ${order.customer.pincode}</div>
        <div style="font-size:13px;">📞 ${order.customer.phone}</div>
      </div>
      <div class="section">
        <div class="label-h">📍 Ship From</div>
        <div class="label-v">Vetraj Pet Hospital</div>
        <div style="font-size:12px;">Chandigarh / Haridwar Road | 📞 9568606006</div>
      </div>
      <div class="barcode">||||| ${barcode} |||||</div>
      <div class="barcode-num">${order.orderId} | ${new Date().toLocaleDateString('en-IN')}</div>
      <button class="print-btn" onclick="window.print()">🖨️ Label Print Karein</button>
    </div>
    </body></html>`;

    res.send(labelHTML);
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get("/export/orders", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).send("denied");
  const orders = fs.existsSync(ORDERS_FILE) ? JSON.parse(fs.readFileSync(ORDERS_FILE,"utf8")) : [];
  const rows = orders.map(o => [
    o.orderId||'', o.productName||'', o.qty||1, o.price||0, o.gst||0, o.delivery||0, o.total||0,
    o.customer?.name||'', o.customer?.phone||'', o.customer?.address||'', o.customer?.pincode||'',
    o.status||'', new Date(o.createdAt||o.serverTime||Date.now()).toLocaleString('en-IN')
  ].map(v=>`"${v}"`).join(','));
  const csv = ['OrderID,Product,Qty,Price,GST,Delivery,Total,Customer,Phone,Address,PIN,Status,Date',...rows].join('\n');
  res.setHeader('Content-Disposition','attachment; filename="vetraj_orders.csv"');
  res.setHeader('Content-Type','text/csv');
  res.send(csv);
});
const MED_FILE = path.join(__dirname, "vetraj_medicines.json");
const DEFAULT_MEDS = [
  {id:1,name:"Ganvet Liver Tonic",category:"Liver Support",stock:50,price:299,desc:"Sugar-free, leading liver tonic",recommended:true},
  {id:2,name:"VAMKIL Deworming Suspension",category:"Deworming",stock:40,price:149,desc:"30ml deworming suspension",recommended:true},
  {id:3,name:"Vetraj Probiotic",category:"Digestive",stock:30,price:199,desc:"Gut health probiotic",recommended:true},
  {id:4,name:"Vetraj Skin Care Kit",category:"Skin",stock:20,price:399,desc:"Complete skin care kit",recommended:true},
  {id:5,name:"ORS Powder",category:"Hydration",stock:100,price:49,desc:"Oral rehydration salts",recommended:false},
  {id:6,name:"Multivitamin Supplement",category:"Vitamins",stock:60,price:249,desc:"Daily vitamins for pets",recommended:false},
];
function getMeds() {
  if(fs.existsSync(MED_FILE)) { try{return JSON.parse(fs.readFileSync(MED_FILE,"utf8"));}catch(e){} }
  return DEFAULT_MEDS;
}
app.get("/get-medicines", (req,res) => res.json({medicines: getMeds()}));
app.post("/save-medicine", (req,res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  const meds = getMeds(); const m = req.body;
  if(m.id) { const i=meds.findIndex(x=>x.id===m.id); if(i!==-1)meds[i]={...meds[i],...m}; else meds.push({...m,id:Date.now()}); }
  else meds.push({...m,id:Date.now()});
  fs.writeFileSync(MED_FILE,JSON.stringify(meds,null,2));
  res.json({success:true});
});
app.post("/update-stock", (req,res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  const meds = getMeds(); const {id,stock} = req.body;
  const i = meds.findIndex(m=>m.id===id);
  if(i!==-1) meds[i].stock = stock;
  fs.writeFileSync(MED_FILE,JSON.stringify(meds,null,2));
  res.json({success:true});
});

// ━━━━ PRESCRIPTIONS ━━━━
const RX_FILE = path.join(__dirname, "vetraj_prescriptions.json");
app.post("/save-prescription", (req,res) => {
  let rxs = [];
  if(fs.existsSync(RX_FILE)){try{rxs=JSON.parse(fs.readFileSync(RX_FILE,"utf8"));}catch(e){}}
  rxs.push({...req.body, id:Date.now(), createdAt:new Date().toISOString()});
  fs.writeFileSync(RX_FILE,JSON.stringify(rxs,null,2));
  res.json({success:true});
});
app.get("/get-prescriptions", (req,res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  try{ const rxs=fs.existsSync(RX_FILE)?JSON.parse(fs.readFileSync(RX_FILE,"utf8")):[];
  res.json({prescriptions:rxs});}catch(e){res.json({prescriptions:[]});}
});

// ━━━━ EXCEL EXPORTS ━━━━
function toCSV(data, headers) {
  const hdr = headers.join(',');
  const rows = data.map(d => headers.map(h => `"${(d[h]||'').toString().replace(/"/g,'""')}"`).join(','));
  return [hdr,...rows].join('\n');
}

app.get("/export/leads", (req,res) => {
  if(req.query.key!=="vetraj2024") return res.status(403).send("denied");
  if(!fs.existsSync(DATA_FILE)) return res.status(404).send("No data");
  res.setHeader('Content-Disposition','attachment; filename="vetraj_leads.csv"');
  res.setHeader('Content-Type','text/csv');
  res.send(fs.readFileSync(DATA_FILE));
});

app.get("/export/appointments", (req,res) => {
  if(req.query.key!=="vetraj2024") return res.status(403).send("denied");
  const appts = fs.existsSync(APPT_FILE)?JSON.parse(fs.readFileSync(APPT_FILE,"utf8")):[];
  const filter = req.query.status;
  const data = filter && filter!=='all' ? appts.filter(a=>a.status===filter) : appts;
  const csv = toCSV(data,['owner','phone','pet','date','time','doctor','status','amount','createdAt']);
  res.setHeader('Content-Disposition',`attachment; filename="vetraj_appts_${filter||'all'}.csv"`);
  res.setHeader('Content-Type','text/csv');
  res.send(csv);
});

app.get("/export/revenue", (req,res) => {
  if(req.query.key!=="vetraj2024") return res.status(403).send("denied");
  const appts = fs.existsSync(APPT_FILE)?JSON.parse(fs.readFileSync(APPT_FILE,"utf8")):[];
  const done = appts.filter(a=>a.status==='done');
  const refunds = appts.filter(a=>a.status==='refund');
  const byDate = {};
  appts.forEach(a=>{const d=a.date||'Unknown';if(!byDate[d])byDate[d]={date:d,booked:0,done:0,refund:0,revenue:0,refundAmt:0,net:0};byDate[d][a.status]=(byDate[d][a.status]||0)+1;if(a.status==='done')byDate[d].revenue+=399;if(a.status==='refund')byDate[d].refundAmt+=399;byDate[d].net=byDate[d].revenue-byDate[d].refundAmt;});
  const csv = toCSV(Object.values(byDate),['date','booked','done','refund','revenue','refundAmt','net']);
  res.setHeader('Content-Disposition','attachment; filename="vetraj_revenue.csv"');
  res.setHeader('Content-Type','text/csv');
  res.send(csv);
});

app.get("/export/prescriptions", (req,res) => {
  if(req.query.key!=="vetraj2024") return res.status(403).send("denied");
  const rxs = fs.existsSync(RX_FILE)?JSON.parse(fs.readFileSync(RX_FILE,"utf8")):[];
  const csv = toCSV(rxs,['owner','pet','doctor','medicines','notes','date','createdAt']);
  res.setHeader('Content-Disposition','attachment; filename="vetraj_prescriptions.csv"');
  res.setHeader('Content-Type','text/csv');
  res.send(csv);
});

app.post("/foodchart-generate", async (req, res) => {
  try {
    const { prompt } = req.body;
    if(!prompt) return res.json({error:"No prompt"});

    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    });

    const https = require("https");
    const options = {
      hostname: "api.anthropic.com",
      port: 443,
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01"
      }
    };

    const request = https.request(options, (response) => {
      let data = "";
      response.on("data", chunk => data += chunk);
      response.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const text = (parsed.content||[]).map(c=>c.type==="text"?c.text:"").join("");
          res.json({ text });
        } catch(e) {
          console.error("Foodchart parse error:", e.message);
          res.json({ text: "" });
        }
      });
    });
    request.on("error", e => { console.error("Foodchart API error:", e.message); res.json({text:""}); });
    request.write(body);
    request.end();
  } catch(err) {
    console.error("Foodchart generate error:", err.message);
    res.json({ text: "" });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const { messages, context, sessionId, mode } = req.body;

    // Validate
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.json({ reply: "Sawaal samajh nahi aaya — dobara bolein 🙏" });
    }

    const doc = getDoctor(sessionId);
    if (context && context.doctorName) {
      doc.name = context.doctorName;
    }

    // Count doctor messages so far
    const doctorMsgCount = messages.filter(m => m.role === 'assistant').length;

    const system = mode === "health"
      ? getHealthSystem(context || {}, doc)
      : getConsultSystem(context || {}, doc, doctorMsgCount);

    console.log(`Chat: mode=${mode}, msgs=${messages.length}, doc=${doc.name}`);

    const data = await callClaude(system, messages);

    // Check for errors
    if (data.error) {
      console.error("Claude API error:", JSON.stringify(data.error));
      return res.json({ reply: "Ek second — dobara try karein 🙏", doctor: doc });
    }

    // Extract reply
    const rawReply = data.content && data.content[0] && data.content[0].text
      ? data.content[0].text
      : "Main sun raha hun — kya problem hai?";

    const reply = formatReply(rawReply);

    res.json({ reply, doctor: doc });

  } catch (err) {
    console.error("Server error:", err.message);
    res.json({ reply: "Connection issue — ek baar refresh karke dobara try karein 🙏" });
  }
});

// Health check
app.get("/ping", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// Health log — supervisor ke liye
app.get("/health-log", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  const LOG = path.join(__dirname, "health_log.json");
  try{
    const logs = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG,"utf8")) : [];
    res.json({logs, serverTime: new Date().toISOString(), uptime: process.uptime()});
  }catch(e){ res.json({logs:[], uptime: process.uptime()}); }
});

// Booking page
app.get("/booking", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "booking.html"));
});
app.get("/booking.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "booking.html"));
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VETRAJ API KEY MANAGEMENT SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const API_KEYS_FILE = path.join(__dirname, "vetraj_api_keys.json");

function loadApiKeys() {
  if(fs.existsSync(API_KEYS_FILE)){
    try{ return JSON.parse(fs.readFileSync(API_KEYS_FILE,"utf8")); }catch(e){}
  }
  return [];
}

function saveApiKeys(keys) {
  fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2));
}

function generateUniqueKey(prefix="VTJ") {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2,8).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

function validateApiKey(key) {
  const keys = loadApiKeys();
  return keys.find(k => k.key === key && k.active);
}

// Middleware for API key authentication
function apiKeyAuth(req, res, next) {
  const key = req.headers["x-vetraj-api-key"] || req.query.apikey;
  if(!key) return res.status(401).json({error:"API key required", hint:"Send X-Vetraj-Api-Key header"});
  const found = validateApiKey(key);
  if(!found) return res.status(403).json({error:"Invalid or inactive API key"});
  // Update last used
  const keys = loadApiKeys();
  const idx = keys.findIndex(k=>k.key===key);
  if(idx!==-1){ keys[idx].lastUsed = new Date().toISOString(); keys[idx].usageCount = (keys[idx].usageCount||0)+1; saveApiKeys(keys); }
  req.apiClient = found;
  next();
}

// Get all API keys
app.get("/admin/api-keys", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  res.json({ keys: loadApiKeys() });
});

// Generate new API key
app.post("/admin/api-keys/generate", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  const { name, type, permissions } = req.body;
  if(!name) return res.status(400).json({error:"Name required"});
  const newKey = {
    id: Date.now(),
    key: generateUniqueKey("VTJ"),
    name, type: type||"general",
    permissions: permissions||["read"],
    active: true,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    usageCount: 0
  };
  const keys = loadApiKeys();
  keys.push(newKey);
  saveApiKeys(keys);
  console.log(`API Key generated: ${newKey.key} for ${name}`);
  res.json({ success:true, key: newKey });
});

// Toggle/Revoke API key
app.post("/admin/api-keys/toggle", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  const { id } = req.body;
  const keys = loadApiKeys();
  const idx = keys.findIndex(k=>k.id===id);
  if(idx===-1) return res.status(404).json({error:"Key not found"});
  keys[idx].active = !keys[idx].active;
  saveApiKeys(keys);
  res.json({ success:true, active: keys[idx].active });
});

// Delete API key
app.post("/admin/api-keys/delete", (req, res) => {
  if(req.query.key !== "vetraj2024") return res.status(403).json({error:"denied"});
  const { id } = req.body;
  const keys = loadApiKeys().filter(k=>k.id!==id);
  saveApiKeys(keys);
  res.json({ success:true });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC API ENDPOINTS (for external use)
// Use X-Vetraj-Api-Key header
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// API: Get leads
app.get("/api/v1/leads", apiKeyAuth, (req, res) => {
  try{
    if(!fs.existsSync(DATA_FILE)) return res.json({leads:[]});
    const csv = fs.readFileSync(DATA_FILE,"utf8");
    const lines = csv.trim().split("\n");
    const headers = lines[0].split(",");
    const leads = lines.slice(1).map(line=>{
      const vals=line.split(","); const o={};
      headers.forEach((h,i)=>o[h.trim()]=(vals[i]||"").trim());
      return o;
    });
    res.json({ success:true, count:leads.length, leads });
  }catch(e){ res.json({success:false, error:e.message}); }
});

// API: Get appointments
app.get("/api/v1/appointments", apiKeyAuth, (req, res) => {
  try{
    const appts = fs.existsSync(APPT_FILE) ? JSON.parse(fs.readFileSync(APPT_FILE,"utf8")) : [];
    const status = req.query.status;
    const filtered = status ? appts.filter(a=>a.status===status) : appts;
    res.json({ success:true, count:filtered.length, appointments:filtered });
  }catch(e){ res.json({success:false, error:e.message}); }
});

// API: Get products
app.get("/api/v1/products", apiKeyAuth, (req, res) => {
  res.json({ success:true, products:getProducts() });
});

// API: Get orders
app.get("/api/v1/orders", apiKeyAuth, (req, res) => {
  try{
    const orders = fs.existsSync(ORDERS_FILE) ? JSON.parse(fs.readFileSync(ORDERS_FILE,"utf8")) : [];
    res.json({ success:true, count:orders.length, orders });
  }catch(e){ res.json({success:false, error:e.message}); }
});

// API: Save lead (external)
app.post("/api/v1/leads", apiKeyAuth, (req, res) => {
  const { ownerName, ownerPhone, petName, petType, petBreed, problem } = req.body;
  if(!ownerName||!ownerPhone) return res.status(400).json({error:"ownerName and ownerPhone required"});
  const row = [ownerName, ownerPhone, petName||"", petType||"", "", petBreed||"", problem||"", new Date().toLocaleDateString("en-IN"), new Date().toLocaleTimeString("en-IN")].join(",") + "\n";
  if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "Owner Name,Phone,Pet Name,Pet Type,Pet Age,Pet Breed,Problem,Date,Time\n");
  fs.appendFileSync(DATA_FILE, row);
  res.json({ success:true, message:"Lead saved" });
});

// API: Send WhatsApp message (via wa.me link — returns URL)
app.post("/api/v1/whatsapp/send", apiKeyAuth, (req, res) => {
  const { phone, message } = req.body;
  if(!phone||!message) return res.status(400).json({error:"phone and message required"});
  const cleanPhone = phone.replace(/\D/g,"");
  const fullPhone = cleanPhone.startsWith("91") ? cleanPhone : "91"+cleanPhone;
  const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
  // Log it
  console.log(`WA Message requested to ${fullPhone}: ${message.substring(0,50)}...`);
  res.json({ success:true, whatsappUrl: waUrl, phone: fullPhone, message });
});

// API: WhatsApp Webhook (for Meta WhatsApp Business API)
app.get("/api/v1/whatsapp/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || "vetraj_webhook_2024";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if(mode==="subscribe" && token===VERIFY_TOKEN){
    console.log("WhatsApp Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.status(403).json({error:"Verification failed"});
  }
});

app.post("/api/v1/whatsapp/webhook", (req, res) => {
  const body = req.body;
  if(body.object === "whatsapp_business_account"){
    body.entry?.forEach(entry => {
      entry.changes?.forEach(change => {
        if(change.field === "messages"){
          const messages = change.value?.messages;
          messages?.forEach(msg => {
            const from = msg.from;
            const text = msg.text?.body || "";
            console.log(`WA Message from ${from}: ${text}`);
            // Save as lead
            const row = ["WhatsApp User", from, "", "", "", "", text, new Date().toLocaleDateString("en-IN"), new Date().toLocaleTimeString("en-IN")].join(",") + "\n";
            if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "Owner Name,Phone,Pet Name,Pet Type,Pet Age,Pet Breed,Problem,Date,Time\n");
            fs.appendFileSync(DATA_FILE, row);
          });
        }
      });
    });
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// API: Platform status
app.get("/api/v1/status", apiKeyAuth, (req, res) => {
  const leads = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE,"utf8").trim().split("\n").length - 1 : 0;
  const appts = fs.existsSync(APPT_FILE) ? JSON.parse(fs.readFileSync(APPT_FILE,"utf8")).length : 0;
  const orders = fs.existsSync(ORDERS_FILE) ? JSON.parse(fs.readFileSync(ORDERS_FILE,"utf8")).length : 0;
  const products = getProducts().length;
  res.json({
    success:true,
    platform:"Vetraj AI Platform",
    version:"1.0",
    stats:{ leads, appointments:appts, orders, products },
    endpoints:{
      leads:"/api/v1/leads",
      appointments:"/api/v1/appointments",
      products:"/api/v1/products",
      orders:"/api/v1/orders",
      whatsapp:"/api/v1/whatsapp/send",
      webhook:"/api/v1/whatsapp/webhook"
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RAZORPAY PAYMENT GATEWAY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

// Create Razorpay Order
app.post("/payment/create-order", async (req, res) => {
  try {
    const { amount, currency="INR", receipt, notes={} } = req.body;
    if(!amount) return res.status(400).json({error:"Amount required"});
    if(!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      // Fallback: return placeholder when keys not set
      return res.json({
        id: "order_placeholder_" + Date.now(),
        amount: amount * 100,
        currency, receipt: receipt||"VTJ-"+Date.now(),
        status: "created",
        key: RAZORPAY_KEY_ID||"rzp_test_placeholder",
        placeholder: true
      });
    }
    const https = require("https");
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
    const body = JSON.stringify({ amount: amount*100, currency, receipt: receipt||"VTJ-"+Date.now(), notes });
    const options = {
      hostname:"api.razorpay.com", port:443, path:"/v1/orders",
      method:"POST",
      headers:{ "Content-Type":"application/json", "Content-Length":Buffer.byteLength(body), "Authorization":`Basic ${auth}` }
    };
    const request = https.request(options, r => {
      let data="";
      r.on("data",c=>data+=c);
      r.on("end",()=>{
        const d = JSON.parse(data);
        res.json({...d, key:RAZORPAY_KEY_ID});
      });
    });
    request.on("error",e=>res.status(500).json({error:e.message}));
    request.write(body); request.end();
  } catch(e){ res.status(500).json({error:e.message}); }
});

// Verify Razorpay Payment
app.post("/payment/verify", (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderData } = req.body;
    if(!RAZORPAY_KEY_SECRET) {
      // No keys — mark as verified and save
      if(orderData) {
        let orders = fs.existsSync(ORDERS_FILE)?JSON.parse(fs.readFileSync(ORDERS_FILE,"utf8")):[];
        orders.unshift({...orderData, paymentId: razorpay_payment_id||"manual", status:"paid", paidAt:new Date().toISOString()});
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders,null,2));
      }
      return res.json({success:true, verified:true});
    }
    const crypto = require("crypto");
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSig = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(body).digest("hex");
    if(expectedSig === razorpay_signature) {
      // Payment verified — save order
      if(orderData) {
        let orders = fs.existsSync(ORDERS_FILE)?JSON.parse(fs.readFileSync(ORDERS_FILE,"utf8")):[];
        orders.unshift({...orderData, paymentId:razorpay_payment_id, razorpayOrderId:razorpay_order_id, status:"paid", paidAt:new Date().toISOString()});
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders,null,2));
      }
      console.log(`Payment verified: ${razorpay_payment_id}`);
      res.json({success:true, verified:true, paymentId:razorpay_payment_id});
    } else {
      res.status(400).json({success:false, error:"Signature mismatch"});
    }
  } catch(e){ res.status(500).json({error:e.message}); }
});

// Razorpay Webhook (for auto payment capture)
app.post("/payment/webhook", (req, res) => {
  try {
    const crypto = require("crypto");
    const sig = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET||"";
    if(webhookSecret && sig) {
      const expected = crypto.createHmac("sha256",webhookSecret).update(JSON.stringify(req.body)).digest("hex");
      if(expected!==sig) return res.status(400).json({error:"Invalid signature"});
    }
    const event = req.body;
    if(event.event==="payment.captured") {
      const payment = event.payload?.payment?.entity;
      console.log(`Payment captured: ${payment?.id} — ₹${payment?.amount/100}`);
      // Update order status if order found
      if(payment?.order_id && fs.existsSync(ORDERS_FILE)) {
        let orders = JSON.parse(fs.readFileSync(ORDERS_FILE,"utf8"));
        const idx = orders.findIndex(o=>o.razorpayOrderId===payment.order_id);
        if(idx!==-1){ orders[idx].status="paid"; orders[idx].paymentId=payment.id; orders[idx].paidAt=new Date().toISOString(); }
        fs.writeFileSync(ORDERS_FILE,JSON.stringify(orders,null,2));
      }
    }
    res.json({status:"ok"});
  } catch(e){ res.status(500).json({error:e.message}); }
});

// Get Razorpay config (public key only for frontend)
app.get("/payment/config", (req, res) => {
  res.json({
    keyId: RAZORPAY_KEY_ID || "",
    configured: !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET),
    fallbackUrl: "https://rzp.io/l/vetraj399"
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Vetraj AI — Port ${PORT} — Ready!`);
  console.log(`API Key present: ${!!CLAUDE_KEY}`);
});
