<p align="center">
  <img src="https://img.shields.io/badge/CivicSync-Government%20Grievance%20Platform-1e40af?style=for-the-badge&logo=shield&logoColor=white" alt="CivicSync" />
</p>

<h1 align="center">🏛️ CivicSync</h1>

<p align="center">
  <strong>AI-Powered Government Civic Grievance Redressal System</strong><br/>
  <em>Voice-first, multilingual, map-driven civic complaint platform connecting citizens to government action</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-61dafb?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-Express-339933?logo=node.js" alt="Node" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Twilio-Voice%20%26%20SMS-F22F46?logo=twilio" alt="Twilio" />
  <img src="https://img.shields.io/badge/AI-Groq%20%2B%20Sarvam-8B5CF6?logo=openai" alt="AI" />
  <img src="https://img.shields.io/badge/Maps-Mapbox%20GL-000000?logo=mapbox" alt="Mapbox" />
</p>

---

## 📌 Problem Statement

Citizens in India face significant barriers when reporting civic issues — language gaps, complex processes, and lack of transparency. Most grievance systems are form-heavy, English-only, and offer zero visibility into resolution progress.

**CivicSync** solves this by enabling citizens to **call a phone number and speak their complaint in Hindi** (or any regional language). AI transcribes, translates, extracts key details, and routes it to the right government department — all without a single form or keypress.

---

## ✨ Key Features

### 🗣️ Voice-First Complaint Pipeline
- **No keypads, no forms** — Citizens call a Twilio number, hear a Hindi greeting, speak their complaint, and hang up
- **Sarvam AI STT** transcribes regional languages (Hindi, Tamil, Telugu, etc.) into text
- **Sarvam Translate** converts the transcript to English
- **Groq LLM** (Llama 3) automatically extracts: `department`, `city`, `intent category`, and `landmark`

### 👮 Officer Approval Workflow
- Voice complaints land as **"Pending Approval"** — hidden from citizens until verified
- Senior Officers see a dedicated approval queue with **audio playback**, original/translated transcripts, and editable AI extractions
- On approval: ticket goes **"Open"**, citizen receives an **SMS confirmation** via Twilio

### 🗺️ Real-Time Geographic Intelligence
- **Mapbox GL** heatmap with clustered complaint markers
- **Spatial deduplication** — nearby complaints about the same issue are merged automatically (MongoDB `2dsphere` index)
- **Area-wise breakdown** showing pending/resolved/critical per locality

### 🔧 Multi-Role Dashboard System
| Role | Capabilities |
|------|-------------|
| **Citizen** | Submit complaints (form/voice), track status, view city map |
| **Senior Officer** | Approve voice complaints, view area analytics, manage engineers |
| **Field Engineer** | View assigned tickets, upload progress photos, mark resolved |

### 📱 PWA Support
- Installable on mobile devices as a Progressive Web App
- Offline-capable with service worker caching

### 🌐 Multilingual UI
- Interface translation powered by Sarvam Translate API
- Hindi voice support out-of-the-box with Polly.Aditi TTS

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      CITIZEN                             │
│         (Phone Call / Web Form / PWA)                    │
└─────────────┬───────────────────┬───────────────────────┘
              │                   │
         Voice Call          Web Dashboard
              │                   │
     ┌────────▼────────┐   ┌─────▼──────┐
     │   Twilio Voice  │   │  React.js  │
     │   (Hindi IVR)   │   │  Frontend  │
     └────────┬────────┘   └─────┬──────┘
              │                   │
     ┌────────▼───────────────────▼──────┐
     │         Express.js Backend        │
     │    (REST API + Voice Webhooks)    │
     └────┬──────┬──────┬──────┬────────┘
          │      │      │      │
    ┌─────▼─┐ ┌──▼──┐ ┌─▼──┐ ┌▼──────┐
    │Sarvam │ │Groq │ │ DB │ │Twilio │
    │  STT  │ │ LLM │ │Mongo│ │ SMS  │
    └───────┘ └─────┘ └────┘ └───────┘
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 18
- **MongoDB Atlas** account (free tier works)
- **Twilio** account with phone number
- **ngrok** for exposing local server to Twilio
- API Keys: **Groq**, **Sarvam AI**, **Mapbox**

### 1. Clone & Install

```bash
git clone https://github.com/devGP7/indiainnovates.git
cd indiainnovates/indiainno

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### 2. Configure Environment

Create `backend/.env`:

```env
# Database
MONGO_USER=your_mongo_user
MONGO_PASS=your_mongo_password
MONGO_HOST=cluster0.xxxxx.mongodb.net
JWT_SECRET=your_jwt_secret

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
DEMO_PHONE_NUMBER=+91xxxxxxxxxx

# AI Services
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxx
SARVAM_API_KEY=sk_xxxxxxxxxxxxxxxx

# Webhook (ngrok URL - update when ngrok restarts)
WEBHOOK_BASE_URL=https://your-subdomain.ngrok-free.dev
```

Create root `.env`:

```env
VITE_GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxx
VITE_SARVAM_API_KEY=sk_xxxxxxxxxxxxxxxx
VITE_MAPBOX_TOKEN=pk.xxxxxxxxxxxxxxxx
```

### 3. Start ngrok

```bash
ngrok http 5000
```

Copy the HTTPS URL and update `WEBHOOK_BASE_URL` in `backend/.env`.

### 4. Update Twilio Webhook

```bash
cd backend
node -e "
require('dotenv').config();
const t = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
t.incomingPhoneNumbers.list().then(nums =>
  nums.forEach(async n => {
    await t.incomingPhoneNumbers(n.sid).update({
      voiceUrl: process.env.WEBHOOK_BASE_URL + '/api/voice/incoming',
      voiceMethod: 'POST'
    });
    console.log('✅ Webhook updated for', n.phoneNumber);
  })
);
"
```

### 5. Run

```bash
# Terminal 1 — Backend
cd backend
npm start

