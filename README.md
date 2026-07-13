# Crowd Source FAQ Portal

[![Summer Internship 2026](https://img.shields.io/badge/Internship-Summer%202026-blue)](https://github.com/sumaanshcodes/crowd-source-faq)
[![VLED Lab IIT Ropar](https://img.shields.io/badge/Lab-VLED%20Lab%20%7C%20IIT%20Ropar-orange)](https://github.com/sumaanshcodes/crowd-source-faq)
[![Tech Stack MERN](https://img.shields.io/badge/Tech%20Stack-MERN-green)](#tech-stack)
[![License MIT](https://img.shields.io/badge/License-MIT-purple)](LICENSE.txt)

An enterprise-grade, full-stack FAQ portal featuring semantic vector search, automated ingestion pipelines, and AI-powered community moderation. Developed as a collaborative project during the **Summer Internship 2026** at the **Vicharanashala Lab for Education Design (VLED Lab), Indian Institute of Technology Ropar**.

---

## 🎯 Vision

The **Crowd Source FAQ Portal** (internally "Yaksha FAQ Portal") optimizes the FAQ lifecycle by combining automated background ingestion with structured human-in-the-loop escalation paths. The platform implements a self-maintaining knowledge base that captures conversations, extracts Q&A pairs, validates accuracy, and detects information drift automatically. By leveraging hybrid vector-keyword retrieval and RAG-based answer synthesis, the system dramatically reduces the operational overhead of community query moderation.

---

## 🏁 Project Objectives

- **Automated Lifecycle Ingestion:** Parse raw transcripts (such as Zoom recordings), extract high-quality Q&A context, and index them immediately.
- **Context-Aware Retrieval:** Deliver highly relevant answers instantly via Reciprocal Rank Fusion (RRF) of dense vector embeddings and lexical matches.
- **Continuous Quality Control:** Programmatically monitor approved FAQs for drift, contradictions, and outdated content over time.
- **Gamified Engagement:** Encourage student-mentor interaction using a reputational reward loop (Spurti Points) and activity streaks.
- **Anonymization and Compliance:** Strengthen data privacy via complete user anonymization on deletion while keeping referral integrity intact.

---

## 🔍 Key Features

Eight flagship capabilities define the platform's lifecycle automation:

- **Zoom Transcript Ingestion with Per-User OAuth:** Connects personal Zoom accounts via OAuth. Parses VTT transcripts, extracts Q&A pairs via AI, and dual-publishes to `ZoomInsight` (admin-reviewed) and `TranscriptKnowledge` (auto-approved, immediately vector-searchable). Includes a retry + dead-letter queue for failed processes. See [docs/PIPELINES.md](docs/PIPELINES.md).
- **AI Auto-Answer Pipeline for Community Posts:** A scheduler scans unanswered posts, executing parallel searches across three knowledge sources (FAQ, Community Q&A, and Transcript Knowledge). High-confidence matches ($\ge 0.85$) are auto-posted, low-confidence matches ($0.60$ to $0.84$) queue for human review, and sensitive posts escalate to moderators. See [docs/PIPELINES.md](docs/PIPELINES.md).
- **FAQ Audit Pipeline:** A scheduler re-evaluates approved FAQs against live knowledge sources using AI, outputting verdicts: `correct`, `drift_detected`, `contradiction`, or `stale`. Flagged items are routed to `/admin/faqs/review` with a pending review status. See [docs/PIPELINES.md](docs/PIPELINES.md).
- **FAQ Freshness & Staleness Detection:** Approved FAQs carry a freshness tier (`evergreen`, `seasonal`, or `volatile`). A daily cron flags FAQs exceeding their review intervals, opening a peer-vote review window on the frontend. See [docs/PIPELINES.md](docs/PIPELINES.md).
- **Golden Ticket — Spurti Points (SP) Escalation:** A premium, user-driven escalation channel. Users spend Spurti Points to prioritize time-sensitive queries in the admin queue, enforced by a 48-hour cooldown period.
- **Batch Management & Public Guest FAQ Portal:** Scopes FAQs, categories, and analytics to specific student batches or cohorts. Guests can browse batch FAQs at `/faq` without requiring an account. See [docs/BATCH_MANAGEMENT_PLAN.md](docs/BATCH_MANAGEMENT_PLAN.md).
- **Schema-Driven Context Fields:** Allows admins to edit schema context fields (text, number, dropdown, date, boolean) per support category dynamically from the admin panel without code redeployment. See [docs/SCHEMA_DRIVEN_CONTEXT_PLAN.md](docs/SCHEMA_DRIVEN_CONTEXT_PLAN.md).
- **Soft-Delete with Anonymization:** Deleting an account anonymizes user fields (`name` is set to `Deleted User`, `email` is obfuscated, passwords are randomized) while preserving posts, comments, votes, reputation logs, and audit trails for referential integrity.

---

## 🛠️ Tech Stack & Justifications

| Layer | Technologies | Justification |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Framer Motion, Axios, Recharts, React Router 6, React Icons, Vitest | Modular component library, high-performance SPA routing, dynamic layouts, and interactive dashboard charts. |
| **Backend** | Node.js (v22), Express 4, TypeScript (ESM), Mongoose 8, JWT, bcryptjs, Multer, Zod, express-rate-limit, Helmet, CORS, Morgan | Robust API routing, schema validation, rate-limiting, and cryptographic security for student/mentor credentials. |
| **Database & Storage** | MongoDB Atlas, Upstash Redis (optional), Local LRU Cache, Cloudinary | Scalable document data store, fast caching layers, and optimized media/image attachments. |
| **Search & AI** | Xenova/transformers (768-dim local embeddings), Atlas Vector Search, $text Search, Reciprocal Rank Fusion (RRF) | Local/remote hybrid query matches, contextual embeddings, and advanced search aggregation. |
| **AI Providers** | Anthropic, OpenAI, XAI, MiniMax, Gemini | Multi-model integration allowing runtime provider resolution for pipelines. |
| **DevOps** | Sentry, Ngrok, Twilio (SMS), SMTP, Vitest | Integrated application logging, webhook tunnels, alerts, and robust testing infrastructure. |

---

## 📊 Implementation Status

| Module | Status |
| :--- | :--- |
| User Authentication | ✅ Implemented |
| Dashboard | ✅ Implemented |
| FAQ Management | ✅ Implemented |
| Discussion Forum | ✅ Implemented |
| FAQ Search | ✅ Implemented |
| Documents Manager | ✅ Implemented |
| Meetings Tracker | ✅ Implemented |
| Attendance Tracker | ✅ Implemented |
| Leaderboard | ✅ Implemented |
| Spurti Points (SP) | ✅ Implemented |
| User Profile | ✅ Implemented |
| Notification System | ✅ Implemented |

---

## 🖥️ User Experience & Admin Operations

### User Journey
- **Discover:** Search FAQs via keyword or semantic search, browse category directories, and view similarity scores.
- **Ask & Engage:** Submit community posts with duplicate check banners, upvote responses, comment in nested threads, and bookmark posts.
- **Reputation Loop:** Earn Spurti Points for contributions, achieve badges, and check the public contributor leaderboard.
- **AI Assistant:** Consult the `/ask-ai` RAG assistant with attached text files and images.

### Admin Operations
- **Telemetry Dashboard:** Access live metrics, category growth rates, activity logs, and system health statistics.
- **Moderation Interface:** Actions for user suspension, question approvals, category updates, and feature flag management.
- **PIpeline Visibility:** View audit trail history, cache hit rates, circuit breaker statuses, and Prometheus metrics.

For the full route mapping and schemas, consult [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## ⚙️ Setup & Development Guide

### Quick Start

Launch the integrated development environment (checks environment variables, backend API server, and Vite frontend) with:

```bash
./run.sh
```

`run.sh` prompts for `MONGODB_URI` and `JWT_SECRET` on first launch and configures them in `backend/.env.local`. Session logs are written to `logs/session_*.txt`.

### Manual Commands

```bash
# Start backend server
cd backend
npm run dev

# Start frontend application
cd frontend
npm run dev
```

### Project Structure

```
crowd-source-faq/
├── backend/           # Express + TypeScript API server
├── frontend/          # React + Vite SPA client
├── docs/              # Documentation plans and architectures
└── run.sh             # Dev orchestration environment script
```

### Environment Variables

Required:
* `MONGODB_URI` - MongoDB Atlas connection string
* `JWT_SECRET` - JWT authentication signature secret

Optional:
* AI Keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `MINIMAX_API_KEY`
* Integrations: Zoom client OAuth keys, Cloudinary upload parameters, SMTP details, Sentry configurations.

For a full list of parameters, reference [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 👥 Team Members

| Name | Email |
| :--- | :--- |
| **Sumansh Yadav** | [ydv.sumansh@gmail.com](mailto:ydv.sumansh@gmail.com) |
| **Khushi Sharma** | [khushi170505@gmail.com](mailto:khushi170505@gmail.com) |
| **Tharunika Natarajan** | [127006049@sastra.ac.in](mailto:127006049@sastra.ac.in) |
| **Vatsal Jaroli** | [jaroli22vatsal@gmail.com](mailto:jaroli22vatsal@gmail.com) |
| **Gunjan Pandey** | [gunjanp0403@gmail.com](mailto:gunjanp0403@gmail.com) |
| **Vinit Jitendra Prajapati** | [prajapativinit2004@srmist.edu.in](mailto:prajapativinit2004@srmist.edu.in) |
| **G. Ramyashree** | [ramya20pg@gmail.com](mailto:ramya20pg@gmail.com) |
| **KONDAM JHANSI** | [jhansikondam111@gmail.com](mailto:jhansikondam111@gmail.com) |

---

## 🤝 Contribution

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) and review the [Code of Conduct](CODE_OF_CONDUCT.md) before submitting pull requests.

---

## 🚀 Future Enhancements

* **AI-Based FAQ Recommendations:** Dynamic similarity suggestions using local or remote NLP tokenizers.
* **Semantic Vector Search:** Complete transition to Atlas Vector Search to parse context beyond direct keywords.
* **Autonomous Chatbots:** Instant question resolution via embedded dialog helpers.
* **DevOps Optimization:** Automating workflows and deploying to scalable cloud nodes.
* **Mobile Companion:** Dedicated Android and iOS clients built on React Native.

---

## 💖 Acknowledgements

We express our gratitude to the **Vicharanashala Lab for Education Design (VLED Lab), IIT Ropar** and our mentors for providing the guidance, resources, and collaborative environment to design and develop the Crowd Source FAQ Portal.

---

## 📄 License

This repository is licensed under the [MIT License](LICENSE.txt) — © 2026 vicharanashala & VLED Lab Team.


