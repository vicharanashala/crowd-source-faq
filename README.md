# Crowd Source FAQ (Yaksha FAQ Portal)

Full-stack FAQ portal with semantic vector search, AI-powered community moderation, and an expert promotion layer. Built to handle 1 million registered users.

**GitHub**: [https://github.com/vicharanashala/crowd-source-faq](https://github.com/vicharanashala/crowd-source-faq)  
**References**: [Docs](docs/README.md) · [Contributing](./CONTRIBUTING.md) · [Code of Conduct](./CODE_OF_CONDUCT.md) · [License](./LICENSE)

---

## Vision

Automate the FAQ lifecycle end-to-end with **zero-touch ingestion, answering, quality control, and user lifecycle**.  
The platform ensures the right answer is available before a user finishes typing.

---

## Project Structure

    Crowd Source FAQ/
    ├── apps/
    │   ├── backend/       # Express + TypeScript API
    │   └── frontend/      # React + Vite SPA
    ├── docs/              # Documentation
    └── run.sh             # Local dev runner

---

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Node.js, Express, TypeScript, Mongoose, JWT, bcryptjs
- **Database**: MongoDB Atlas (Vector Search), Redis (optional), Cloudinary
- **AI Providers**: Anthropic, OpenAI, XAI, MiniMax
- **Infra**: Sentry, Ngrok, Twilio, SMTP

---

## Key Features

- **Hybrid semantic + keyword search**
- **Crowd-sourced FAQ submission & moderation**
- **AI auto-answer pipeline for community posts**
- **FAQ freshness & staleness detection**
- **Leaderboard + reputation system**
- **Golden Ticket escalation with Spurti Points**
- **Admin dashboard for moderation, analytics, and AI settings**

---
## 🛠 Quick Start & 📖 Documentation

### Quick Start
./run.sh        # Full-stack runner: env setup, ngrok, backend + frontend

On first run, provide:
- MONGODB_URI
- JWT_SECRET

Optional:
- OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.
- Zoom OAuth
- Cloudinary
- Twilio
- SMTP

### Documentation
-   [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Full architecture deep-dive
-   [docs/PIPELINES.md](docs/PIPELINES.md) — AI pipelines (Zoom / doc ingestion / auto-answer)
-   [docs/BATCH_MANAGEMENT_PLAN.md](docs/BATCH_MANAGEMENT_PLAN.md) — Batch + category scoping
-   [docs/PUBLIC_FAQ_PLAN.md](docs/PUBLIC_FAQ_PLAN.md) — Public FAQ page design
-   [docs/SCHEMA_DRIVEN_CONTEXT_PLAN.md](docs/SCHEMA_DRIVEN_CONTEXT_PLAN.md) — Schema-driven context fields


### Contributing
-  Fork the repo
-  Clone locally
-  Create a feature branch
-  Commit changes
-  Push and open a Pull Request

### License
    MIT © 2026 Vicharanashala