# Terminal 2 — Frontend
npm run dev
```

Open **http://localhost:5173** 🎉

---

## 📂 Project Structure

```
indiainno/
├── backend/
│   ├── config/db.js              # MongoDB Atlas connection
│   ├── middleware/authMiddleware.js # JWT auth + role-based access
│   ├── models/
│   │   ├── Ticket.js             # MasterTicket + RawComplaint schemas
│   │   └── User.js              # User schema (citizen/officer/engineer)
│   ├── routes/
│   │   ├── auth.js              # Login, register, profile
│   │   ├── tickets.js           # CRUD, approval, analytics, dedup
│   │   ├── voice.js             # Twilio webhooks + call-me
│   │   ├── users.js             # User management
│   │   └── sms.js               # SMS notifications
│   ├── services/
│   │   ├── ai.js                # Sarvam STT + Translate + Groq LLM
│   │   └── twilio.js            # Twilio call/SMS helpers
│   └── server.js                # Express app entry point
│
├── src/
│   ├── components/
│   │   ├── DashboardLayout.jsx  # Shared sidebar layout
│   │   └── Navbar.jsx           # Top navigation
│   ├── contexts/
│   │   ├── AuthContext.jsx      # JWT auth state
│   │   └── LanguageContext.jsx  # i18n context
│   ├── pages/
│   │   ├── Landing.jsx          # Public homepage
│   │   ├── PublicMap.jsx        # Public complaint heatmap
│   │   ├── admin/               # Officer dashboard, tickets, map
│   │   ├── engineer/            # Engineer task view + resolution
│   │   └── user/                # Citizen dashboard, complaints, map
│   └── utils/
│       ├── api.js               # Axios instance
│       ├── dedup.js             # Client-side dedup logic
│       └── geolocation.js       # Browser geolocation helper
│
├── public/
│   ├── manifest.json            # PWA manifest
│   ├── sw.js                    # Service worker
│   └── icons/                   # PWA icons (72-512px)
└── package.json
```

---

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login (returns JWT) |
| `GET` | `/api/auth/me` | Get current user profile |

### Tickets
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/tickets/complaint` | Submit complaint (form) |
| `GET` | `/api/tickets/my-complaints` | Citizen's own complaints |
| `GET` | `/api/tickets/master` | All tickets (role-filtered) |
| `GET` | `/api/tickets/public-map` | Public map data |
| `GET` | `/api/tickets/pending-approval` | Officer approval queue |
| `PUT` | `/api/tickets/master/:id/approve` | Approve voice complaint |
| `GET` | `/api/tickets/officer-analytics` | Area & engineer stats |

### Voice
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/voice/incoming` | Twilio webhook (TwiML) |
| `POST` | `/api/voice/recording-complete` | Process recording |
| `POST` | `/api/voice/call-me` | Initiate outbound call |
| `POST` | `/api/voice/re-transcribe/:id` | Retry failed STT |

---

## 🤖 AI Pipeline

```
Citizen speaks Hindi complaint on phone call
         │
         ▼
┌─────────────────────┐
│  Twilio Recording   │──── .wav audio file
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  Sarvam STT (v2.5)  │──── Hindi text: "मुख्य सड़क पर गड्ढा है"
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  Sarvam Translate   │──── English: "There is a pothole on the main road"
└────────┬────────────┘
         ▼
┌─────────────────────┐
│  Groq LLM (Llama3)  │──── { department: "pwd",
│  Entity Extraction   │      city: "Jaipur",
└────────┬────────────┘      intentCategory: "Pothole",
         ▼                    landmark: "Main Road" }
┌─────────────────────┐
│  MongoDB + Officer   │──── Ticket created → Officer reviews → SMS sent
│  Approval Queue      │
└─────────────────────┘
```

---

## 🛡️ Security

- **JWT Authentication** with bcrypt password hashing (12 salt rounds)
- **Role-Based Access Control** — `user`, `engineer`, `admin`/`officer`
- **Phone number hashing** (SHA-256) for voice caller privacy
- **Protected API routes** with middleware guards

---

## 🧪 Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Citizen | `newuser@example.com` | `password123` |
| Officer | `officer_test@example.com` | `password123` |

---

## 📋 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 7, TailwindCSS 4, Mapbox GL |
| **Backend** | Node.js, Express 5, Mongoose 9 |
| **Database** | MongoDB Atlas (2dsphere geospatial indexing) |
| **Voice** | Twilio Programmable Voice + SMS |
| **AI/ML** | Groq (Llama 3 LLM), Sarvam AI (STT + Translation) |
| **Auth** | JWT + bcryptjs |
| **Hosting** | ngrok (dev tunnel), PWA-ready for deployment |

---

## 👥 Team

Built for **India Innovates 2026** 🇮🇳

---

<p align="center">
  <sub>Made with ❤️ for better civic governance</sub>
</p>
