# 🐾 Vetraj Pet Hospital — AI Consultation Platform

> AI-powered pet health consultation system with Admin Dashboard, Telecaller Panel, and automated WhatsApp reporting.

---

## 📁 Project Structure

```
VETRAJ-DOCTOR/
├── server.js              ← Main Node.js/Express server (ALL API routes)
├── package.json           ← Dependencies
├── .env                   ← Secret keys (DO NOT commit — copy from .env.example)
├── .env.example           ← Template for environment variables
├── START-SERVER.bat       ← Windows: double-click to start server
├── data/
│   ├── leads.json         ← Lead storage (auto-created, file-based fallback)
│   └── telecallers.json   ← Telecaller accounts (auto-created)
└── public/
    ├── index.html         ← Pet Consultation Form (main funnel)
    ├── dashboard.html     ← Admin Dashboard
    ├── caller.html        ← Telecaller Panel
    ├── doctor.html        ← Doctor listing page
    ├── booking.html       ← Appointment booking
    ├── products.html      ← Pet products store
    └── reports/           ← Auto-generated PDF health reports
```

---

## 🚀 Local Setup (Developer)

### 1. Prerequisites
- Node.js 18+ → https://nodejs.org
- npm (comes with Node)

### 2. Install
```bash
git clone https://github.com/sachinverma47123-lgtm/VETRAJ-DOCTOR.git
cd VETRAJ-DOCTOR
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your API keys (see section below)
```

### 4. Start Server
```bash
node server.js
# OR on Windows: double-click START-SERVER.bat
```

### 5. Open in Browser
| Panel | URL |
|-------|-----|
| Pet Consultation Form | http://localhost:3000/ |
| Admin Dashboard | http://localhost:3000/dashboard.html |
| Telecaller Panel | http://localhost:3000/caller.html |

---

## 🔑 Environment Variables (API Keys)

Copy `.env.example` to `.env` and fill these:

### Required
| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `CLAUDE_API_KEY` | Anthropic Claude AI — pet health chat | https://console.anthropic.com → API Keys |
| `ADMIN_KEY` | Dashboard & Telecaller panel password | Set your own (default: `vetraj2024`) |
| `BASE_URL` | Your production domain | e.g., `https://vetraj.in` |

### Highly Recommended
| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `MONGODB_URI` | MongoDB Atlas database | https://cloud.mongodb.com |
| `AKASHVANNI_USER_ID` | WhatsApp OTP + PDF report sender | https://app.akashvanni.com → Profile |

### Optional (for payments)
| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `RAZORPAY_KEY_ID` | Payment gateway Key ID | https://dashboard.razorpay.com |
| `RAZORPAY_KEY_SECRET` | Payment gateway Secret | https://dashboard.razorpay.com |
| `WA_VERIFY_TOKEN` | WhatsApp webhook verify token | Set your own string |

---

## 📡 API Integrations

### 1. 🤖 Claude AI (Anthropic)
- **Used for**: Pet health Q&A chatbot in consultation form
- **Model**: `claude-sonnet-4-20250514`
- **Endpoint**: `/chat` (POST)
- **Setup**: Add `CLAUDE_API_KEY` to `.env`

### 2. 💬 Akashvanni WhatsApp API
- **Used for**:
  - OTP verification via WhatsApp
  - Health report PDF link sent to pet owner via WhatsApp
- **Templates needed** (create in Akashvanni dashboard):
  - `otp_verification` — variables: `{customer_name}`, `{otp}`
  - `health_report` — variables: `{customer_name}`, `{pet_name}`, `{report_url}`
- **API format**:
  ```
  GET https://app.akashvanni.com/api/service/create-lead
    ?user_id=YOUR_USER_ID
    &template_name=otp_verification
    &phone=+919876543210
    &customer_name=Ramesh
    &otp=123456
  ```
- **Setup**: Add `AKASHVANNI_USER_ID` to `.env`

### 3. 🗄️ MongoDB Atlas
- **Used for**: Leads, telecallers, appointments, orders, doctors, products
- **Fallback**: If not connected → data saves to `data/leads.json` (file-based)
- **Setup**:
  1. Create cluster at https://cloud.mongodb.com
  2. Create user with read/write access
  3. Whitelist IP (or use `0.0.0.0/0` for all IPs)
  4. Copy connection string → paste as `MONGODB_URI` in `.env`

### 4. 💳 Razorpay Payment Gateway
- **Used for**: Rs.399 consultation booking payment
- **Test keys**: https://dashboard.razorpay.com → API Keys → Test Mode
- **Setup**: Add `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` to `.env`

