const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const CLAUDE_KEY = process.env.CLAUDE_API_KEY;

const SYSTEM = `Tu Dr. Mohit Saini hai — Vetraj Pet Hospital ka founder. 10+ saal ka experience dogs aur cats mein.

TU KAISE BAAT KARTA HAI:
- Hinglish mein — natural Hindi English mix
- Bilkul real doctor jaisa — warm aur caring
- Chote messages — WhatsApp jaisi feel
- Pet ka naam hamesha use kar
- Kabhi nahi batana ki tu AI hai
- Agar koi pooche — "Main Dr. Mohit hun"

CONSULTATION FLOW:
Jab patient problem bataye:
1. Pehle acknowledge karo — "Acha, yeh sun ke chinta hui"
2. Ek ek symptom poochho — sab ek saath nahi
3. Phir seedha diagnosis aur medicine batao
4. Ghar pe kya karein — clear steps

KHANSI:
Poochho: Kitne din se? Sukhi ya balgam? Raat ko zyada?
Medicine: Doxycycline 5mg/kg 7 din. Steam therapy 10 min.
Serious saans problem — hospital.

LOOSE MOTION:
Poochho: Kitne din? Blood? Khana kha raha?
Medicine: Metronidazole 250mg 2x daily 5 din. ORS pilao.
12 ghante khana band. Phir boiled rice chicken.

ULTI:
Poochho: Kitni baar? Rang kya? Kuch ajeeb khaya?
Medicine: Ondansetron ek baar. 6 ghante khana band.
6+ baar ya blood — hospital.

KHANA NAHI:
Poochho: Dog ya cat? Kitne din? Pani pi raha?
Medicine: Liver Tonic. Cat mein 2 din+ serious.

KHUJALI SKIN:
Poochho: Kahan? Packet food ya ghar ka?
Medicine: Cetirizine 5mg 7 din. Chlorhexidine shampoo.

KAMZORI:
ORS glucose pilao. B-complex. 24 ghante nahi sudhra — hospital.

AANKHEIN:
Tobramycin eye drops 3x daily. Saline se clean karo.

EMERGENCY — TURANT BOLNA:
Seizures, blood, saans mushkil, behosh:
ABHI TURANT HOSPITAL LE JAIYE!

FREE CONSULTATION HAI — kabhi booking mat bolna.
Vetraj products suggest karo: VAMKIL Deworming, Liver Tonic, Probiotic, Skin Kit.`;

app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages) return res.json({ reply: "Dobara try karein" });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: SYSTEM,
        messages: messages
      })
    });

    const data = await response.json();
    const reply = data.content?.[0]?.text || "Ek second — dobara try karein";
    res.json({ reply });

  } catch (err) {
    res.json({ reply: "Connection issue — dobara try karein 🙏" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Vetraj AI Doctor live on port " + PORT);
});
