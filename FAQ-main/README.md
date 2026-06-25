# Vicharanashala — FAQ Platform

Community-driven Q&A platform for IIT Ropar, with AI-powered answers backed by a RAG pipeline.

## Structure

```
├── backend/          Express.js REST API + MongoDB
├── AI-agents/        FastAPI + LangGraph + ChromaDB RAG service
└── front/            Next.js 15 frontend (App Router, TypeScript)
```

## Quick Start

### 1. Backend
```bash
cd backend
npm install
# add your .env (see .env-example)
npm start          # runs on port 5000
```

### 2. AI Agents
```bash
cd AI-agents
pip install -r requirements.txt
# add your .env (GROQ_API_KEY, MONGODB_URI, CHROMA_API_KEY)
python main.py     # runs on port 8000
```

### 3. Frontend
```bash
cd front
npm install
# .env.local: NEXT_PUBLIC_API_URL=http://localhost:5000/api
npm run dev        # runs on port 3000
```

### 4. Seed FAQs (first run only)
```bash
cd backend
node scripts/seedFAQs.js
# Inserts 142 FAQs from data/faqs.csv into MongoDB
```

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, TypeScript, TanStack Query, Zustand, Framer Motion |
| Backend | Node.js, Express, MongoDB (Mongoose), JWT auth |
| AI Service | FastAPI, LangGraph, Groq (LLaMA 3.3-70b), ChromaDB |
| Design | Cormorant Garamond + Syne + JetBrains Mono, dark cards on light page |

## Features

- **FAQ browser** — Netflix-style horizontal category rows, expand-to-modal
- **Community Q&A** — post questions, vote, comment, bookmark
- **AI chat** — full-page LLaMA 3.3 chat via Groq
- **AI quick-answer** — per-post instant AI answer button
- **Admin panel** — FAQ management, knowledge-base upload (CSV/PDF), unanswered query review with AI drafts
- **Auth** — JWT-based register/login, role-based access (student/staff/admin)

## New Features (v2)

### Feature 1 — Ask Admin Directly
When a FAQ search returns no results or the AI answers with low confidence (`is_unanswered: true`), users see an **"Ask Admin Directly →"** button that opens a lightweight modal. The question is routed to a new `DirectQuestion` collection, separate from the public post flow.

| Endpoint | Method | Access | Description |
|---|---|---|---|
| `/api/direct-questions` | POST | Public | Submit a direct question |
| `/api/direct-questions` | GET | Admin | List with `?status=pending\|answered\|dismissed` |
| `/api/direct-questions/:id/answer` | PUT | Admin | Answer a question |
| `/api/direct-questions/:id/dismiss` | PUT | Admin | Dismiss a question |
| `/api/direct-questions/:id/convert-to-faq` | POST | Admin | Convert to FAQ |

Admin UI: `/admin/direct-questions`

### Feature 2 — Recurring Discussion Questions → Auto-FAQ
After every new post is created, the backend fires a non-blocking call to `POST /check-repetition` on the AI service. Posts are embedded and clustered by semantic similarity. When a cluster hits `repetition_min_count` (default 3), the LLM drafts a suggested FAQ entry. Admins review pending clusters at `/admin/repetition-trends`.

| AI Service Endpoint | Description |
|---|---|
| `POST /check-repetition` | Embed + cluster a new post |
| `GET /repetition-clusters` | Pending clusters for admin review |
| `POST /repetition-clusters/:id/promote` | Mark promoted |
| `POST /repetition-clusters/:id/dismiss` | Mark dismissed |

Backend proxy: `/api/ai/repetition-clusters`

### Feature 3 — Admin User Management + Audit Log
- **Ban/suspend users** — with reason; banned users get a 403 on every request (`protect` middleware re-checks DB on every call, not just at JWT issue time)
- **User list page** — search by name/email, filter by role/banned status
- **Audit log** — every admin action (ban, answer, convert, promote, delete) is recorded non-blockingly

| Endpoint | Method | Access | Description |
|---|---|---|---|
| `/api/users` | GET | Admin | List users with filters |
| `/api/users/:id` | GET | Admin | User detail + post count |
| `/api/users/:id/ban` | PUT | Admin | Ban a user |
| `/api/users/:id/unban` | PUT | Admin | Unban a user |
| `/api/audit-logs` | GET | Admin | Paginated audit log |

Admin UI pages: `/admin/users`, `/admin/audit-log`

Admin account is seeded:

Field	Value
Email	admin@iitrpr.ac.in
Password	Admin@1234
Role	admin