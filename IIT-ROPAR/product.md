# Samagama — Product Overview

An AI-powered FAQ + community support portal built for IIT Ropar's Vicharanashala Internship Program. Combines contextual AI assistance, multilingual knowledge discovery, community-driven discussions, and structured support workflows so interns can access verified information before raising a support request.

---

## What it does

Four integrated support pillars, in order of escalation:

1. **Discover** — Categorized FAQs, smart sorting, popularity ranking, bookmarks, quick revisit, and multilingual translation help interns find information instantly.
2. **Assist** — Yaksha AI provides contextual answers for internship-related queries including NOC validation, certificates, Rosetta Journal requirements, team formation, stipends, project guidelines, and program workflows.
3. **Collaborate** — Students can post questions, participate in threaded discussions, contribute answers, and help expand the shared knowledge base.
4. **Resolve** — Unresolved issues are escalated through a priority-based support ticket system with admin follow-ups, notifications, and status tracking.

---

## Key features

* **Yaksha AI Assistant** — context-aware support powered by Google Gemini.
* **Voice Support** — hands-free interaction with Yaksha using voice commands.
* **Multi-language FAQs** — translate content into English, Hindi, Punjabi, and Spanish.
* **Smart FAQ System** — category filters, popularity ranking, search, and quick revisit.
* **Bookmarks** — save FAQs for future reference with a dedicated saved section.
* **Category Navigation** — browse information by Internship, NOC, Certificates, Rosetta Journal, Projects, and more.
* **Community Forum** — posts, threaded discussions, and peer collaboration.
* **Verified Answers** — coordinator-approved responses promoted to official FAQs.
* **Community Contributions** — students can contribute answers to existing FAQs.
* **Support Tickets** — priority-based issue tracking with unique ticket IDs.
* **Real-time Notifications** — updates for tickets, replies, and announcements.
* **Admin Dashboard** — manage FAQs, users, tickets, moderation, and analytics.
* **Role-based Access Control** — separate workflows for students and administrators.
* **FAQ Insights** — category-wise counts and popularity indicators.

---

## User flow

```text
Student Query
      │
      ▼
Browse FAQs ──► Ask Yaksha AI ──► Community Discussion ──► Support Ticket
      │                │                    │                      │
      └────────────────┴────────────────────┴──────────────────────┘
                               Resolution
```

---

## Tech stack (one-liner per layer)

| Layer          | Pick                                                        |
| -------------- | ----------------------------------------------------------- |
| Frontend       | React 19 + Vite + TypeScript + Tailwind CSS + Framer Motion |
| Backend        | Express 4 + TypeScript                                      |
| DB             | Prisma ORM + SQLite                                         |
| AI             | Google Gemini API                                           |
| Authentication | JWT + bcrypt                                                |
| Security       | Helmet + CORS + express-rate-limit                          |
| Build Tools    | Vite + esbuild + tsx                                        |
| Deployment     | Railway, Render, Vercel                                     |

---

## Architecture overview

```text
React Client
     │
     ├── FAQ System
     ├── Yaksha AI
     ├── Voice Assistant
     ├── Community Forum
     ├── Support Tickets
     ├── Notifications
     └── Admin Dashboard
            │
            ▼
Express API Layer
     │
     ├── Authentication
     ├── FAQ Management
     ├── AI Chat Service
     ├── Community Answers
     ├── Ticket Management
     └── Notifications
            │
            ▼
Prisma ORM ──► SQLite Database
            │
            └── Google Gemini API
```

---

## Recent changes (v1.0)

* Added contextual **Yaksha AI integration** for internship-specific assistance.
* Introduced **voice-enabled interactions** for hands-free support.
* Implemented **multi-language FAQ translation**.
* Added **community discussion threads** with coordinator verification workflows.
* Built a **priority-based support ticket system** with unique ticket IDs.
* Added **bookmarking, quick revisit, and popularity-based FAQ sorting**.
* Created a **centralized admin dashboard** for moderation and analytics.
* Introduced **role-based authentication and authorization** using JWT.

---

## Reference docs

| Topic                 | File                                           |
| --------------------- | ---------------------------------------------- |
| Project documentation | [`README.md`](README.md)                       |
| Database schema       | [`prisma/schema.prisma`](prisma/schema.prisma) |
| API routes            | [`src/backend/routes`](src/backend/routes)     |
| Backend services      | [`src/backend/services`](src/backend/services) |
| Frontend components   | [`src/components`](src/components)             |
| Environment variables | [`.env.example`](.env.example)                 |
| License               | [`LICENSE`](LICENSE)                           |

---

## Useful npm scripts

| Script            | What it does                              |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Start the development server              |
| `npm run build`   | Build frontend and backend for production |
| `npm start`       | Run the production build                  |
| `npm run setup`   | Initialize database and seed data         |
| `npm run db:push` | Apply Prisma schema changes               |
| `npm run db:seed` | Populate the database with initial data   |
| `npm run lint`    | Run TypeScript checks                     |
| `npm run clean`   | Remove build artifacts                    |

---

## Success metrics

* Reduced repetitive support queries.
* Increased FAQ engagement and bookmark usage.
* Faster ticket resolution time.
* Higher community participation.
* Improved intern satisfaction and onboarding experience.

---

## Future roadmap

* AI-powered FAQ recommendations.
* WhatsApp and email notifications.
* Advanced analytics dashboard.
* Mobile-responsive PWA support.
* Multi-cohort and multi-program support.
* Semantic search across FAQs and community discussions.

---

## Repository

* GitHub: `https://github.com/varun2spark/Samagama_FAQ`
* License: see [`LICENSE`](LICENSE)
* Branch: `main`
