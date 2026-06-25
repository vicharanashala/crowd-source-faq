# Vicharanashala — Frontend

**Next.js 15** frontend for the IIT Ropar community FAQ & knowledge platform.

## Design

Pixel-faithful port of the `vicharanashala-faq` reference (Vite/React design system):

- **Fonts**: Cormorant Garamond (display) · Syne (UI) · JetBrains Mono (mono/labels)
- **Cards**: Fixed-size dark cards (`--card-w: 330px` / `--card-h: 220px`) on a light page background — 6 rotating dark radial-gradient backgrounds, glow orbs, shine overlay, rotating conic-gradient border on hover, sibling-dimming, meta-tag + action-button reveal
- **Background**: 4-layer system — SVG fractalNoise (`.noise`), cursor-tracking radial glow (`.mouse-glow` via `useMouseGlow`), canvas particles (`useParticles`), 4 drifting blobs
- **Hero**: Full-viewport, 4 bg layers, live-pulsing badge, serif h1 with shimmering italic `<em>`, dual CTA buttons, distinct hero search bar, 4-stat meta row with real backend counts, scroll hint
- **FAB**: Pill-shaped glass button with pulsing dot + gradient text (`.fab` / `.fab-dot` / `.fab-text`)
- **Navbar**: Scroll-aware gradient→blur transition at `scrollY > 40`, logo mark + serif text + mono chip, center search, right stat dot + auth button

## Stack

| | |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Plain CSS classes from `globals.css` (no Tailwind utility classes in components) |
| State | TanStack Query v5 (server) · Zustand (auth, persisted) |
| Animations | Framer Motion |
| Toasts | Sonner |

## Routes

| Route | Component |
|---|---|
| `/` | Home: Hero + PillsFilter + FAQ category rows + Posts section |
| `/faqs` | All FAQs: search + category filter + rows + expanded panel |
| `/posts` | Community discussions feed |
| `/posts/[id]` | Post detail: vote, bookmark, AI quick-answer, comments + answers |
| `/ask` | Create a new question |
| `/ai-chat` | Full-page LLaMA 3.3 chat |
| `/profile` | Edit profile |
| `/bookmarks` | Saved posts |
| `/login` · `/signup` | Auth forms |
| `/admin` | Dashboard |
| `/admin/faqs` | Create & list FAQs (accepts `?prefillQuestion=&prefillAnswer=` deep-link from unanswered page) |
| `/admin/unanswered` | AI-unanswered queries with AI drafts → "Draft Answer" → `/admin/faqs` pre-filled |
| `/admin/knowledge-base` | Upload CSV / PDF to AI vector store |

## Setup

```bash
cd vicharanashala-faq
npm install
# .env.local is already present — edit if your backend runs on a different port
npm run dev
```

Requires:
- **Backend** running: `cd backend && npm start` (port 5000)
- **AI agents** running (optional but recommended): `cd AI-agents && python main.py` (port 8000)

## Admin Workflow (§4 from spec)

1. User asks question → `POST /api/ai/ask` — backend checks FAQ DB first, then forwards to AI agents
2. If AI confidence is low, `suggestion_agent.py` auto-saves the query + a suggested Q&A to MongoDB unanswered store (no extra frontend call needed)
3. Admin visits `/admin/unanswered` → sees raw query + AI-drafted suggested question & answer
4. Admin clicks **Draft Answer →** → navigates to `/admin/faqs?prefillQuestion=...&prefillAnswer=...`
5. Admin reviews the pre-filled form, edits if needed, clicks **Publish FAQ →** → `POST /api/faqs`
6. The new FAQ is now in the knowledge base and will match on the next `/api/ai/ask` call
