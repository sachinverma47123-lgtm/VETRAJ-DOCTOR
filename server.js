require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const https = require("https");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const PDFDocument = require("pdfkit");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RATE LIMITING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.set("trust proxy", 1);
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later" }
});
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: { error: "Too many messages, thoda ruko 🙏" }
});
app.use("/api/", apiLimiter);
app.use("/chat", chatLimiter);

const CLAUDE_KEY = process.env.CLAUDE_API_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY || "vetraj2024";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MONGODB CONNECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let DB_READY = false;
mongoose.set('bufferCommands', false); // crash nahi hoga jab MongoDB nahi hai
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => { DB_READY = true; console.log("MongoDB connected!"); })
    .catch(err => console.error("MongoDB connection error:", err.message));
} else {
  console.log("MongoDB URI not set — running in memory-only mode");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MONGOOSE MODELS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const leadSchema = new mongoose.Schema({
  date: String, time: String, ownerName: String, ownerPhone: String,
  petName: String, petType: String, petAge: String, petBreed: String,
  doctorName: String, problem: String,
  whatsappVerified: { type: Boolean, default: false },
  chatSummary: String, chatAnswers: { type: Object, default: {} },
  reportSent: { type: Boolean, default: false }, reportUrl: String,
  consultationType: { type: String, default: "free" },
  // Funnel tracking
  funnelStep: { type: String, default: "landed" },
  funnelEvents: [{ step: String, ts: Date, meta: String }],
  sessionStart: Date, sessionEnd: Date,
  paymentPageViewed: { type: Boolean, default: false },
  paymentClicked: { type: Boolean, default: false },
  chatComplete: { type: Boolean, default: false },
  // Telecaller
  assignedTo: { type: String, default: "" },
  callerNotes: String, callerStatus: { type: String, default: "pending" }, // pending, called, booked, not_interested
  createdAt: { type: Date, default: Date.now }
});
const Lead = mongoose.model("Lead", leadSchema);

const telecallerSchema = new mongoose.Schema({
  name: String, phone: String, password: { type: String, default: "caller123" },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const Telecaller = mongoose.model("Telecaller", telecallerSchema);

const appointmentSchema = new mongoose.Schema({
  owner: String, phone: String, pet: String, petType: String, petAge: String,
  petBreed: String, date: String, time: String, doctor: String, problem: String,
  status: { type: String, default: "booked" }, amount: Number,
  createdAt: { type: Date, default: Date.now }
});
const Appointment = mongoose.model("Appointment", appointmentSchema);

const doctorSchema = new mongoose.Schema({
  name: String, exp: Number, spec: String, phone: String,
  available: { type: Boolean, default: true }, type: { type: String, default: "vet" }
});
const Doctor = mongoose.model("Doctor", doctorSchema);

const productSchema = new mongoose.Schema({
  name: String, emoji: String, img: String, category: String,
  mrp: Number, price: Number, stock: Number, expiry: String,
  offer: String, badge: String, rating: Number, reviews: Number,
  desc: String, tags: [String], benefits: [String], link: String, recs: [Number],
  createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model("Product", productSchema);

const orderSchema = new mongoose.Schema({
  orderId: String, productName: String, qty: Number, price: Number,
  gst: Number, delivery: Number, total: Number,
  customer: { name: String, phone: String, address: String, pincode: String },
  status: { type: String, default: "confirmed" }, paymentId: String,
  razorpayOrderId: String, paidAt: Date,
  createdAt: { type: Date, default: Date.now }, updatedAt: Date
});
const Order = mongoose.model("Order", orderSchema);

const medicineSchema = new mongoose.Schema({
  name: String, category: String, stock: Number, price: Number,
  desc: String, recommended: { type: Boolean, default: false }
});
const Medicine = mongoose.model("Medicine", medicineSchema);

const prescriptionSchema = new mongoose.Schema({
  owner: String, pet: String, doctor: String, medicines: String,
  notes: String, date: String, createdAt: { type: Date, default: Date.now }
});
const Prescription = mongoose.model("Prescription", prescriptionSchema);

const categorySchema = new mongoose.Schema({
  catId: String, emoji: String, name: String
});
const Category = mongoose.model("Category", categorySchema);

const apiKeySchema = new mongoose.Schema({
  key: String, name: String, type: { type: String, default: "general" },
  permissions: [String], active: { type: Boolean, default: true },
  lastUsed: Date, usageCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const ApiKey = mongoose.model("ApiKey", apiKeySchema);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEED DEFAULT DATA (if collections empty)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function seedDefaults() {
  const docCount = await Doctor.countDocuments();
  if (docCount === 0) {
    await Doctor.insertMany([
      {name:"Dr. Rohit Saini",exp:10,spec:"Dog & Cat Specialist",phone:"",available:true,type:"vet"},
      {name:"Dr. Tanmay",exp:9,spec:"Small Animal Vet",phone:"",available:true,type:"vet"},
      {name:"Dr. Aman",exp:8,spec:"General Veterinary",phone:"",available:true,type:"vet"},
      {name:"Dr. Vineet Pal",exp:12,spec:"Dog Specialist",phone:"",available:true,type:"vet"},
      {name:"Dr. Neeraj Batra",exp:11,spec:"Cat & Dog Vet",phone:"",available:true,type:"vet"},
      {name:"Dr. Neeraj Singhal",exp:14,spec:"Senior Vet",phone:"",available:true,type:"vet"},
      {name:"Dr. Rajan Gangwar",exp:13,spec:"Dog Specialist",phone:"",available:true,type:"vet"},
      {name:"Dr. Gurpreet Singh",exp:10,spec:"General Vet",phone:"",available:true,type:"vet"},
      {name:"Dr. Amit Saini",exp:9,spec:"Small Animal",phone:"",available:true,type:"vet"},
      {name:"Dr. Sushant Agrawal",exp:15,spec:"Senior Specialist",phone:"",available:true,type:"vet"},
      {name:"Dr. Sanjeet Singh",exp:11,spec:"Dog & Cat Vet",phone:"",available:true,type:"vet"},
      {name:"Dr. Harsh Sharma",exp:8,spec:"General Vet",phone:"",available:true,type:"vet"},
      {name:"Dr. Rajesh Saini",exp:20,spec:"Senior Vet",phone:"",available:true,type:"vet"},
      {name:"Dr. Mohit Saini",exp:25,spec:"Founder & Chief Vet",phone:"9568606006",available:true,type:"vet"},
      {name:"Dr. Nishant Singh",exp:12,spec:"Dog Specialist",phone:"",available:true,type:"vet"},
      {name:"Dr. David",exp:9,spec:"Small Animal Vet",phone:"",available:true,type:"vet"},
      {name:"Nutrition Expert",exp:8,spec:"Pet Nutrition & Diet",phone:"",available:true,type:"nutrition"},
    ]);
    console.log("Seeded default doctors");
  }

  const prodCount = await Product.countDocuments();
  if (prodCount === 0) {
    await Product.insertMany([
      {name:"Ganvet Liver Tonic",emoji:"🍃",img:"",category:"liver",mrp:399,price:299,stock:50,expiry:"2026-12",offer:"Bestseller",badge:"hot",rating:4.8,reviews:1247,desc:"Sugar-free liver tonic — dogs & cats ke liye sabse trusted liver support",tags:["Sugar Free","Dogs & Cats","Daily Use","100ml"],benefits:["Liver cells ko damage se bachata hai","Immunity badhata hai","Natural herbal formula","Appetite aur energy improve karta hai"],link:"https://vetraj.com/ganvet-liver-tonic",recs:[2,3,4]},
      {name:"VAMKIL Deworming",emoji:"💊",img:"",category:"deworming",mrp:199,price:149,stock:40,expiry:"2026-10",offer:"Vet Recommended",badge:"rec",rating:4.7,reviews:892,desc:"30ml deworming suspension — sab tarah ke keede khatam safely",tags:["30ml","Dogs & Cats","Monthly Use","Safe for Puppies"],benefits:["Roundworms tapeworms sab khatam","Puppies ke liye bhi safe","24 ghante mein kaam shuru","Easy to give"],link:"",recs:[1,3,5]},
      {name:"Vetraj Probiotic",emoji:"🧫",img:"",category:"digestive",mrp:299,price:199,stock:30,expiry:"2026-08",offer:"New Launch",badge:"new",rating:4.6,reviews:634,desc:"Gut health ke liye — loose motion constipation sab theek karta hai",tags:["Gut Health","30 Sachets","Daily Use","All Pets"],benefits:["Good bacteria badhata hai","Loose motion aur constipation fix","Immunity improve hoti hai","Appetite theek hota hai"],link:"",recs:[1,2,4]},
      {name:"Vetraj Skin Care Kit",emoji:"✨",img:"",category:"skin",mrp:599,price:399,stock:20,expiry:"2026-12",offer:"33% Off",badge:"sale",rating:4.5,reviews:421,desc:"Complete skin care — khujali rashes dry skin sab ka solution",tags:["Shampoo + Serum","Anti-Itch","Coat Shine","All Breeds"],benefits:["Khujali turant kam hoti hai","Coat shiny aur healthy","Infections se bachata hai","No harsh chemicals"],link:"",recs:[1,3,5]},
      {name:"Calcium & Multivitamin",emoji:"💎",img:"",category:"vitamins",mrp:349,price:249,stock:60,expiry:"2026-11",offer:"Popular",badge:"rec",rating:4.7,reviews:567,desc:"Complete nutrition — bones strong muscles healthy overall wellness",tags:["Calcium","60 Tablets","Puppies & Adults","Daily Use"],benefits:["Bones aur joints strong","Muscles healthy rehti hain","Brain development puppies ke liye","Daily energy maintain"],link:"",recs:[1,2,3]},
      {name:"Vetraj ORS Hydration",emoji:"💧",img:"",category:"digestive",mrp:149,price:99,stock:100,expiry:"2026-09",offer:"Must Have",badge:"new",rating:4.6,reviews:312,desc:"Emergency hydration — loose motion ya ulti ke baad instant recovery",tags:["10 Sachets","Emergency Use","All Pets","Instant Relief"],benefits:["Dehydration turant theek","Electrolytes restore","Loose motion mein first help","Easy to give"],link:"",recs:[3,1,2]},
    ]);
    console.log("Seeded default products");
  }

  const medCount = await Medicine.countDocuments();
  if (medCount === 0) {
    await Medicine.insertMany([
      {name:"Ganvet Liver Tonic",category:"Liver Support",stock:50,price:299,desc:"Sugar-free, leading liver tonic",recommended:true},
      {name:"VAMKIL Deworming Suspension",category:"Deworming",stock:40,price:149,desc:"30ml deworming suspension",recommended:true},
      {name:"Vetraj Probiotic",category:"Digestive",stock:30,price:199,desc:"Gut health probiotic",recommended:true},
      {name:"Vetraj Skin Care Kit",category:"Skin",stock:20,price:399,desc:"Complete skin care kit",recommended:true},
      {name:"ORS Powder",category:"Hydration",stock:100,price:49,desc:"Oral rehydration salts",recommended:false},
      {name:"Multivitamin Supplement",category:"Vitamins",stock:60,price:249,desc:"Daily vitamins for pets",recommended:false},
    ]);
    console.log("Seeded default medicines");
  }

  const catCount = await Category.countDocuments();
  if (catCount === 0) {
    await Category.insertMany([
      {catId:'liver',emoji:'🍃',name:'Liver Support'},
      {catId:'deworming',emoji:'💊',name:'Deworming'},
      {catId:'digestive',emoji:'🧫',name:'Digestive'},
      {catId:'skin',emoji:'✨',name:'Skin Care'},
      {catId:'vitamins',emoji:'💎',name:'Vitamins'},
      {catId:'other',emoji:'🐾',name:'Other'},
    ]);
    console.log("Seeded default categories");
  }
}
mongoose.connection.once("open", seedDefaults);

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
// IN-MEMORY STORE (used when MongoDB not connected)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DATA_FILE = path.join(__dirname, "data", "leads.json");
const TC_FILE   = path.join(__dirname, "data", "telecallers.json");

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
}

// Load persisted data from file on startup
let memLeads = [];
let memTelecallers = [];
let memIdCounter = 1;
try {
  if (fs.existsSync(DATA_FILE)) {
    memLeads = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) || [];
    // Recalculate counter from existing IDs
    memLeads.forEach(l => {
      const n = parseInt((l._id || "").replace("mem_", ""));
      if (!isNaN(n) && n >= memIdCounter) memIdCounter = n + 1;
    });
    console.log(`[MEM] Loaded ${memLeads.length} leads from file`);
  }
} catch(e) { memLeads = []; }
try {
  if (fs.existsSync(TC_FILE)) {
    memTelecallers = JSON.parse(fs.readFileSync(TC_FILE, "utf8")) || [];
    console.log(`[MEM] Loaded ${memTelecallers.length} telecallers from file`);
  }
} catch(e) { memTelecallers = []; }

// Helper: persist to file after any change
function persistLeads() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(memLeads, null, 2)); } catch(e) {}
}
function persistTelecallers() {
  try { fs.writeFileSync(TC_FILE, JSON.stringify(memTelecallers, null, 2)); } catch(e) {}
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OTP STORE (in-memory, 10 min expiry)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const otpStore = new Map();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOCTOR SESSION (in-memory for chat assignment)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const sessionDocs = new Map();
const FALLBACK_DOCTORS = [
  {name:"Dr. Mohit Saini",exp:25,spec:"Founder & Chief Vet"},
  {name:"Dr. Rohit Saini",exp:10,spec:"Dog & Cat Specialist"},
  {name:"Dr. Tanmay",exp:9,spec:"Small Animal Vet"},
  {name:"Dr. Vineet Pal",exp:12,spec:"Dog Specialist"},
  {name:"Dr. Neeraj Batra",exp:11,spec:"Cat & Dog Vet"},
  {name:"Dr. Sushant Agrawal",exp:15,spec:"Senior Specialist"},
  {name:"Dr. Rajesh Saini",exp:20,spec:"Senior Vet"},
  {name:"Dr. Rajan Gangwar",exp:13,spec:"Dog Specialist"},
];

async function getDoctor(sid) {
  let docs = FALLBACK_DOCTORS;
  if (DB_READY) {
    try {
      const dbDocs = await Doctor.find({ available: true }).lean();
      if (dbDocs.length) docs = dbDocs;
    } catch (e) { /* use fallback */ }
  }
  if (!sid) return docs[Math.floor(Math.random() * docs.length)];
  if (!sessionDocs.has(sid)) {
    sessionDocs.set(sid, docs[Math.floor(Math.random() * docs.length)]);
    setTimeout(() => sessionDocs.delete(sid), 2 * 60 * 60 * 1000);
  }
  return sessionDocs.get(sid);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SAVE LEAD (MongoDB)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function saveLead(d) {
  const now = new Date();
  const leadData = {
    date: now.toLocaleDateString("en-IN"),
    time: now.toLocaleTimeString("en-IN"),
    ownerName: d.ownerName || "",
    ownerPhone: d.ownerPhone || "",
    petName: d.petName || "",
    petType: d.petType || "",
    petAge: d.petAge || "",
    petBreed: d.petBreed || "",
    doctorName: d.doctorName || "",
    problem: d.problem || "",
    whatsappVerified: d.whatsappVerified || false,
    funnelStep: "landed",
    funnelEvents: [{ step: "landed", ts: now, meta: "" }],
    callerStatus: "pending",
    assignedTo: "",
    consultationType: "free",
    createdAt: now
  };

  if (DB_READY) {
    try {
      const saved = await Lead.create(leadData);
      return saved;
    } catch (e) { console.error("saveLead error:", e.message); }
  } else {
    // In-memory store
    const phone = (d.ownerPhone || "").replace(/\D/g, "").slice(-10);
    const exists = memLeads.findIndex(l => l.ownerPhone === phone);
    if (exists >= 0) {
      memLeads[exists] = { ...memLeads[exists], ...leadData, _id: memLeads[exists]._id };
    } else {
      leadData._id = "mem_" + (memIdCounter++);
      memLeads.push(leadData);
    }
    persistLeads();
    console.log(`[MEM] Lead saved: ${leadData.ownerName} | ${leadData.ownerPhone} | Total: ${memLeads.length}`);
  }

  // Send lead to Akashvanni API
  try {
    const phone = (d.ownerPhone || "").toString().replace(/\D/g, "");
    if (phone) {
      const fullPhone = phone.startsWith("91") ? "+" + phone : "+91" + phone;
      const customerName = d.ownerName || "Customer";
      const apiUrl = `https://app.akashvanni.com/api/service/create-lead?user_id=69b44da471e857cddf164d22&template_name=order_initial_1&phone=${encodeURIComponent(fullPhone)}&customer_name=${encodeURIComponent(customerName)}&source=vetraj_chat`;

      https.get(apiUrl, (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => console.log(`Akashvanni lead sent: ${fullPhone} — ${res.statusCode}`));
      }).on("error", e => console.error("Akashvanni error:", e.message));
    }
  } catch (e) {
    console.error("Akashvanni API error:", e.message);
  }
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
  const { ownerName = "", petName = "", petType = "", petAge = "", petBreed = "", doctorName = "", hcCount = 0 } = ctx;
  const dname = doctorName || doc.name;
  const qNum = Math.min(hcCount + 1, 8);

  const questions = [
    `"**Ghar ka khana** dete hain ya **packet food**?"`,
    `"Din mein **kitni baar** khilate hain aur kitna?"`,
    `"**Deworming** kab hui thi — kitne mahine pehle?"`,
    `"**Vaccination** schedule up to date hai?"`,
    `"**Activity level** kaisa hai — normal hai ya thaka hua lagta hai?"`,
    `"**Coat aur skin** kaisi lag rahi hai — shiny hai ya dull/rough?"`,
    `"**Pani** din mein kitna pita hai — normal lagta hai?"`,
    `"Koi **unusual behaviour** recently — kuch alag notice kiya?"`,
  ];

  return `Tu ${dname} hai — Vetraj Pet Hospital ka experienced vet. ${doc.exp} saal experience.
Abhi ${petName} ka FREE health checkup kar raha hai WhatsApp-style conversation mein.

PATIENT: Owner=${ownerName} | Pet=${petName} | Type=${petType} | Age=${petAge} | Breed=${petBreed || "unknown"}

━━━━ CORE RULES — KABHI MAT TODNA ━━━━
- MAX 2 LINES per reply — STRICT. Ek bhi line zyada nahi.
- ${petName} ka naam HAMESHA use karo har message mein
- Warm, caring doctor tone — jaise WhatsApp pe dost doctor baat kar raha ho
- **word** = highlighted yellow | [RED:word] = red concern | [GREEN:word] = green positive
- KABHI BHI koi brand name mat lo — Pedigree, Royal Canin, Drools, Purina — KABHI NAHI
- Sirf "packet food" bolna hai. Vetraj products: "Ganvet Liver Tonic", "VAMKIL Deworming"

━━━━ CHECKUP PHASE — ABHI TU YAHAN HAI ━━━━
CURRENT QUESTION NUMBER: ${qNum} out of 8
${qNum <= 8 ? `NEXT QUESTION TO ASK: ${questions[qNum - 1]}` : ""}

🔴 STRICT RULE: Abhi SIRF ek kaam — pichhe ka jawab acknowledge karo (1 line), phir NEXT QUESTION poochho.
🔴 KOI diagnosis mat do. KISI bhi problem ka solution mat batao. KISI bhi medicine ka naam mat lo.
🔴 Payment, consultation, booking — KUCH BHI mat mention karo abhi.
🔴 Sirf next question poochho — aur kuch nahi.

━━━━ JAWAB ACKNOWLEDGE KAISE KARO ━━━━
- Packet food suna → "Achha, ${petName} packet food khata hai — noted! 📝"
- Deworming late suna → "Hmm, thodi der ho gayi — dekh lete hain. Agle sawaal..."
- Normal activity → "Good sign hai yeh! ${petName} active hai..."
Phir TURANT next question.

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
// ENDPOINTS (MongoDB)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post("/get-doctor", async (req, res) => {
  try {
    const doc = await getDoctor(req.body.sessionId);
    res.json({ doctor: doc });
  } catch (e) {
    res.json({ doctor: { name: "Dr. Mohit Saini", exp: 25 } });
  }
});

app.post("/save-lead", async (req, res) => {
  try { await saveLead(req.body); res.json({ success: true }); }
  catch (e) { res.json({ success: false }); }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHATSAPP OTP — SEND
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.json({ success: false, error: "Phone required" });

    const cleaned = phone.replace(/\D/g, "").replace(/^0+/, "");
    const last10 = cleaned.length > 10 ? cleaned.slice(-10) : cleaned;
    const fullPhone = "+91" + last10;

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(last10, { otp, expires });

    // Auto-cleanup after expiry
    setTimeout(() => otpStore.delete(last10), 10 * 60 * 1000);

    // Send via Akashvanni WhatsApp API
    const AKASHVANNI_USER = process.env.AKASHVANNI_USER_ID || "69b44da471e857cddf164d22";
    const apiUrl = `https://app.akashvanni.com/api/service/create-lead?user_id=${AKASHVANNI_USER}&template_name=otp_verification&phone=${encodeURIComponent(fullPhone)}&customer_name=Customer&otp=${otp}&source=vetraj_otp`;

    https.get(apiUrl, (r) => {
      let data = "";
      r.on("data", c => data += c);
      r.on("end", () => console.log(`OTP sent to ${fullPhone} via Akashvanni: ${r.statusCode}`));
    }).on("error", e => console.error("OTP Akashvanni error:", e.message));

    console.log(`[OTP] ${fullPhone} → ${otp}`); // Log for admin visibility
    res.json({ success: true, message: "OTP sent to WhatsApp" });
  } catch (e) {
    console.error("send-otp error:", e.message);
    res.json({ success: false, error: "OTP bhejne mein problem" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHATSAPP OTP — VERIFY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST ONLY — get OTP for any phone (admin)
app.get("/dev/otp", (req, res) => {
  if (req.query.key !== (process.env.ADMIN_KEY || "vetraj2024")) return res.json({ error: "unauthorized" });
  const phone = (req.query.phone || "").replace(/\D/g, "").slice(-10);
  const stored = otpStore.get(phone);
  if (!stored) return res.json({ error: "No OTP found for this number" });
  res.json({ phone, otp: stored.otp });
});

app.post("/verify-otp", (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.json({ success: false, error: "Phone and OTP required" });

    const last10 = phone.replace(/\D/g, "").slice(-10);
    const stored = otpStore.get(last10);

    if (!stored) return res.json({ success: false, error: "OTP nahi mila ya expire ho gaya" });
    if (Date.now() > stored.expires) {
      otpStore.delete(last10);
      return res.json({ success: false, error: "OTP expire ho gaya — dobara bhejo" });
    }
    if (stored.otp !== otp.trim()) return res.json({ success: false, error: "Galat OTP" });

    otpStore.delete(last10);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: "Verification error" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEND WHATSAPP HEALTH REPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post("/send-report", async (req, res) => {
  try {
    const { phone, ownerName, petName, petType, petAge, chatSummary, doctorName, reportUrl } = req.body;
    if (!phone) return res.json({ success: false, error: "Phone required" });

    const last10 = phone.replace(/\D/g, "").slice(-10);
    const fullPhone = "+91" + last10;

    // Save summary + report URL to latest lead
    try {
      await Lead.findOneAndUpdate(
        { ownerPhone: last10 },
        { $set: { chatSummary: chatSummary || "", reportSent: true, reportUrl: reportUrl || "" } },
        { sort: { createdAt: -1 } }
      );
    } catch (e) { console.error("Lead update error:", e.message); }

    // Send via Akashvanni — include PDF URL in message
    const AKASHVANNI_USER = process.env.AKASHVANNI_USER_ID || "69b44da471e857cddf164d22";
    const customerName = encodeURIComponent(ownerName || "Customer");
    const pet = encodeURIComponent(petName || "");
    const rUrl = encodeURIComponent(reportUrl || "");
    const apiUrl = `https://app.akashvanni.com/api/service/create-lead?user_id=${AKASHVANNI_USER}&template_name=health_report&phone=${encodeURIComponent(fullPhone)}&customer_name=${customerName}&pet_name=${pet}&report_url=${rUrl}&source=vetraj_report`;

    https.get(apiUrl, (r) => {
      let data = "";
      r.on("data", c => data += c);
      r.on("end", () => console.log(`Report sent to ${fullPhone}: ${r.statusCode}`));
    }).on("error", e => console.error("Report send error:", e.message));

    console.log(`[REPORT] Sent to ${fullPhone} for pet: ${petName} | PDF: ${reportUrl || "none"}`);
    res.json({ success: true, reportUrl: reportUrl || "" });
  } catch (e) {
    console.error("send-report error:", e.message);
    res.json({ success: false });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GENERATE HEALTH REPORT PDF
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Ensure reports folder exists
const REPORTS_DIR = path.join(__dirname, "public", "reports");
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
const LOGO_PATH = path.join(__dirname, "public", "vetraj_logo.png");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED PDF ENGINE — Professional Vetraj Report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PROBLEM_CHECKS = [
  { keys: ["joint","leg","limp","walk","stiffness","pair","ghutna","hip","lameness"], label: "Joint / Movement Issue" },
  { keys: ["eat","food","khana","appetite","bhook","vomit","ulti","stomach","digestion","nausea"], label: "Appetite / Digestion Issue" },
  { keys: ["eye","aankh","vision","dikhna","discharge","watery"], label: "Eye Concern" },
  { keys: ["coat","skin","fur","baal","itch","khujli","dull","dandruff","flaky","rash","patch"], label: "Skin / Coat Issue" },
  { keys: ["ear","kaan","scratch","khujana"], label: "Ear Concern" },
  { keys: ["breath","sans","cough","khansi","naak","nose","wheeze"], label: "Respiratory Concern" },
  { keys: ["energy","thaka","tired","lazy","slow","behaviour","unusual","letharg"], label: "Behaviour / Neurological" },
  { keys: ["pending","bimaar","sick","fever","bukhar","infection","weak"], label: "General Health Weakness" },
];

// Detect from chatHistory array
function detectProblemAreas(chatHistory) {
  const text = (chatHistory || []).map(m => m.content || "").join(" ").toLowerCase();
  const areas = [];

  const seen = new Set();
  for (const c of PROBLEM_CHECKS) {
    if (seen.has(c.label)) continue;
    if (c.keys.some(k => text.includes(k))) {
      seen.add(c.label);
      areas.push({ label: c.label });
    }
  }
  if (areas.length === 0) { areas.push({ label: "Nutritional Deficiency" }); areas.push({ label: "Immunity Concern" }); }
  else if (areas.length === 1) { areas.push({ label: "Overall Health Risk" }); }
  return areas;
}

// Detect from plain text string (problem field)
function detectProblemAreasFromText(text) {
  const t = (text || "").toLowerCase();
  const areas = [];
  const seen = new Set();
  for (const c of PROBLEM_CHECKS) {
    if (seen.has(c.label)) continue;
    if (c.keys.some(k => t.includes(k))) {
      seen.add(c.label);
      areas.push({ label: c.label });
    }
  }
  if (areas.length === 0) { areas.push({ label: "Nutritional Deficiency" }); areas.push({ label: "Immunity Concern" }); }
  else if (areas.length === 1) { areas.push({ label: "Overall Health Risk" }); }
  return areas;
}

function calcRiskPct(areas) {
  const n = areas.length;
  return n === 0 ? 12 : n === 1 ? 32 : n === 2 ? 47 : n === 3 ? 62 : n === 4 ? 73 : Math.min(85, 60 + n * 5);
}

// Draw a thick arc segment on speedometer gauge
function drawArcSegment(doc, cx, cy, r, p1, p2, color) {
  const steps = 40;
  doc.save().lineWidth(16).strokeColor(color).lineCap("round");
  const firstAngle = Math.PI + (p1 / 100) * Math.PI;
  doc.moveTo(cx + r * Math.cos(firstAngle), cy + r * Math.sin(firstAngle));
  for (let i = 1; i <= steps; i++) {
    const p = p1 + (p2 - p1) * i / steps;
    const angle = Math.PI + (p / 100) * Math.PI;
    doc.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  doc.stroke().restore();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CORE PDF BUILDER — Vetraj Branded Design
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function buildVetrajReport(doc, { reportId, ownerName, ownerPhone, petName, petType, petAge, petBreed, doctorName, problemAreas, baseUrl }) {
  const W = 595.28;
  const navy = "#0a2d5a", teal = "#0891b2", green = "#16a34a", red = "#dc2626";
  const riskPct = calcRiskPct(problemAreas);

  const statusText = riskPct >= 80 ? "CRITICAL \u2014 IMMEDIATE VET CARE" :
                     riskPct >= 60 ? "URGENT \u2014 VET CONSULTATION NOW" :
                     riskPct >= 35 ? "RISK DETECTED \u2014 CONSULT SOON" : "MONITORING NEEDED";

  // ━━ HEADER: navy bar, white logo box on left, title on right ━━
  doc.rect(0, 0, W, 80).fill(navy);

  // White logo box (rounded look via filled rect)
  doc.rect(12, 8, 150, 64).fill("#ffffff");

  // Logo image inside white box
  if (fs.existsSync(LOGO_PATH)) {
    try { doc.image(LOGO_PATH, 16, 10, { height: 60 }); } catch(e) {}
  }

  // "Pet Health Report" title right side
  doc.fontSize(26).fillColor("#ffffff").font("Helvetica-Bold")
    .text("Pet Health  Report", 175, 22, { width: W - 190, align: "right" });

  // ━━ REPORT ID bar ━━
  doc.rect(0, 80, W, 18).fill("#f1f5f9");
  const dateStr = new Date().toLocaleString("en-IN", { day:"numeric", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" });
  doc.fontSize(7.5).fillColor("#64748b").font("Helvetica")
    .text(`Report ID: ${reportId}   |   ${dateStr}`, 20, 86, { width: W - 40, align: "right" });

  // ━━ PET & OWNER DETAILS ━━
  let y = 114;
  doc.fontSize(11).fillColor(teal).font("Helvetica-Bold").text("Pet & Owner Details", 30, y);
  y += 14;

  const tableTop = y;
  const rows = [
    ["Owner Name", ownerName || "\u2014", "Pet Name", petName || "\u2014"],
    ["Mobile", ownerPhone ? `+91${(ownerPhone||"").replace(/\D/g,"").slice(-10)}` : "\u2014", "Pet Type", petType ? (petType.charAt(0).toUpperCase()+petType.slice(1)) : "Dog"],
    ["\u00a0", "\u00a0", "Breed", petBreed || "Mixed Breed"],
  ];
  const cX = [30, 148, 318, 400], cW = [116, 168, 80, 155], rH = 23;

  rows.forEach((row, ri) => {
    const bg = ri % 2 === 0 ? "#f0f4f8" : "#ffffff";
    doc.rect(30, y, W - 60, rH).fill(bg);
    doc.rect(30, y, W - 60, rH).lineWidth(0.4).strokeColor("#d1d5db").stroke();
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#4b5563").text(row[0], cX[0]+5, y+7, { width: cW[0] });
    doc.font("Helvetica").fillColor("#111827").text(row[1], cX[1]+4, y+7, { width: cW[1] });
    doc.font("Helvetica-Bold").fillColor("#4b5563").text(row[2], cX[2]+5, y+7, { width: cW[2] });
    doc.font("Helvetica").fillColor("#111827").text(row[3], cX[3]+4, y+7, { width: cW[3] });
    y += rH;
  });
  // Outer border
  doc.rect(30, tableTop, W - 60, rows.length * rH).lineWidth(1).strokeColor("#9ca3af").stroke();
  // Vertical divider
  doc.moveTo(cX[2], tableTop).lineTo(cX[2], tableTop + rows.length * rH).lineWidth(0.4).strokeColor("#d1d5db").stroke();

  y += 14;

  // ━━ GREEN CTA BUTTON ━━
  const bookingUrl = `${baseUrl}/booking.html`;
  const btnY = y;
  doc.rect(30, btnY, W - 60, 56).fill(green);
  // Button text
  doc.fontSize(16).fillColor("#ffffff").font("Helvetica-Bold")
    .text("Doctor Sa Sidhi Baat  \u2192", 30, btnY + 10, { width: W - 60, align: "center" });
  doc.fontSize(9).fillColor("rgba(255,255,255,0.88)").font("Helvetica")
    .text("Ek click mein doctor se connect karein \u2014 early consultation = better results", 30, btnY + 32, { width: W - 60, align: "center" });
  doc.link(30, btnY, W - 60, 56, bookingUrl);
  y += 70;

  // ━━ HEALTH SCORE SUMMARY ━━
  doc.fontSize(11).fillColor(teal).font("Helvetica-Bold").text("Health Score Summary", 30, y);
  y += 13;

  // Risk box — red border
  const boxH = 60;
  doc.rect(30, y, W - 60, boxH).fill("#fef2f2");
  doc.rect(30, y, W - 60, boxH).lineWidth(1.2).strokeColor("#f87171").stroke();

  // Left: status text
  doc.fontSize(13).fillColor(red).font("Helvetica-Bold").text(statusText, 40, y + 8, { width: 290 });
  // Small red squares (like reference image)
  doc.rect(40, y + 30, 8, 8).fill(red);
  doc.rect(52, y + 30, 8, 8).fill(red);
  doc.fontSize(8).fillColor("#9ca3af").font("Helvetica").text("Overall Health Status", 40, y + 44);

  // Right: risk %
  doc.fontSize(40).fillColor(red).font("Helvetica-Bold")
    .text(`${riskPct}%`, W - 175, y + 4, { width: 140, align: "right" });
  doc.fontSize(9).fillColor(red).font("Helvetica-Bold")
    .text("Risk Index", W - 155, y + 46, { width: 120, align: "right" });

  y += boxH + 12;

  // ━━ SPEEDOMETER GAUGE ━━
  const gaugeH = 120;
  const cx = W / 2, cy = y + gaugeH - 20, r = 82;

  // Background grey track
  drawArcSegment(doc, cx, cy, r, 0, 100, "#e5e7eb");
  // Colour bands: green / yellow / orange / red
  drawArcSegment(doc, cx, cy, r,  0,  30, "#22c55e");
  drawArcSegment(doc, cx, cy, r, 30,  60, "#f59e0b");
  drawArcSegment(doc, cx, cy, r, 60,  80, "#f97316");
  drawArcSegment(doc, cx, cy, r, 80, 100, "#ef4444");

  // Labels (matching reference exactly)
  doc.fontSize(8).fillColor("#374151").font("Helvetica-Bold");
  // Stable — far left
  doc.text("Stable", cx - r - 36, cy + 8, { width: 38, align: "center" });
  // Alert — far right
  doc.text("Alert",  cx + r,       cy + 8, { width: 38, align: "center" });
  // Risk — above left quarter
  const angRisk    = Math.PI + 0.30 * Math.PI;
  const angConcern = Math.PI + 0.60 * Math.PI;
  doc.text("Risk",    cx + (r + 12) * Math.cos(angRisk)    - 10, cy + (r + 12) * Math.sin(angRisk)    - 6, { width: 28 });
  doc.text("Concern", cx + (r + 12) * Math.cos(angConcern) - 16, cy + (r + 12) * Math.sin(angConcern) - 6, { width: 42 });

  // Needle — angle proportional to riskPct (0%=left, 100%=right)
  const needleAngle = Math.PI + (riskPct / 100) * Math.PI;
  const nx = cx + (r - 14) * Math.cos(needleAngle);
  const ny = cy + (r - 14) * Math.sin(needleAngle);
  doc.save().lineWidth(2.5).strokeColor("#111827").lineCap("round")
    .moveTo(cx, cy).lineTo(nx, ny).stroke().restore();
  // Center circle
  doc.circle(cx, cy, 7).fill("#0a2d5a");
  doc.circle(cx, cy, 3).fill("#ffffff");

  // Bottom divider line (as in reference)
  doc.rect(30, cy + 14, W - 60, 3).fill("#1e3a5f");

  y += gaugeH + 14;

  // ━━ DOCTOR RECOMMENDATIONS ━━
  doc.fontSize(11).fillColor("#111827").font("Helvetica-Bold").text("Doctor Recommendations", 30, y);
  y += 15;

  // Detailed recommendations with procedure names
  const recData = {
    "Joint / Movement Issue":    { text: "Mobility mein dikkat — joint pain ya arthritis ka sign. Recommended: Hip X-ray, Joint mobility exam, anti-inflammatory protocol." },
    "Appetite / Digestion Issue":{ text: "Digestive problem detect hui. Recommended: Bland diet, deworming, Endoscopy evaluation, fresh water ensure karo." },
    "Eye Concern":               { text: "Aankh mein issue detected. Recommended: Ophthalmoscopy exam, eye culture test, antibiotic drops evaluation." },
    "Skin / Coat Issue":         { text: "Skin/coat problem hai. Recommended: Allergy panel test, Skin scraping, flea treatment, nutritional supplement review." },
    "Ear Concern":               { text: "Kaan mein infection sign. Recommended: Otoscopy exam, Ear culture test, cleaning protocol, antifungal/antibiotic drops." },
    "Respiratory Concern":       { text: "Saas ki problem detected. Recommended: Chest X-ray, Bronchoscopy evaluation, respiratory panel test." },
    "Behaviour / Neurological":  { text: "Behaviour change detected. Recommended: Neurological exam, MRI/CT scan evaluation, thyroid function test." },
    "General Health Weakness":   { text: "General weakness detected. Recommended: Complete blood panel, CBC test, full physical examination." },
    "Nutritional Deficiency":    { text: "Ghar ka khana nutritionally incomplete. Recommended: Vet-approved dog food, vitamin supplement, diet chart consultation." },
    "Immunity Concern":          { text: "Immunity issue detected. Recommended: Vaccination review, Immunity booster protocol, titer test." },
    "Overall Health Risk":       { text: "Overall health risk detected. Recommended: Comprehensive wellness exam, blood work, preventive care plan." },
  };

  // First bullet: urgent (with double-square like reference)
  doc.rect(40, y + 2, 7, 7).fill(red);
  doc.rect(50, y + 2, 7, 7).fill(red);
  doc.fontSize(9).fillColor("#111827").font("Helvetica-Bold")
    .text(`Urgent \u2014 abhi vet se milo, der mat karo.`, 62, y, { width: W - 100 });
  y += 16;

  // Food recommendation always
  doc.fontSize(9).fillColor("#374151").font("Helvetica")
    .text(`\u2022  Ghar ka khana dogs ke liye nutritionally incomplete hota hai \u2014 proper dog food pe switch karo.`, 40, y, { width: W - 78 });
  y += 14;

  // Problem-specific recs
  for (const area of problemAreas.slice(0, 4)) {
    const rd = recData[area.label];
    if (rd) {
      doc.fontSize(9).fillColor("#374151").font("Helvetica")
        .text(`\u2022  ${rd.text}`, 40, y, { width: W - 78 });
      y += doc.heightOfString(`\u2022  ${rd.text}`, { width: W - 78 }) + 4;
    }
  }

  // If room, add general tip
  if (y < 740) {
    doc.fontSize(9).fillColor("#374151").font("Helvetica")
      .text(`\u2022  Regular health checkup har 6 mahine mein \u2014 prevention is better than cure.`, 40, y, { width: W - 78 });
    y += 14;
  }

  // ━━ FOOTER ━━
  const footY = Math.max(y + 10, 775);
  doc.rect(0, footY - 2, W, 0.5).fill("#e5e7eb");
  const docName = doctorName || "Vetraj Expert Vet";
  doc.fontSize(7).fillColor("#9ca3af").font("Helvetica")
    .text(`Generated by Vetraj AI Pet Health Assistant  \u2022  ${new Date().toLocaleDateString("en-IN")}  \u2022  Report ID: ${reportId}`, 20, footY + 2, { width: W - 40, align: "center" });
  doc.fontSize(7).fillColor("#9ca3af")
    .text("This report is for informational purposes only and does not replace professional veterinary advice.", 20, footY + 12, { width: W - 40, align: "center" });
}

// Helper: create PDF file and return URL
async function makePDF(fileName, drawFn) {
  const filePath = path.join(REPORTS_DIR, fileName);
  const pdfDoc = new PDFDocument({ size: "A4", margin: 0 });
  const stream = fs.createWriteStream(filePath);
  pdfDoc.pipe(stream);
  drawFn(pdfDoc);
  pdfDoc.end();
  await new Promise((res, rej) => { stream.on("finish", res); stream.on("error", rej); });
  return filePath;
}

app.post("/generate-report", async (req, res) => {
  try {
    const { ownerName, petName, petType, petAge, petBreed, chatHistory, doctorName, phone } = req.body;
    const reportId = "VR" + Date.now().toString().slice(-8);
    const fileName = `report_${reportId}.pdf`;
    const problemAreas = detectProblemAreas(chatHistory || []);
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    await makePDF(fileName, doc => buildVetrajReport(doc, { reportId, ownerName, ownerPhone: phone, petName, petType, petAge, petBreed, doctorName, problemAreas, baseUrl }));
    const reportUrl = `${baseUrl}/reports/${fileName}`;
    console.log(`[PDF] Generated: ${fileName}`);
    res.json({ success: true, reportUrl, reportId });
  } catch (e) {
    console.error("generate-report error:", e.message);
    res.json({ success: false });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNNEL TRACKING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post("/track-funnel", async (req, res) => {
  try {
    const { phone, step, meta, chatAnswers, reportUrl } = req.body;
    if (!phone || !step) return res.json({ success: false });
    const last10 = phone.replace(/\D/g, "").slice(-10);
    const now = new Date();
    const update = {
      $set: { funnelStep: step },
      $push: { funnelEvents: { step, ts: now, meta: meta || "" } }
    };
    if (chatAnswers) update.$set.chatAnswers = chatAnswers;
    if (reportUrl) update.$set.reportUrl = reportUrl;
    if (step === "chat_complete") { update.$set.chatComplete = true; update.$set.sessionEnd = now; }
    if (step === "payment_page") update.$set.paymentPageViewed = true;
    if (step === "payment_clicked") update.$set.paymentClicked = true;
    if (step === "payment_done") update.$set.consultationType = "paid";

    if (!DB_READY) {
      const idx = memLeads.findIndex(l => l.ownerPhone === last10);
      if (idx >= 0) {
        memLeads[idx].funnelStep = step;
        if (!memLeads[idx].funnelEvents) memLeads[idx].funnelEvents = [];
        memLeads[idx].funnelEvents.push({ step, ts: now, meta: meta || "" });
        if (reportUrl) memLeads[idx].reportUrl = reportUrl;
        if (chatAnswers) memLeads[idx].chatAnswers = chatAnswers;
        if (step === "chat_complete") memLeads[idx].chatComplete = true;
        if (step === "payment_page") memLeads[idx].paymentPageViewed = true;
        if (step === "payment_clicked") memLeads[idx].paymentClicked = true;
        if (step === "payment_done") memLeads[idx].consultationType = "paid";
        persistLeads();
      }
      return res.json({ success: true });
    }
    await Lead.findOneAndUpdate(
      { ownerPhone: last10 }, update, { sort: { createdAt: -1 } }
    );
    res.json({ success: true });
  } catch (e) { res.json({ success: false }); }
});

// ━━━━ MANUAL LEAD (Telecaller incoming call) ━━━━
app.post("/add-manual-lead", async (req, res) => {
  try {
    const { key, ownerName, ownerPhone, petName, petType, petBreed, petAge, problem, assignedTo, callerStatus, source } = req.body;
    if (key !== (process.env.ADMIN_KEY || "vetraj2024")) return res.json({ success: false, error: "unauthorized" });
    if (!ownerName || !ownerPhone) return res.json({ success: false, error: "naam aur phone zaroori hai" });
    const now = new Date();
    const leadData = {
      date: now.toLocaleDateString("en-IN"),
      time: now.toLocaleTimeString("en-IN"),
      ownerName: ownerName || "",
      ownerPhone: ownerPhone.replace(/\D/g,"").slice(-10),
      petName: petName || "",
      petType: petType || "",
      petAge: petAge || "",
      petBreed: petBreed || "",
      doctorName: "",
      problem: problem || "",
      whatsappVerified: false,
      funnelStep: "chat_complete",
      funnelEvents: [{ step: "manual_call", ts: now, meta: `caller:${assignedTo||''}` }],
      callerStatus: callerStatus || "called",
      assignedTo: assignedTo || "",
      consultationType: "free",
      source: source || "manual_call",
      createdAt: now
    };
    if (!DB_READY) {
      leadData._id = "mem_" + (memIdCounter++);
      memLeads.push(leadData);
      persistLeads();
      return res.json({ success: true, id: leadData._id });
    }
    const saved = await Lead.create(leadData);
    res.json({ success: true, id: saved._id });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ━━━━ GET REPORT URL FOR TELECALLER ━━━━
app.get("/get-report", (req, res) => {
  const { phone, key } = req.query;
  if (key !== (process.env.ADMIN_KEY || "vetraj2024")) return res.json({ error: "unauthorized" });
  const last10 = (phone || "").replace(/\D/g, "").slice(-10);
  const lead = memLeads.find(l => l.ownerPhone === last10);
  if (lead && lead.reportUrl) return res.json({ url: lead.reportUrl });
  res.json({ url: null });
});

app.get("/generate-lead-report", async (req, res) => {
  const { phone, leadId, key } = req.query;
  if (key !== (process.env.ADMIN_KEY || "vetraj2024")) return res.json({ success: false, error: "unauthorized" });

  let lead = null;
  if (leadId) lead = memLeads.find(l => String(l._id) === String(leadId));
  if (!lead && phone) { const last10 = phone.replace(/\D/g,"").slice(-10); lead = memLeads.find(l => l.ownerPhone === last10); }
  if (!lead && DB_READY) {
    try {
      if (leadId) lead = await Lead.findById(leadId).lean();
      else if (phone) { const last10 = phone.replace(/\D/g,"").slice(-10); lead = await Lead.findOne({ ownerPhone: last10 }).sort({ createdAt: -1 }).lean(); }
    } catch(e) {}
  }
  if (!lead) return res.json({ success: false, error: "lead not found" });
  if (lead.reportUrl) return res.json({ success: true, url: lead.reportUrl });

  try {
    const { ownerName, ownerPhone, petName, petType, petAge, petBreed, doctorName, problem } = lead;
    const reportId = "VR" + Date.now().toString().slice(-8);
    const fileName = `report_${reportId}.pdf`;
    const problemAreas = detectProblemAreasFromText(problem || "");
    const baseUrl = req.protocol + "://" + req.get("host");
    await makePDF(fileName, doc => buildVetrajReport(doc, { reportId, ownerName, ownerPhone, petName, petType, petAge, petBreed, doctorName, problemAreas, baseUrl }));
    const reportUrl = `${baseUrl}/reports/${fileName}`;
    console.log(`[PDF] Telecaller report: ${fileName} for ${ownerName}`);
    const idx = memLeads.findIndex(l => String(l._id) === String(lead._id));
    if (idx >= 0) { memLeads[idx].reportUrl = reportUrl; persistLeads(); }
    if (DB_READY && lead._id && !String(lead._id).startsWith("mem_")) {
      try { await Lead.findByIdAndUpdate(lead._id, { $set: { reportUrl } }); } catch(e) {}
    }
    res.json({ success: true, url: reportUrl });
  } catch(e) {
    console.error("generate-lead-report error:", e.message);
    res.json({ success: false, error: e.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET LEADS JSON (enhanced with funnel)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// First get-leads-json — forwards to proper one below

// ━━━━ DELETE LEAD ━━━━
app.post("/delete-lead", async (req, res) => {
  try {
    const { id, key } = req.body;
    if (key !== (process.env.ADMIN_KEY || "vetraj2024")) return res.json({ success: false, error: "unauthorized" });
    if (!DB_READY) {
      const idx = memLeads.findIndex(l => l._id === id || String(l._id) === String(id));
      if (idx >= 0) { memLeads.splice(idx, 1); persistLeads(); }
      return res.json({ success: true });
    }
    await Lead.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TELECALLER MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get("/get-telecallers", async (req, res) => {
  try {
    if (!DB_READY) return res.json({ telecallers: memTelecallers.filter(t => t.active !== false) });
    const list = await Telecaller.find({ active: true }).lean();
    res.json({ telecallers: list });
  } catch (e) { res.json({ telecallers: [] }); }
});

app.post("/save-telecaller", async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    const key = req.query.key || req.body.key;
    if (key !== (process.env.ADMIN_KEY || "vetraj2024")) return res.json({ success: false, error: "unauthorized" });
    if (!DB_READY) {
      memTelecallers.push({ _id: "mem_tc_" + Date.now(), name, phone, password: password || "caller123", active: true });
      persistTelecallers();
      return res.json({ success: true });
    }
    await Telecaller.create({ name, phone, password: password || "caller123" });
    res.json({ success: true });
  } catch (e) { res.json({ success: false }); }
});

app.post("/delete-telecaller", async (req, res) => {
  try {
    const { id, name } = req.body;
    const key = req.query.key || req.body.key;
    if (key !== (process.env.ADMIN_KEY || "vetraj2024")) return res.json({ success: false });
    if (!DB_READY) {
      const idx = memTelecallers.findIndex(t => t._id === id || t.name === name);
      if (idx >= 0) memTelecallers[idx].active = false;
      persistTelecallers();
      return res.json({ success: true });
    }
    if (id) await Telecaller.findByIdAndUpdate(id, { active: false });
    else if (name) await Telecaller.findOneAndUpdate({ name }, { active: false });
    res.json({ success: true });
  } catch (e) { res.json({ success: false }); }
});

app.post("/assign-lead", async (req, res) => {
  try {
    const { phone, assignedTo, leadId, callerName } = req.body;
    const key = req.query.key || req.body.key;
    if (key !== (process.env.ADMIN_KEY || "vetraj2024")) return res.json({ success: false });
    const assignName = callerName || assignedTo;
    if (!DB_READY) {
      const idx = memLeads.findIndex(l => l._id === leadId || l.ownerPhone === (phone||'').replace(/\D/g,'').slice(-10));
      if (idx >= 0) { memLeads[idx].assignedTo = assignName; persistLeads(); }
      return res.json({ success: true });
    }
    if (leadId) {
      await Lead.findByIdAndUpdate(leadId, { $set: { assignedTo: assignName } });
    } else if (phone) {
      const last10 = phone.replace(/\D/g, "").slice(-10);
      await Lead.findOneAndUpdate({ ownerPhone: last10 }, { $set: { assignedTo: assignName } }, { sort: { createdAt: -1 } });
    }
    res.json({ success: true });
  } catch (e) { res.json({ success: false }); }
});

app.post("/update-caller-status", async (req, res) => {
  try {
    const { phone, callerStatus, callerNotes, callerName, leadId, followUpDate, followUpNote, followUpDone } = req.body;
    if (!DB_READY) {
      const idx = memLeads.findIndex(l => l._id === leadId || l.ownerPhone === (phone||'').replace(/\D/g,'').slice(-10));
      if (idx >= 0) {
        if (callerStatus) memLeads[idx].callerStatus = callerStatus;
        if (callerNotes !== undefined) memLeads[idx].callerNotes = callerNotes;
        if (followUpDate !== undefined) memLeads[idx].followUpDate = followUpDate;
        if (followUpNote !== undefined) memLeads[idx].followUpNote = followUpNote;
        if (followUpDone !== undefined) memLeads[idx].followUpDone = followUpDone;
        // Log activity
        if (!memLeads[idx].activityLog) memLeads[idx].activityLog = [];
        memLeads[idx].activityLog.push({
          ts: new Date(), by: callerName || 'caller',
          action: callerStatus || (followUpDate ? 'follow_up_set' : 'note_saved'),
          note: followUpDate ? `Follow-up: ${followUpDate}` : (callerNotes || '')
        });
        persistLeads();
      }
      return res.json({ success: true });
    }
    const set = {};
    if (callerStatus) set.callerStatus = callerStatus;
    if (callerNotes !== undefined) set.callerNotes = callerNotes;
    if (followUpDate !== undefined) set.followUpDate = followUpDate;
    if (followUpNote !== undefined) set.followUpNote = followUpNote;
    if (followUpDone !== undefined) set.followUpDone = followUpDone;
    const update = { $set: set, $push: { activityLog: { ts: new Date(), by: callerName||'caller', action: callerStatus||'update', note: followUpDate||callerNotes||'' } } };
    if (leadId) { await Lead.findByIdAndUpdate(leadId, update); }
    else if (phone) {
      const last10 = phone.replace(/\D/g, "").slice(-10);
      await Lead.findOneAndUpdate({ ownerPhone: last10 }, update, { sort: { createdAt: -1 } });
    }
    res.json({ success: true });
  } catch (e) { res.json({ success: false }); }
});

app.get("/caller-leads", async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.json([]);
    // Return leads assigned to this caller OR unassigned (new form submissions)
    if (!DB_READY) return res.json(memLeads.filter(l => !l.assignedTo || l.assignedTo === '' || l.assignedTo === name));
    const leads = await Lead.find({ $or: [{ assignedTo: name }, { assignedTo: '' }, { assignedTo: null }] }).sort({ createdAt: -1 }).limit(200).lean();
    res.json(leads);
  } catch (e) { res.json([]); }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FUNNEL STATS (for dashboard)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get("/funnel-stats", async (req, res) => {
  try {
    const key = req.query.key;
    if (key !== (process.env.ADMIN_KEY || "vetraj2024")) return res.json({ error: "unauthorized" });
    if (!DB_READY) return res.json({ steps: [] });
    const steps = ["landed", "otp_verified", "chat_started", "chat_complete", "payment_page", "payment_clicked", "payment_done"];
    const results = {};
    for (const step of steps) {
      results[step] = await Lead.countDocuments({ funnelStep: step });
    }
    // Also count by broader criteria
    results.total = await Lead.countDocuments({});
    results.otp_verified_total = await Lead.countDocuments({ whatsappVerified: true });
    results.chat_complete_total = await Lead.countDocuments({ chatComplete: true });
    results.payment_page_total = await Lead.countDocuments({ paymentPageViewed: true });
    results.payment_done_total = await Lead.countDocuments({ consultationType: "paid" });
    res.json(results);
  } catch (e) { res.json({ steps: [] }); }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UPDATE LEAD CONSULTATION TYPE (paid/free)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post("/update-lead-type", async (req, res) => {
  try {
    const { phone, consultationType } = req.body;
    if (!phone) return res.json({ success: false });
    const last10 = phone.replace(/\D/g, "").slice(-10);
    await Lead.findOneAndUpdate(
      { ownerPhone: last10 },
      { $set: { consultationType: consultationType || "paid" } },
      { sort: { createdAt: -1 } }
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// ━━━━ APPOINTMENTS ━━━━
app.post("/save-appointment", async (req, res) => {
  try {
    await Appointment.create(req.body);
    res.json({ success: true });
  } catch (e) { console.error("Appointment save error:", e); res.json({ success: false }); }
});

app.get("/get-appointments", async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: "Access denied" });
  if (!DB_READY) return res.json({ appointments: [] });
  try {
    const appts = await Appointment.find().sort({ createdAt: -1 }).lean();
    res.json({ appointments: appts });
  } catch (e) { res.json({ appointments: [] }); }
});

app.post("/update-appointment", async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: "Access denied" });
  if (!DB_READY) return res.json({ success: true });
  try {
    const { id, status, doctor } = req.body;
    const update = {};
    if (status) update.status = status;
    if (doctor) update.doctor = doctor;
    await Appointment.findByIdAndUpdate(id, update);
    res.json({ success: true });
  } catch (e) { res.json({ success: false }); }
});

// JSON leads endpoint — for supervisor panel (paid/unpaid segmentation)
app.get("/get-leads-json", async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: "Access denied" });
  try {
    if (!DB_READY) return res.json({ leads: [...memLeads].reverse() });
    const leads = await Lead.find().sort({ createdAt: -1 }).lean();
    res.json({ leads });
  } catch (e) { res.json({ leads: [] }); }
});

app.get("/download-leads", async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).send("Access denied");
  try {
    const leads = await Lead.find().lean();
    if (!leads.length) return res.status(404).send("No data yet");
    const header = "Date,Time,Owner,Phone,Pet,Type,Age,Breed,Doctor,Problem\n";
    const rows = leads.map(l => [l.date,l.time,l.ownerName,l.ownerPhone,l.petName,l.petType,l.petAge,l.petBreed,l.doctorName,l.problem].map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(",")).join("\n");
    res.setHeader('Content-Disposition','attachment; filename="vetraj_leads.csv"');
    res.setHeader('Content-Type','text/csv');
    res.send(header + rows);
  } catch(e) { res.status(500).send("Error"); }
});

// ━━━━ DOCTORS MANAGEMENT ━━━━
app.get("/get-doctors", async (req,res) => {
  if(!DB_READY) return res.json({doctors:[]});
  try { const docs = await Doctor.find().lean(); res.json({doctors: docs}); }
  catch(e) { res.json({doctors:[]}); }
});

app.post("/save-doctor", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  if(!DB_READY) return res.json({success:true});
  try {
    const d = req.body;
    if(d._id) { await Doctor.findByIdAndUpdate(d._id, d); }
    else { await Doctor.create(d); }
    res.json({success:true});
  } catch(e) { res.json({success:false}); }
});

app.post("/delete-doctor", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  if(!DB_READY) return res.json({success:true});
  try { await Doctor.findByIdAndDelete(req.body.id || req.body._id); res.json({success:true}); }
  catch(e) { res.json({success:false}); }
});

app.post("/toggle-doctor", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  if(!DB_READY) return res.json({success:true});
  try {
    const doc = await Doctor.findById(req.body.id || req.body._id);
    if(doc) { doc.available = !doc.available; await doc.save(); }
    res.json({success:true, available: doc?.available});
  } catch(e) { res.json({success:false}); }
});

// ━━━━ AUTO DISTRIBUTE ━━━━
app.post("/auto-distribute", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  try {
    const appts = await Appointment.find().lean();
    const docs = await Doctor.find({available:true}).lean();
    const unassigned = appts.filter(a=>!a.doctor || a.doctor==='');
    if(!unassigned.length || !docs.length) return res.json({success:true, distributed:0});

    const load = {};
    docs.forEach(d=>load[d.name]=appts.filter(a=>a.doctor===d.name&&a.status!=='done'&&a.status!=='refund').length);

    let count = 0;
    for(const appt of unassigned) {
      let best = docs.reduce((a,b) => (load[a.name]||0)<=(load[b.name]||0)?a:b);
      if(appt.problem && /food|khana|diet|nutrition|weight/i.test(appt.problem)) {
        const nutri = docs.find(d=>d.type==='nutrition'&&d.available);
        if(nutri) best = nutri;
      }
      await Appointment.findByIdAndUpdate(appt._id, {doctor: best.name});
      load[best.name]=(load[best.name]||0)+1;
      count++;
    }
    res.json({success:true, distributed:count});
  } catch(e) { res.json({success:false, error:e.message}); }
});

// ━━━━ CATEGORIES ━━━━
app.get("/get-categories", async (req, res) => {
  if(!DB_READY) return res.json({categories:[]});
  try { const cats = await Category.find().lean(); res.json({categories: cats.map(c => ({id:c.catId, emoji:c.emoji, name:c.name}))}); }
  catch(e) { res.json({categories:[]}); }
});

app.post("/save-categories", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  if(!DB_READY) return res.json({success:true});
  try { await Category.deleteMany({}); await Category.insertMany(req.body.categories.map(c => ({catId:c.id, emoji:c.emoji, name:c.name}))); res.json({success:true}); }
  catch(e) { res.json({success:false}); }
});

// ━━━━ PRODUCTS ━━━━
app.get("/get-products", async (req, res) => {
  if(!DB_READY) return res.json({products:[]});
  try { const prods = await Product.find().lean(); res.json({ products: prods }); }
  catch(e) { res.json({products:[]}); }
});

app.post("/save-product", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  if(!DB_READY) return res.json({success:true});
  try {
    const p = req.body;
    if(p._id) { await Product.findByIdAndUpdate(p._id, p); } else { await Product.create(p); }
    res.json({ success: true });
  } catch(e) { res.json({success:false}); }
});

app.post("/delete-product", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  if(!DB_READY) return res.json({success:true});
  try { await Product.findByIdAndDelete(req.body.id || req.body._id); res.json({ success: true }); }
  catch(e) { res.json({success:false}); }
});

// ━━━━ ORDERS ━━━━
app.post("/track-order", async (req, res) => {
  if(!DB_READY) return res.json({success:true});
  try { await Order.create({...req.body, createdAt: new Date()}); res.json({ success: true }); }
  catch(e) { res.json({success:false}); }
});

app.post("/save-order", async (req, res) => {
  if(!DB_READY) return res.json({success:true, orderId:'mem_'+Date.now()});
  try {
    const order = await Order.create({...req.body, status: req.body.status || "confirmed"});
    res.json({ success: true, orderId: order.orderId });
  } catch(e) { res.json({success:false}); }
});

app.get("/get-orders", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  try{
    const query = {};
    const status = req.query.status;
    if(status && status !== 'all') query.status = status;
    const orders = await Order.find(query).sort({createdAt:-1}).lean();
    res.json({ orders });
  }catch(e){ res.json({ orders: [] }); }
});

app.post("/update-order-status", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  try{
    const {orderId, status} = req.body;
    await Order.findOneAndUpdate({orderId}, {status, updatedAt: new Date()});
    res.json({success:true});
  }catch(e){res.json({success:false});}
});

// Generate shipping label
app.get("/generate-label/:orderId", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  try{
    const order = await Order.findOne({orderId: req.params.orderId}).lean();
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

app.get("/export/orders", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).send("denied");
  const orders = await Order.find().sort({createdAt:-1}).lean();
  const rows = orders.map(o => [
    o.orderId||'', o.productName||'', o.qty||1, o.price||0, o.gst||0, o.delivery||0, o.total||0,
    o.customer?.name||'', o.customer?.phone||'', o.customer?.address||'', o.customer?.pincode||'',
    o.status||'', new Date(o.createdAt||Date.now()).toLocaleString('en-IN')
  ].map(v=>`"${v}"`).join(','));
  const csv = ['OrderID,Product,Qty,Price,GST,Delivery,Total,Customer,Phone,Address,PIN,Status,Date',...rows].join('\n');
  res.setHeader('Content-Disposition','attachment; filename="vetraj_orders.csv"');
  res.setHeader('Content-Type','text/csv');
  res.send(csv);
});

// ━━━━ MEDICINES ━━━━
app.get("/get-medicines", async (req,res) => {
  if(!DB_READY) return res.json({medicines:[]});
  try { const meds = await Medicine.find().lean(); res.json({medicines: meds}); }
  catch(e) { res.json({medicines:[]}); }
});

app.post("/save-medicine", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  if(!DB_READY) return res.json({success:true});
  try {
    const m = req.body;
    if(m._id) { await Medicine.findByIdAndUpdate(m._id, m); } else { await Medicine.create(m); }
    res.json({success:true});
  } catch(e) { res.json({success:false}); }
});

app.post("/update-stock", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  if(!DB_READY) return res.json({success:true});
  try { const {id, stock} = req.body; await Medicine.findByIdAndUpdate(id, {stock}); res.json({success:true}); }
  catch(e) { res.json({success:false}); }
});

// ━━━━ PRESCRIPTIONS ━━━━
app.post("/save-prescription", async (req,res) => {
  if(!DB_READY) return res.json({success:true});
  try { await Prescription.create(req.body); res.json({success:true}); }
  catch(e) { res.json({success:false}); }
});

app.get("/get-prescriptions", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  if(!DB_READY) return res.json({prescriptions:[]});
  try { const rxs = await Prescription.find().sort({createdAt:-1}).lean(); res.json({prescriptions: rxs}); }
  catch(e) { res.json({prescriptions:[]}); }
});

// ━━━━ CSV EXPORTS ━━━━
function toCSV(data, headers) {
  const hdr = headers.join(',');
  const rows = data.map(d => headers.map(h => `"${(d[h]||'').toString().replace(/"/g,'""')}"`).join(','));
  return [hdr,...rows].join('\n');
}

app.get("/export/leads", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).send("denied");
  if(!DB_READY) { const csv = toCSV(memLeads,['date','time','ownerName','ownerPhone','petName','petType','petAge','petBreed','doctorName','problem']); res.setHeader('Content-Disposition','attachment; filename="vetraj_leads.csv"'); res.setHeader('Content-Type','text/csv'); return res.send(csv); }
  try {
    const leads = await Lead.find().lean();
    const csv = toCSV(leads,['date','time','ownerName','ownerPhone','petName','petType','petAge','petBreed','doctorName','problem']);
    res.setHeader('Content-Disposition','attachment; filename="vetraj_leads.csv"');
    res.setHeader('Content-Type','text/csv');
    res.send(csv);
  } catch(e) { res.status(500).send("Error"); }
});

app.get("/export/appointments", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).send("denied");
  if(!DB_READY) return res.send('');
  try {
    const filter = req.query.status;
    const query = filter && filter!=='all' ? {status:filter} : {};
    const appts = await Appointment.find(query).lean();
    const csv = toCSV(appts,['owner','phone','pet','date','time','doctor','status','amount','createdAt']);
    res.setHeader('Content-Disposition',`attachment; filename="vetraj_appts_${filter||'all'}.csv"`);
    res.setHeader('Content-Type','text/csv');
    res.send(csv);
  } catch(e) { res.send(''); }
});

app.get("/export/revenue", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).send("denied");
  if(!DB_READY) return res.send('');
  try {
    const appts = await Appointment.find().lean();
    const byDate = {};
    appts.forEach(a=>{const d=a.date||'Unknown';if(!byDate[d])byDate[d]={date:d,booked:0,done:0,refund:0,revenue:0,refundAmt:0,net:0};byDate[d][a.status]=(byDate[d][a.status]||0)+1;if(a.status==='done')byDate[d].revenue+=399;if(a.status==='refund')byDate[d].refundAmt+=399;byDate[d].net=byDate[d].revenue-byDate[d].refundAmt;});
    const csv = toCSV(Object.values(byDate),['date','booked','done','refund','revenue','refundAmt','net']);
    res.setHeader('Content-Disposition','attachment; filename="vetraj_revenue.csv"');
    res.setHeader('Content-Type','text/csv');
    res.send(csv);
  } catch(e) { res.send(''); }
});

app.get("/export/prescriptions", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).send("denied");
  const rxs = await Prescription.find().lean();
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

    const doc = await getDoctor(sessionId);
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
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
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
// VETRAJ API KEY MANAGEMENT (MongoDB)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function generateUniqueKey(prefix="VTJ") {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2,8).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

async function apiKeyAuth(req, res, next) {
  const key = req.headers["x-vetraj-api-key"] || req.query.apikey;
  if(!key) return res.status(401).json({error:"API key required", hint:"Send X-Vetraj-Api-Key header"});
  const found = await ApiKey.findOne({key, active:true});
  if(!found) return res.status(403).json({error:"Invalid or inactive API key"});
  found.lastUsed = new Date();
  found.usageCount = (found.usageCount||0)+1;
  await found.save();
  req.apiClient = found;
  next();
}

app.get("/admin/api-keys", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  const keys = await ApiKey.find().lean();
  res.json({ keys });
});

app.post("/admin/api-keys/generate", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  const { name, type, permissions } = req.body;
  if(!name) return res.status(400).json({error:"Name required"});
  const newKey = await ApiKey.create({
    key: generateUniqueKey("VTJ"), name, type: type||"general",
    permissions: permissions||["read"]
  });
  console.log(`API Key generated: ${newKey.key} for ${name}`);
  res.json({ success:true, key: newKey });
});

app.post("/admin/api-keys/toggle", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  const apiKey = await ApiKey.findById(req.body.id);
  if(!apiKey) return res.status(404).json({error:"Key not found"});
  apiKey.active = !apiKey.active;
  await apiKey.save();
  res.json({ success:true, active: apiKey.active });
});

app.post("/admin/api-keys/delete", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  await ApiKey.findByIdAndDelete(req.body.id);
  res.json({ success:true });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC API ENDPOINTS (MongoDB)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get("/api/v1/leads", apiKeyAuth, async (req, res) => {
  const leads = await Lead.find().sort({createdAt:-1}).lean();
  res.json({ success:true, count:leads.length, leads });
});

app.get("/api/v1/appointments", apiKeyAuth, async (req, res) => {
  const query = req.query.status ? {status:req.query.status} : {};
  const appts = await Appointment.find(query).sort({createdAt:-1}).lean();
  res.json({ success:true, count:appts.length, appointments:appts });
});

app.get("/api/v1/products", apiKeyAuth, async (req, res) => {
  const prods = await Product.find().lean();
  res.json({ success:true, products:prods });
});

app.get("/api/v1/orders", apiKeyAuth, async (req, res) => {
  const orders = await Order.find().sort({createdAt:-1}).lean();
  res.json({ success:true, count:orders.length, orders });
});

app.post("/api/v1/leads", apiKeyAuth, async (req, res) => {
  const { ownerName, ownerPhone, petName, petType, petBreed, problem } = req.body;
  if(!ownerName||!ownerPhone) return res.status(400).json({error:"ownerName and ownerPhone required"});
  const now = new Date();
  await Lead.create({
    date: now.toLocaleDateString("en-IN"), time: now.toLocaleTimeString("en-IN"),
    ownerName, ownerPhone, petName:petName||"", petType:petType||"", petBreed:petBreed||"", problem:problem||""
  });
  res.json({ success:true, message:"Lead saved" });
});

app.post("/api/v1/whatsapp/send", apiKeyAuth, (req, res) => {
  const { phone, message } = req.body;
  if(!phone||!message) return res.status(400).json({error:"phone and message required"});
  const cleanPhone = phone.replace(/\D/g,"");
  const fullPhone = cleanPhone.startsWith("91") ? cleanPhone : "91"+cleanPhone;
  const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
  console.log(`WA Message requested to ${fullPhone}: ${message.substring(0,50)}...`);
  res.json({ success:true, whatsappUrl: waUrl, phone: fullPhone, message });
});

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

app.post("/api/v1/whatsapp/webhook", async (req, res) => {
  const body = req.body;
  if(body.object === "whatsapp_business_account"){
    for(const entry of (body.entry||[])) {
      for(const change of (entry.changes||[])) {
        if(change.field === "messages"){
          for(const msg of (change.value?.messages||[])) {
            const from = msg.from;
            const text = msg.text?.body || "";
            console.log(`WA Message from ${from}: ${text}`);
            const now = new Date();
            await Lead.create({
              date: now.toLocaleDateString("en-IN"), time: now.toLocaleTimeString("en-IN"),
              ownerName:"WhatsApp User", ownerPhone:from, problem:text
            });
          }
        }
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

app.get("/api/v1/status", apiKeyAuth, async (req, res) => {
  const [leads, appts, orders, products] = await Promise.all([
    Lead.countDocuments(), Appointment.countDocuments(),
    Order.countDocuments(), Product.countDocuments()
  ]);
  res.json({
    success:true, platform:"Vetraj AI Platform", version:"2.0",
    stats:{ leads, appointments:appts, orders, products },
    endpoints:{
      leads:"/api/v1/leads", appointments:"/api/v1/appointments",
      products:"/api/v1/products", orders:"/api/v1/orders",
      whatsapp:"/api/v1/whatsapp/send", webhook:"/api/v1/whatsapp/webhook"
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
app.post("/payment/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderData } = req.body;
    if(!RAZORPAY_KEY_SECRET) {
      if(orderData) {
        await Order.create({...orderData, paymentId: razorpay_payment_id||"manual", status:"paid", paidAt:new Date()});
      }
      return res.json({success:true, verified:true});
    }
    const crypto = require("crypto");
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSig = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET).update(body).digest("hex");
    if(expectedSig === razorpay_signature) {
      if(orderData) {
        await Order.create({...orderData, paymentId:razorpay_payment_id, razorpayOrderId:razorpay_order_id, status:"paid", paidAt:new Date()});
      }
      console.log(`Payment verified: ${razorpay_payment_id}`);
      res.json({success:true, verified:true, paymentId:razorpay_payment_id});
    } else {
      res.status(400).json({success:false, error:"Signature mismatch"});
    }
  } catch(e){ res.status(500).json({error:e.message}); }
});

// Razorpay Webhook (for auto payment capture)
app.post("/payment/webhook", async (req, res) => {
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
      if(payment?.order_id) {
        await Order.findOneAndUpdate(
          {razorpayOrderId: payment.order_id},
          {status:"paid", paymentId:payment.id, paidAt:new Date()}
        );
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GITHUB WEBHOOK — AUTO DEPLOY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { exec } = require("child_process");
app.post("/webhook/deploy", (req, res) => {
  const secret = process.env.DEPLOY_SECRET || "vetraj-deploy-2024";
  const sig = req.headers["x-hub-signature-256"];
  if (sig) {
    const crypto = require("crypto");
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
    if (sig !== expected) return res.status(403).json({ error: "Invalid signature" });
  }
  console.log("Deploy webhook triggered!");
  exec("cd /var/www/vetraj && git pull && npm install && pm2 restart vetraj", (err, stdout, stderr) => {
    if (err) { console.error("Deploy error:", stderr); return res.json({ success: false, error: stderr }); }
    console.log("Deploy success:", stdout);
    res.json({ success: true, output: stdout });
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