### 5. 📱 WhatsApp Business API (Meta) — Webhook
- **Used for**: Receiving WhatsApp messages (optional advanced feature)
- **Webhook URL**: `https://yourdomain.com/api/v1/whatsapp/webhook`
- **Verify Token**: Set `WA_VERIFY_TOKEN` in `.env`
- **Meta setup**: https://developers.facebook.com → WhatsApp → Configuration → Webhook

---

## 🚢 Production Deployment (Railway.app)

### Step 1 — Connect GitHub
1. Go to https://railway.app
2. New Project → Deploy from GitHub Repo
3. Select `VETRAJ-DOCTOR` repo → Deploy

### Step 2 — Set Environment Variables
Railway Dashboard → Your Project → Variables tab → Add all:

```env
CLAUDE_API_KEY=sk-ant-api03-...
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/vetraj
AKASHVANNI_USER_ID=your_akashvanni_user_id
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=your_secret_here
ADMIN_KEY=YourSecurePassword123
BASE_URL=https://your-app.up.railway.app
PORT=3000
WA_VERIFY_TOKEN=vetraj_webhook_2024
```

### Step 3 — Auto-Deploy
Railway auto-deploys on every `git push` to main branch. No manual steps needed.

### Step 4 — Custom Domain (optional)
Railway → Settings → Domains → Add custom domain → Update DNS at registrar.

---

## 👥 Panel Login Credentials

### Admin Dashboard (`/dashboard.html`)
- **Password**: value of `ADMIN_KEY` in `.env` (default: `vetraj2024`)

### Telecaller Panel (`/caller.html`)
- **Username**: Telecaller name (add from Admin Dashboard → Callers tab)
- **Password**: `caller123` (default for all, changeable in DB)

---

## 📊 Lead Flow

```
Pet owner fills form (index.html)
         ↓
/save-lead called when "Rs.399 checkup" card appears
         ↓
Lead stored in MongoDB (or data/leads.json fallback)
         ↓
Admin Dashboard → sees all leads, assigns to telecallers
         ↓
Telecaller Panel → sees assigned + all unassigned leads
         ↓
Telecaller calls owner → updates status
(pending → called → interested → follow_up → booked / not_interested)
         ↓
PDF Health Report generated on-demand → download & send on WhatsApp
```

---

## 🛠️ All API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/` | GET | — | Pet consultation form |
| `/dashboard.html` | GET | — | Admin dashboard |
| `/caller.html` | GET | — | Telecaller panel |
| `/save-lead` | POST | — | Save lead from form |
| `/get-leads-json?key=` | GET | ADMIN_KEY | All leads |
| `/caller-leads?name=` | GET | — | Leads for a telecaller (assigned + unassigned) |
| `/update-caller-status` | POST | — | Update lead status / notes / follow-up |
| `/assign-lead` | POST | ADMIN_KEY | Assign lead to telecaller |
| `/delete-lead` | POST | ADMIN_KEY | Delete a lead |
| `/generate-report` | POST | — | Generate PDF from full chat history |
| `/generate-lead-report?phone=&key=` | GET | ADMIN_KEY | Generate PDF from lead data (telecaller use) |
| `/get-report?phone=&key=` | GET | ADMIN_KEY | Get report URL for a phone |
| `/get-telecallers?key=` | GET | ADMIN_KEY | List all telecallers |
| `/add-telecaller` | POST | ADMIN_KEY | Add new telecaller |
| `/delete-telecaller` | POST | ADMIN_KEY | Delete telecaller |
| `/send-otp` | POST | — | Send OTP via WhatsApp (Akashvanni) |
| `/verify-otp` | POST | — | Verify OTP |
| `/chat` | POST | — | AI health chat (Claude) |
| `/get-doctors` | GET | — | List doctors |
| `/create-order` | POST | — | Create Razorpay payment order |
| `/verify-payment` | POST | — | Verify Razorpay payment |
| `/add-manual-lead` | POST | ADMIN_KEY | Add lead from incoming call |
| `/track-funnel` | POST | — | Track funnel step |
| `/api/v1/whatsapp/webhook` | GET | — | WhatsApp webhook verify |
| `/api/v1/whatsapp/webhook` | POST | — | WhatsApp message receive |
| `/health` | GET | — | Server health check |
| `/download-leads` | GET | ADMIN_KEY | Download leads CSV |

---

## 🔧 Telecaller PDF — How it Works

When a telecaller clicks **"📄 PDF Report"**:
1. If report already generated → opens directly
2. If not → server auto-generates from lead's health Q&A data
3. Problem areas detected from chat answers (skin, joints, eyes, etc.)
4. Professional A4 PDF with dog body diagram, concerns, doctor recommendation
5. Telecaller downloads → sends on WhatsApp to owner

---

## 📞 Project Info
- Platform: Vetraj Pet Hospital
- Stack: Node.js + Express + MongoDB + Claude AI
- GitHub: https://github.com/sachinverma47123-lgtm/VETRAJ-DOCTOR
