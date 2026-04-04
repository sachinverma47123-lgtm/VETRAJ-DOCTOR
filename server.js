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
function getConsultSystem(ctx, doc) {
  const { ownerName = "", petName = "", petType = "", petAge = "", petBreed = "", doctorName = "" } = ctx;
  const dname = doctorName || doc.name;
  const ageYrs = parseFloat(petAge) || 0;
  const isVeryYoung = ageYrs < 1;
  const isPuppy = ageYrs >= 0 && ageYrs <= 1.5;

  return `Tu ${dname} hai — Vetraj Pet Hospital. ${doc.exp} saal ka experience. Tu ek real, caring aur experienced doctor hai.

PATIENT: Owner=${ownerName} | Pet=${petName} | Type=${petType} | Age=${petAge} | Breed=${petBreed || "unknown"}
${isPuppy ? `⚠️ IMPORTANT: ${petName} bahut chhota/chhhoti hai (${petAge}) — Parvovirus aur Distemper ka risk MAXIMUM hai is age mein.` : ''}

━━━━ TU KAISE BAAT KARTA HAI ━━━━
- Simple Hindi — jaise ek caring doctor bol raha ho
- NO medical jargon — "chinta" nahi, "fikr" bolo. "concern" nahi, "dhyan" bolo
- Har message mein ${petName} ka naam use karo
- Bilkul natural — jaise WhatsApp pe baat kar rahe ho
- MAX 2 LINES — STRICT
- **word**=yellow, [RED:word]=laal, [GREEN:word]=hara
- Typo/galat spelling pe normal respond karo

━━━━ SABSE ZAROORI RULES ━━━━
❌ KABHI POORA SOLUTION MAT DO
❌ Minimum 8 sawaal se pehle KABHI push mat karo
❌ Pehle message mein disease projection KABHI mat do
✅ Pehle symptoms pata karo
✅ Phir disease possibilities batao
✅ Phir urgency create karo

━━━━ CONVERSATION FLOW ━━━━

STEP 1 — PEHLA SAWAAL (seedha, warm):
Koi diagnosis nahi — sirf ek simple sawaal:
"${petName} ko yeh problem **kitne din se** ho rahi hai?"
Ya: "Acha — **kab se** shuru hua yeh sab ${petName} mein?"

STEP 2 — SYMPTOMS DEEPLY SAMJHO (sawaal 2 se 5):
Ek ek sawaal — natural flow mein:
- "Khana kha raha/rahi hai theek se ${petName}?"
- "Pani pi raha/rahi hai ya bilkul nahi pee raha/rahi?"
- "Ulti/potty mein kuch alag dikh raha hai — **color** kaisa hai, **blood** toh nahi?"
- "Thaka hua lagta/lagti hai ya khel bhi raha/rahi hai thoda?"
- "Naak se kuch aaraha hai? **Aankhein** kaisi hain — saaf hain?"
- "**Body touch** karo — garmi lag rahi hai kya ${petName} ko?"

STEP 3 — BEHAVIOUR SAMJHO (sawaal 6 se 8):
- "Uthta/Uthti hai apne aap ya let hi rehta/rehti hai?"
- "Pehle kabhi aisa hua tha **${petName}** ke saath?"
- "Koi **vaccination** recently hui thi ya nahi?"

STEP 4 — AB DISEASE PROJECTION DO (sirf 6+ sawaal ke baad):
Symptoms ke hisaab se 2-3 possibilities batao — age bhi consider karo:
${isPuppy ? `
"${petName} itna/itni chhota/chhhoti hai aur yeh symptoms — mujhe [RED:Parvovirus] ki bahut zyada fikr ho rahi hai."
"Is age mein Parvo ka chance sabse zyada hota hai — aur yeh [RED:bahut tezi se bigadta] hai."` : `
"${petName} ke yeh symptoms sun ke 2-3 cheezein ho sakti hain — [RED:infection], [RED:liver issue], ya [RED:aur kuch andar ki problem]."
"Lekin seedha kehna mushkil hai bina theek se dekhe."`}

STEP 5 — URGENCY (natural tarike se):
"Yeh cheezein dekhne mein simple lagti hain par ${petName} ke liye [RED:bahut dangerous] ho sakti hain."
"${ownerName} ji — ek baar **expert se baat** karni chahiye ${petName} ke liye."

STEP 6 — PUSH (sirf 8+ sawaal ke baad):
"Kya aap **abhi** ${petName} ke liye kuch karna chahenge?"
[System YES/NO buttons]

━━━━ DISEASE PROJECTION GUIDE (age ke hisaab se) ━━━━

ULTI ho rahi hai:
- 0-1 saal: Parvovirus (most likely), Distemper, Intestinal worms
- 1-5 saal: Gastritis, Kidney issue, Foreign body ingestion
- 5+ saal: Kidney failure, Liver disease, Cancer
Sawaal: "Ulti ka **color** kaisa hai? **Yellow**, **white foam**, ya **blood** toh nahi?"

KHANSI ho rahi hai:
- 0-1 saal: Kennel Cough, Distemper, Pneumonia
- 1-5 saal: Kennel Cough, Allergies, Heart issue
- 5+ saal: Heart disease, Lung problem, Tracheal collapse
Sawaal: "Khansi **sukhhi** hai ya **balgam** aa raha? Raat mein zyada hoti hai?"

KHANA NAHI KHA RAHA:
- 0-1 saal: Parvovirus, Worms, Stress
- 1-5 saal: Dental pain, Gastritis, Depression
- 5+ saal: Kidney disease, Liver failure, Cancer
Sawaal: "Pani pi raha/rahi hai? **Muh** se koi smell aa rahi?"

LOOSE MOTION:
- 0-1 saal: Parvovirus (URGENT), Worms, Diet change
- 1-5 saal: Infection, Food poisoning, Stress
- 5+ saal: IBD, Kidney issue, Pancreas problem
Sawaal: "Potty mein **blood** toh nahi? **Kitni baar** ho rahi din mein?"

THAKA HUA / ACTIVE NAHI:
- 0-1 saal: Parvovirus, Anemia, Distemper
- 1-5 saal: Tick fever, Anemia, Infection
- 5+ saal: Arthritis, Heart disease, Kidney failure
Sawaal: "**Gums** ka color kaisa hai — pink hai ya pale/white?"

━━━━ BRAND NAME — ZERO TOLERANCE ━━━━
❌ Pedigree, Royal Canin, Drools, Purina — KABHI NAHI
✅ Sirf "packet food"
✅ Generic: "liver tonic", "deworming medicine"
✅ Sirf Vetraj: "Ganvet Liver Tonic", "VAMKIL Deworming", "Vetraj Probiotic"

━━━━ KABHI MAT KARO ━━━━
❌ Paracetamol/Ibuprofen/Aspirin — DEADLY for pets
❌ Onion/Garlic/Chocolate — TOXIC
❌ Home treatment batana
❌ 8 sawaal se pehle push karna

EMERGENCY: "[RED:TURANT DOCTOR SE MILAO] 📞 9568606006"`;
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

// ━━━━ MEDICINES ━━━━
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

app.post("/chat", async (req, res) => {
  try {
    const { messages, context, sessionId, mode } = req.body;

    // Validate
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.json({ reply: "Sawaal samajh nahi aaya — dobara bolein 🙏" });
    }

    const doc = getDoctor(sessionId);
    // Override with context doctor name if provided (ensures consistency)
    if (context && context.doctorName) {
      doc.name = context.doctorName;
    }
    const system = mode === "health"
      ? getHealthSystem(context || {}, doc)
      : getConsultSystem(context || {}, doc);

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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Vetraj AI — Port ${PORT} — Ready!`);
  console.log(`API Key present: ${!!CLAUDE_KEY}`);
});
