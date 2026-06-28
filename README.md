# 🔮 Yaksha AI — Gamified FAQ Constellation Portal

🌌 **[Live Demo Portal](https://cs-faq-phase-1-project.vercel.app/)**

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deploy_Live-black.svg?style=for-the-badge&logo=vercel)](https://cs-faq-phase-1-project.vercel.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.0-blue.svg?style=for-the-badge&logo=react)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-38bdf8.svg?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Three.js](https://img.shields.io/badge/Three.js-0.160-black.svg?style=for-the-badge&logo=three.js)](https://threejs.org/)
[![Groq AI](https://img.shields.io/badge/Groq_AI-Llama_3.3-orange.svg?style=for-the-badge&logo=openai)](https://console.groq.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green.svg?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748.svg?style=for-the-badge&logo=prisma)](https://www.prisma.io/)

Yaksha AI is a premium, full-stack, gamified FAQ portal designed for the **Vicharanashala Internship Program at IIT Ropar**. It moves away from boring, flat text documentation by wrapping FAQ searches inside an interactive space-themed dashboard complete with a 3D coordinate graph, real-time voice synthesis, a live database, and gamification streaks.

---

## 🛠️ Architecture Blueprint

The application employs a decoupled client-server architecture powered by a persistent database connection:

```mermaid
graph TD
    %% Frontend Components
    subgraph Client [Vite + React 19 Frontend]
        UI[TopNavbar / Navigation]
        Graph[3D FAQ Graph - Three.js/R3F]
        Chat[Chat Panel - Yaksha AI]
        Voice[Voice Portal - Speech API]
        Spurti[Profile Dashboard - XP / Badges]
    end

    %% Backend Components
    subgraph Server [Express.js Backend Engine]
        API[API Router / Middleware]
        Limiter[Rate Limiters - express-rate-limit]
        Auth[JWT Cookie Guardian]
    end

    %% Integrations
    subgraph Services [Cloud Integrations]
        Postgres[(Supabase PostgreSQL)]
        Groq[Groq API - Llama 3.3 RAG]
    end

    %% Connections
    UI --> API
    Chat -->|POST /api/chat| API
    Voice -->|Voice Capture| API
    Graph -->|Focus ID| UI
    
    API --> Auth
    API -->|Prisma Client| Postgres
    API -->|Fetch Context| Groq
    
    style Graph fill:#0b0f19,stroke:#06b6d4,stroke-width:2px
    style Chat fill:#0b0f19,stroke:#7c3aed,stroke-width:2px
    style Postgres fill:#071c14,stroke:#3ecf8e,stroke-width:2px
    style Groq fill:#1f1307,stroke:#f97316,stroke-width:2px
```

---

## 🌌 Feature Matrix

- **⚛️ 3D FAQ Knowledge Graph**: A coordinates constellation built in Three.js where FAQ articles float as glowing nodes clustered by category. Includes OrbitControls (drag to rotate, scroll to zoom, hover/click nodes).
- **🧠 Interactive RAG Citations**: When querying Yaksha AI, clickable source badges (e.g. `[FAQ-005]`) are returned under responses. Clicking a source tab pisses the viewport to the 3D FAQ tab and zooms the camera directly onto the target node.
- **🔮 Yaksha AI Chatbot**: Context-matching, RAG-augmented chatbot powered by Groq's `llama-3.3-70b-versatile`. It has deep knowledge of NOC policies, stipends, Rosetta logs, and team structures, with local keywords fallback if offline.
- **🎙️ Voice Yaksha Portal**: Hands-free verbal interaction using the Web Speech API (speech recognition input and text-to-speech feedback) complete with a live Canvas frequency visualizer.
- **🏆 Spurti XP Gamification**: Ranks (Seeker ➔ Scholar ➔ Sage ➔ Oracle), dynamic level bars, streaking mechanisms, and a live cohort leaderboard with disclosure anonymity toggles.
- **🏅 Achievement Reliquary**: Automatic badge unlock conditions:
  - `🌱 First Question` (starter badge).
  - `📚 Bookworm` (saved 10 bookmarks in FAQ explorer).
  - `🔮 Yaksha's Favorite` (sent 50 chat messages to Yaksha).
  - `🎯 FAQ Hunter` (read all 24 official FAQs).
- **📊 Admin Council Panel**: Administrative statistics aggregates, FAQ CRUD controls, and a suggestion moderation queue for user suggestions.

---

## 📁 Repository Structure

```text
Vicharanshala/
├── prisma/
│   ├── schema.prisma      # Supabase PostgreSQL relational schema
│   └── seed.ts            # Seeding script for 24 FAQs & Admin user
├── src/
│   ├── backend/           # Server controllers & routes
│   │   ├── routes/        # Auth, FAQs, Chat, Leaderboards, Admin
│   │   └── services/      # Prisma DB client & Groq LLM API client
│   ├── components/        # React 3D & UI components
│   │   ├── ThreeScene.tsx      # Interactive 3D particle background
│   │   ├── YakshaAvatar.tsx    # Pulsing 3D geometric wireframe avatar
│   │   ├── KnowledgeGraph.tsx  # 3D Three.js FAQ coordinate graph
│   │   └── ChatInterface.tsx   # Yaksha Chat with RAG citations
│   ├── context/           # Auth & offline fallback state providers
│   └── App.tsx            # Navigation coordinator & dashboard layouts
├── server.ts              # Express server bootstrap (bundling entry)
└── index.html             # HTML mounting viewport
```

---

## 🚀 Quick Setup & Seeding

### 1. Prerequisites
- **Node.js**: Version 18+ (supporting global `fetch`).
- **PostgreSQL Database**: Setup a free database project on [Supabase](https://supabase.com/).
- **Groq API Key**: Create a free key in the [Groq Console](https://console.groq.com/).

### 2. Installation
Clone the repository and install the dependencies:
```bash
git clone https://github.com/badgujarkunal93-blip/CS-FAQ-Phase-1-Project.git
cd Vicharanshala
npm install --legacy-peer-deps
```

### 3. Environment Setup
Create a `.env` file in the root of the `Vicharanshala` directory:
```env
PORT=5000
JWT_SECRET="your_custom_jwt_secret_key"
GROQ_API_KEY="your_groq_api_key"

# Supabase database connection string (use port 5432 for initial setup/seeding)
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
```

### 4. Push Schema & Seed Database
Connect to your Supabase instance, create the tables, and seed records:
```bash
npm run setup
```
*(This commands runs `prisma db push` to synchronize Supabase tables, and runs `prisma/seed.ts` to add the default FAQ cards and the admin account).*

### 5. Run Locally
Launch the Express backend (port 5000) and the Vite frontend (port 5173) simultaneously:
```bash
npm run dev
```

---

## 👑 Test Credentials
Access the admin portal with this pre-seeded account:
* **Email ID**: `admin@vicharanashala.in`
* **Password**: `admin123`

---

## 🌐 Production Deployment (Vercel)

When deploying to Vercel:
1. Link your GitHub repository.
2. In the **Environment Variables** section, configure the following:
   * `DATABASE_URL`: Add your Supabase connection string. *For production, use the Transaction Pooler connection URI on port **6543** with `?pgbouncer=true&connection_limit=1`.*
   * `GROQ_API_KEY`: Your live Groq API key.
   * `JWT_SECRET`: Any secure random string (e.g. `yaksha_secret_v2_2026`).
3. Deploy the application. Vercel will build the frontend assets, launch the Express server handlers, and connect persistently to your cloud database!

---

## 🏆 Spurti Rank Progression

| Rank | SP Threshold | Icon |
| :--- | :--- | :--- |
| **Seeker** | `0 - 99 SP` | 🪙 |
| **Scholar** | `100 - 299 SP` | 🛡️ |
| **Sage** | `300 - 599 SP` | ⚔️ |
| **Oracle** | `600+ SP` | 👑 |
<img width="1160" height="637" alt="image" src="https://github.com/user-attachments/assets/b0f2389f-1ec4-46be-9658-f1f1076418b1" />
