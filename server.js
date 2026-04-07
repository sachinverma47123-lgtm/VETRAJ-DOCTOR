require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const https = require("https");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RATE LIMITING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: "Too many requests, please try again later" }
});
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
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
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected!"))
  .catch(err => console.error("MongoDB connection error:", err.message));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MONGOOSE MODELS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const leadSchema = new mongoose.Schema({
  date: String, time: String, ownerName: String, ownerPhone: String,
  petName: String, petType: String, petAge: String, petBreed: String,
  doctorName: String, problem: String, createdAt: { type: Date, default: Date.now }
});
const Lead = mongoose.model("Lead", leadSchema);

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
// DOCTOR SESSION (in-memory for chat assignment)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const sessionDocs = new Map();
async function getDoctor(sid) {
  const docs = await Doctor.find({ available: true }).lean();
  if (!docs.length) return { name: "Dr. Mohit Saini", exp: 25 };
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
  await Lead.create({
    date: now.toLocaleDateString("en-IN"),
    time: now.toLocaleTimeString("en-IN"),
    ownerName: d.ownerName || "",
    ownerPhone: d.ownerPhone || "",
    petName: d.petName || "",
    petType: d.petType || "",
    petAge: d.petAge || "",
    petBreed: d.petBreed || "",
    doctorName: d.doctorName || "",
    problem: d.problem || ""
  });

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

// ━━━━ APPOINTMENTS ━━━━
app.post("/save-appointment", async (req, res) => {
  try {
    await Appointment.create(req.body);
    res.json({ success: true });
  } catch (e) { console.error("Appointment save error:", e); res.json({ success: false }); }
});

app.get("/get-appointments", async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: "Access denied" });
  try {
    const appts = await Appointment.find().sort({ createdAt: -1 }).lean();
    res.json({ appointments: appts });
  } catch (e) { res.json({ appointments: [] }); }
});

app.post("/update-appointment", async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: "Access denied" });
  try {
    const { id, status, doctor } = req.body;
    const update = {};
    if (status) update.status = status;
    if (doctor) update.doctor = doctor;
    await Appointment.findByIdAndUpdate(id, update);
    res.json({ success: true });
  } catch (e) { res.json({ success: false }); }
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
  const docs = await Doctor.find().lean();
  res.json({doctors: docs});
});

app.post("/save-doctor", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  const d = req.body;
  if(d._id) {
    await Doctor.findByIdAndUpdate(d._id, d);
  } else {
    await Doctor.create(d);
  }
  res.json({success:true});
});

app.post("/delete-doctor", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  await Doctor.findByIdAndDelete(req.body.id || req.body._id);
  res.json({success:true});
});

app.post("/toggle-doctor", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  const doc = await Doctor.findById(req.body.id || req.body._id);
  if(doc) { doc.available = !doc.available; await doc.save(); }
  res.json({success:true, available: doc?.available});
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
  const cats = await Category.find().lean();
  res.json({categories: cats.map(c => ({id:c.catId, emoji:c.emoji, name:c.name}))});
});

app.post("/save-categories", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  await Category.deleteMany({});
  await Category.insertMany(req.body.categories.map(c => ({catId:c.id, emoji:c.emoji, name:c.name})));
  res.json({success:true});
});

// ━━━━ PRODUCTS ━━━━
app.get("/get-products", async (req, res) => {
  const prods = await Product.find().lean();
  res.json({ products: prods });
});

app.post("/save-product", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  const p = req.body;
  if(p._id) {
    await Product.findByIdAndUpdate(p._id, p);
  } else {
    await Product.create(p);
  }
  res.json({ success: true });
});

app.post("/delete-product", async (req, res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  await Product.findByIdAndDelete(req.body.id || req.body._id);
  res.json({ success: true });
});

// ━━━━ ORDERS ━━━━
app.post("/track-order", async (req, res) => {
  await Order.create({...req.body, createdAt: new Date()});
  res.json({ success: true });
});

app.post("/save-order", async (req, res) => {
  const order = await Order.create({...req.body, status: req.body.status || "confirmed"});
  console.log(`New Order: ${order.orderId} — ${order.productName} — ₹${order.total} — ${order.customer?.name}`);
  res.json({ success: true, orderId: order.orderId });
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
  const meds = await Medicine.find().lean();
  res.json({medicines: meds});
});

app.post("/save-medicine", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  const m = req.body;
  if(m._id) {
    await Medicine.findByIdAndUpdate(m._id, m);
  } else {
    await Medicine.create(m);
  }
  res.json({success:true});
});

app.post("/update-stock", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  const {id, stock} = req.body;
  await Medicine.findByIdAndUpdate(id, {stock});
  res.json({success:true});
});

// ━━━━ PRESCRIPTIONS ━━━━
app.post("/save-prescription", async (req,res) => {
  await Prescription.create(req.body);
  res.json({success:true});
});

app.get("/get-prescriptions", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).json({error:"denied"});
  const rxs = await Prescription.find().sort({createdAt:-1}).lean();
  res.json({prescriptions: rxs});
});

// ━━━━ CSV EXPORTS ━━━━
function toCSV(data, headers) {
  const hdr = headers.join(',');
  const rows = data.map(d => headers.map(h => `"${(d[h]||'').toString().replace(/"/g,'""')}"`).join(','));
  return [hdr,...rows].join('\n');
}

app.get("/export/leads", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).send("denied");
  const leads = await Lead.find().lean();
  if(!leads.length) return res.status(404).send("No data");
  const csv = toCSV(leads,['date','time','ownerName','ownerPhone','petName','petType','petAge','petBreed','doctorName','problem']);
  res.setHeader('Content-Disposition','attachment; filename="vetraj_leads.csv"');
  res.setHeader('Content-Type','text/csv');
  res.send(csv);
});

app.get("/export/appointments", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).send("denied");
  const filter = req.query.status;
  const query = filter && filter!=='all' ? {status:filter} : {};
  const appts = await Appointment.find(query).lean();
  const csv = toCSV(appts,['owner','phone','pet','date','time','doctor','status','amount','createdAt']);
  res.setHeader('Content-Disposition',`attachment; filename="vetraj_appts_${filter||'all'}.csv"`);
  res.setHeader('Content-Type','text/csv');
  res.send(csv);
});

app.get("/export/revenue", async (req,res) => {
  if(req.query.key !== ADMIN_KEY) return res.status(403).send("denied");
  const appts = await Appointment.find().lean();
  const byDate = {};
  appts.forEach(a=>{const d=a.date||'Unknown';if(!byDate[d])byDate[d]={date:d,booked:0,done:0,refund:0,revenue:0,refundAmt:0,net:0};byDate[d][a.status]=(byDate[d][a.status]||0)+1;if(a.status==='done')byDate[d].revenue+=399;if(a.status==='refund')byDate[d].refundAmt+=399;byDate[d].net=byDate[d].revenue-byDate[d].refundAmt;});
  const csv = toCSV(Object.values(byDate),['date','booked','done','refund','revenue','refundAmt','net']);
  res.setHeader('Content-Disposition','attachment; filename="vetraj_revenue.csv"');
  res.setHeader('Content-Type','text/csv');
  res.send(csv);
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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Vetraj AI — Port ${PORT} — Ready!`);
  console.log(`API Key present: ${!!CLAUDE_KEY}`);
});
