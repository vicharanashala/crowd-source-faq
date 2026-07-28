<p align="center">
  <img src="https://img.shields.io/badge/Status-Active-success?style=flat-square" />
  <img src="https://img.shields.io/badge/License-Educational-blue?style=flat-square" />
</p>

<h1 align="center">Crowd Source FAQ (CSFAQ)</h1>

<p align="center">
  <strong>AI-Powered Knowledge Management & Community FAQ Platform</strong>
</p>

<p align="center">

![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/TailwindCSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

</p>

<p align="center">
  <a href="https://github.com/sharanu-patil33/crowd-source-faq">Repository</a> •
  <a href="#installation">Installation</a> •
  <a href="#phase-1-feature-enhancements">Our Contributions</a> •
  <a href="#contributors">Contributors</a>
</p>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Phase 1 Feature Enhancements](#phase-1-feature-enhancements)
- [Bug Fixes](#bug-fixes)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Challenges & Limitations](#challenges--limitations)
- [Future Enhancements](#future-enhancements)
- [Contributors](#contributors)
- [Contributing](#contributing)
- [Acknowledgements](#acknowledgements)
- [License](#license)

---

## Overview

Crowd Source FAQ (CSFAQ) is an AI-powered knowledge management platform that lets users search FAQs, participate in community discussions, ask questions, and get intelligent, source-cited answers through semantic search and AI-assisted retrieval.

The platform combines community-driven knowledge sharing with AI-powered search to reduce repetitive questions, improve response quality, and give both users and administrators a single, organized, self-maintaining knowledge base.

This repository reflects our team's contributions during **Phase 1** of the AI internship programme, built on top of the existing CSFAQ (Yaksha FAQ Portal) codebase.

---

## Key Features

<table>
<tr>
<td valign="top" width="33%">

**User**
- AI-powered FAQ Search
- Community Discussion Forum
- Ask Questions
- My Questions Dashboard
- Saved Knowledge
- Draft Persistence
- Internship Roadmap
- Welcome Package
- Program Portal
- Support Ticket System
- Golden Ticket Module
- Email Notifications

</td>
<td valign="top" width="33%">

**AI**
- Semantic Search
- Intelligent Knowledge Retrieval
- AI Answer Ranking Optimisation
- Multi-source Response Selection
- Context-aware Search

</td>
<td valign="top" width="33%">

**Admin**
- FAQ Management
- Community Moderation
- Manual FAQ Promotion
- User Management
- AI Configuration
- Feature Flag Management
- Knowledge Management
- Support Dashboard
- Program & Batch Management
- Analytics Dashboard

</td>
</tr>
</table>

**Search Enhancements:** Real-time search · Dynamic filtering · Multi-category search · Keyboard shortcuts · Recent searches · Search suggestions · Responsive search interface

---

## Phase 1 Feature Enhancements

During Phase 1 of the internship, our team designed, built, and shipped the following enhancements into the existing production codebase.

### 🗺️ Internship Roadmap
New interns struggled to understand the sequence of internship activities and where to find resources — everything was scattered across sections. We built **"The Internship Express,"** a centralized, transit-map-style visual timeline covering the full journey: Registration (Samagama) → Onboarding → Mandatory Sessions → Phase 1 (Crowd Source FAQ) → Phase 2 (Mentor Projects) → Completion — complete with milestone tracking and quick links to Samagama, ViBe, and Matrix Mystics.
> **Impact:** Simplifies onboarding, improves resource accessibility, enables visual progress tracking.

### 📧 Email Notifications for Resolved Questions
Previously, users could only find out their question was answered by checking the in-app bell icon. We built a `sendEmail.ts` utility (Nodemailer, env-configured), extended `notificationDispatcher.ts` with an optional `message` field without breaking ~12 existing call sites, and wired the real question + answer content into a branded HTML email. Verified end-to-end with Mailtrap.
> **Impact:** Users are notified the instant their question is resolved — no manual checking required.

### 📝 Draft Persistence for Community Posts
Users lost their in-progress questions if they closed the "Ask Question" dialog, refreshed, or navigated away. We added automatic `localStorage` draft saving with **Keep Draft** / **Discard Draft** on reopen, and fixed a bug where autosave was silently overwriting stored drafts on component init — all without touching duplicate detection, posting, categories, or attachments.
> **Impact:** No more lost work; drafts persist reliably across refreshes and dialog reopenings.

### 👤 My Questions Dashboard
There was no way to see just your own questions without scrolling the entire community feed. We added a dedicated view pulling from existing post data — purely additive, zero changes to existing routes or logic.
> **Impact:** Fast, personal access to your own submissions.

### ⭐ Manual FAQ Promotion
Turning a great community answer into an official FAQ required manual database work. We built a backend endpoint and Admin Community UI integration to promote posts to FAQs in one click.
> **Impact:** Faster knowledge-base curation, no manual DB operations, no schema changes required.

### 🔍 Enhanced Community Search
Community search lacked speed and memory. We added real-time client-side filtering, keyboard shortcuts (`/` and `Ctrl/Cmd+K`), persistent Recent Searches, a clear button, a result counter, and better empty states — while removing redundant/duplicate UI code.
> **Impact:** Faster, more accessible content discovery.

### 🤖 AI Answer Ranking Optimisation
The AI assistant pulls from FAQs, Community Q&A, and Zoom lecture notes — each scored on different scales, which skewed answer selection. We introduced a **score-normalization layer** to compare all sources fairly on a common scale, backed by automated unit tests.
> **Impact:** Fairer, more accurate multi-source answer selection.

### 🎛️ Search Bar & Search Experience Improvements
The search bar lacked flexible filters and consistent behavior. We redesigned it with a segmented filter (FAQ / All / Community Posts), multi-select category filters, unified Enter-key/button submission, an inline clear (X) button, and improved dropdown/loading/empty states — all client-side, no extra API calls.
> **Impact:** Instant filtering, cleaner UI, no unnecessary navigation.

### 🛠️ Bug Fixes & Performance Improvements
Stability improvements, UI fixes, and optimization across modules (see [Bug Fixes](#bug-fixes) below for the two headline fixes).

| Feature | Description |
|---------|-------------|
| Internship Roadmap | Interactive roadmap with milestones, learning resources, and progress tracking |
| Email Notifications | Automatic emails when admins resolve user questions |
| Draft Persistence | Auto-save community drafts with restore/discard |
| My Questions | Dashboard of all questions created by the logged-in user |
| Manual FAQ Promotion | Convert community discussions into official FAQs |
| Enhanced Community Search | Real-time filtering, categories, recent searches, keyboard shortcuts |
| AI Answer Ranking Optimisation | Normalized, fair answer selection across knowledge sources |
| Search Bar Improvements | Segmented search, multi-select categories, better dropdown UX |
| Bug Fixes & Performance | Stability, UI, and edit/delete fixes across modules |

---

## Bug Fixes

| Issue | Root Cause | Fix |
|---|---|---|
| **Unable to edit/delete own posts** | Incorrect ownership validation blocked rightful owners from modifying their own posts | Corrected ownership-check logic in the Community module while preserving existing authorization rules |
| **Search feedback popup layout overlap** | "Did this answer your question?" popup's text and buttons collided in a narrow fixed-width container | Fixed the flex layout and shortened button labels so the prompt and both buttons fit on one line, verified across multiple searches |

---

## Technology Stack

| Layer | Technologies |
|--------|--------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Recharts, React Router 6 |
| Backend | Node.js, Express.js, Mongoose |
| Database | MongoDB (Atlas Vector Search) |
| Authentication | JWT, bcryptjs |
| AI | Semantic Search, AI Answer Ranking, Hybrid Retrieval |
| Email | Nodemailer |
| Storage | Cloudinary |
| Version Control | Git & GitHub |

---

## System Architecture

```text
                    Users
                      │
                      ▼
         React + TypeScript (Frontend)
                      │
                REST API Requests
                      │
                      ▼
             Express.js Backend
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
     MongoDB      AI Services    External Services
    (Database)  Knowledge Engine  SMTP • Cloudinary • Zoom
```

---

## Project Structure

```text
crowd-source-faq
│
├── apps
│   ├── frontend      # React + Vite SPA
│   └── backend       # Express + TypeScript API
│
├── packages
├── docs
├── public
└── README.md
```

---

## Installation

Clone the repository

```bash
git clone https://github.com/sharanu-patil33/crowd-source-faq.git
cd crowd-source-faq
```

Install dependencies

```bash
pnpm install
```

**Quick start (alternative):** run `./run.sh` from the project root — it handles env setup, ngrok, and starts both backend and frontend in one step. It will prompt for `MONGODB_URI` and `JWT_SECRET` on first run and save them to `apps/backend/.env.local` without overwriting existing values.

---

## Running the Project

```bash
pnpm dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:6767 |

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | ✅ | Database connection |
| `JWT_SECRET` | ✅ | Auth token signing |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `XAI_API_KEY` / `MINIMAX_API_KEY` | At least one | AI provider access |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` | Optional | Email notifications |
| `CLOUDINARY_*` | Optional | Image uploads |
| `UPSTASH_REDIS_*` | Optional | Caching |

---

## Development Workflow

```text
Fork Repository → Create Feature Branch → Implement Feature → Commit Changes
      → Push Branch → Open Pull Request → Code Review → Merge into Main
      → Final Pull Request to Official Repository
```

---

## Testing

The following areas were manually and automatically verified:

- User Authentication
- FAQ Module
- Community Module (including edit/delete ownership fix)
- AI Search & Answer Ranking
- Internship Roadmap
- Draft Persistence (save, restore, discard)
- Email Notifications (verified via Mailtrap)
- Search Optimisation
- Admin Dashboard
- Performance & Stability

---

## Challenges & Limitations

**Challenges**
- Understanding a large, multi-module existing codebase before implementing new features
- Integrating changes without regressions across interconnected modules
- Maintaining UI/coding consistency across multiple contributors
- Extensive scenario testing to avoid breaking existing behavior
- Understanding the existing AI retrieval/ranking pipeline before improving it

**Limitations**
- Dependence on external services (email, AI providers) affects overall reliability
- Continued scalability optimization needed as users, posts, and FAQs grow
- Platform is intentionally an evolving system — built for continuous enhancement

---

## Future Enhancements

- AI-powered personalization (recommendations based on user activity/interests)
- More advanced semantic search & intelligent query suggestions
- Richer analytics/reporting dashboards for admins
- Multilingual support
- Mobile application
- Newer/better AI models with improved context understanding
- General performance optimisation

---

## Contributors

This project was developed collaboratively during the internship programme.

| Name | Role |
|------|------|
| Sharanagouda Policepatil| Team Lead |
| Akshay Vishwakarma | Team Member |
| Anil Dudi | Team Member |
| Ashish Patra | Team Member |
| Ayushi Karn | Team Member |
| Chandana V | Team Member |
| Durgesh Manoj Mahajan | Team Member |
| Rohith N R | Team Member |
| Samruddhi Bhaskar Chate | Team Member |

Team Lead Responsibilities: repository & branch management, pull request reviews, merge conflict resolution, feature integration, testing & validation, final project integration, final PR submission to the official repository.

---

## Contributing

1. Fork the repository
2. Create a new feature branch
3. Commit your changes
4. Push the branch
5. Open a Pull Request

Please follow the project's coding standards and review guidelines before submitting a Pull Request.

---

## Acknowledgements

This project was developed as part of an internship programme focused on collaborative software development, AI-assisted knowledge management, and modern GitHub workflows. It provided hands-on experience in feature development, collaborative version control, pull request reviews, code integration, testing, and maintaining a production-scale application.

---

## Repository

**GitHub Repository:** https://github.com/sharanu-patil33/crowd-source-faq

---