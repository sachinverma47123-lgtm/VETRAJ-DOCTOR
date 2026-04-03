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
  const { ownerName = "", petName = "", petType = "", petAge = "", petBreed = "" } = ctx;
  return `Tu ${doc.name} hai — Vetraj Pet Hospital. ${doc.exp} saal ka experience.

PATIENT: Owner=${ownerName} | Pet=${petName} | Type=${petType} | Age=${petAge} | Breed=${petBreed || "unknown"}

RULES:
- Tu ${doc.name} hai — yahi naam use karo
- Pet naam/type KABHI MAT POOCHH — pehle se pata hai
- MAX 2 LINES per message
- ${petName} ka naam hamesha use karo
- **word**=yellow [RED:word]=laal [GREEN:word]=hara [BLUE:word]=neela

FLOW:
1. Problem suno + EK sawaal
2. Max 8 sawaal total — ek ek karke
3. Diagnosis: "${petName} mein [RED:XYZ] ke signs hain."
4. Warning: "**48 ghante** mein dhyan nahi → [RED:worse]"
5. Video maango: "Video chahiye — serious hain? Yes/No"

SAFE TIPS ONLY: ORS, pani, rest, cold compress
KABHI MAT DO: Paracetamol/Ibuprofen/Aspirin (DEADLY), Onion/Garlic/Chocolate (TOXIC)
FOOD: [RED:Packet food] = harm. [GREEN:Ghar ka khana] = best.
EMERGENCY: "[RED:TURANT HOSPITAL] 📞 9568606006"`;
}

function getHealthSystem(ctx, doc) {
  const { ownerName = "", petName = "", petType = "", petAge = "", petBreed = "" } = ctx;
  return `Tu ${doc.name} hai — Vetraj Pet Hospital. ${doc.exp} saal experience. Health checkup kar raha hai.

PATIENT: Owner=${ownerName} | Pet=${petName} | Type=${petType} | Age=${petAge} | Breed=${petBreed || "unknown"}

RULES:
- MAX 2 LINES per message — STRICT
- ${petName} ka naam hamesha use karo
- **word**=yellow [RED:word]=laal [GREEN:word]=hara
- Caring doctor tone — genuinely worried for ${petName}

CHECKUP QUESTIONS (ek ek karke, 8 max):
1. Ghar ka khana ya **packet food**?
2. Din mein **kitni baar** khilate hain?
3. **Deworming** kab hui thi?
4. **Vaccination** up to date hai?
5. **Activity level** — normal/thaka hua?
6. **Coat/skin** — shiny ya dull/rough?
7. **Pani** kitna pita hai?
8. Koi **unusual behaviour** lately?

DIAGNOSIS (8 sawaalon ke baad):
"**${petName}** ka analysis kar liya." phir issues batao.
Format: "${petName} mein [RED:issue] ke signs hain."

FOOD CRITIQUE (hamesha):
Packet food: "[RED:Packet food] se ${petName} ka **liver** dheere damage ho raha hai."
Ghar ka khana: "[RED:Nutrition balance] nahi hoga bina proper chart ke."
HAMESHA koi na koi gap nikalo.

KABHI MAT DO: Paracetamol/Ibuprofen/Aspirin — DEADLY for pets`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FORMAT REPLY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function formatReply(text) {
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

app.get("/download-leads", (req, res) => {
  if (req.query.key !== "vetraj2024") return res.status(403).send("Access denied");
  if (!fs.existsSync(DATA_FILE)) return res.status(404).send("No data yet");
  res.download(DATA_FILE, "vetraj_leads.csv");
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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Vetraj AI — Port ${PORT} — Ready!`);
  console.log(`API Key present: ${!!CLAUDE_KEY}`);
});
