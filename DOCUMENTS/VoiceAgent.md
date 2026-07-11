# FAQ Voice Agent — CSFAQ

Scope: voice-driven FAQ Q&A (ask by typing or by speaking, get a matched
FAQ answer read back out loud).

## What this is

A browser-based voice agent that lets an intern ask an FAQ question by
voice or text and get an answer spoken back, using the browser's built-in
Web Speech API (no external speech service). It deliberately does **not**
read from the MongoDB-backed `/api/faqs` used by the main FAQ page —
instead it serves a local, static JSON snapshot of the FAQ content, so the
feature works fully offline and can be demoed without a database
connection.

> Earlier version note: this module originally fetched FAQ content live
> from `https://samagama.in/internship/faq` (an unrelated, already-deployed
> production site) on every request, instead of using data owned by this
> project. That's been replaced with the local seed-file approach described
> below.

## Important: there are two copies of this module

Same situation as the Escalation module — two locations exist, for
different purposes, and they are **not automatically kept in sync**.

| | `Voice agent/FAQS/` (standalone original) | `backend/voice-agent/` (integrated) |
|---|---|---|
| Runs as | Its own Node server, `node server.js`, port 3100 | Static assets + API mounted inside the main Express backend, same port as everything else (5002) |
| API it calls | `/api/faqs` (its own server) | `/voice-agent/api/faqs` (backend route) |
| Has the refresh pipeline | ✅ Yes — `scripts/import-live-faq.js`, `build-data.js`, `generate-seed.js`, and `data/training.json` all live here | ❌ No — just `src/` (assets) and `data/faq-seed.json`, no scripts |
| Purpose | Offline reference copy / where you actually refresh content from the live FAQ | What the deployed app and the "🎙️ Ask the Voice Agent" button on the FAQ page actually use |
| Actually routed into the app? | No — standalone, run separately if wanted | **Yes**, via `/voice-agent` |

**To update the voice agent's content:** refresh it in `Voice agent/FAQS/`
(see [Refreshing the FAQ content](#refreshing-the-faq-content) below), then
manually copy the regenerated `data/faq-seed.json` into
`backend/voice-agent/data/faq-seed.json` — there's currently no script that
does this copy for you. If you skip that step, the live app keeps serving
whatever seed it already has.

## Where this lives

```
Voice agent/FAQS/                    standalone original — kept for offline demo/reference
├── data/
│   ├── faq-seed.json                served by this copy's own server.js
│   └── training.json                aliases / short voice answers, used only when rebuilding the seed
├── scripts/
│   ├── import-live-faq.js           pulls raw text from the live Samagama FAQ page
│   ├── build-data.js                combines that text + training.json → src/faq-data.js
│   └── generate-seed.js             converts src/faq-data.js → data/faq-seed.json
├── src/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── faq-data.js                  intermediate build output, not read directly by the server
├── server.js
└── README.MD

backend/
├── src/routes/voiceAgentRoutes.ts   GET /voice-agent/api/faqs — reads the seed below
├── voice-agent/
│   ├── data/faq-seed.json           what the live app actually serves — copy target from above
│   └── src/                         same index.html/app.js/styles.css, calling /voice-agent/api/faqs instead
└── src/app.ts                        mounts voiceAgentRoutes at /voice-agent, and serves
                                       backend/voice-agent/src as static files at the same path
```

## What's implemented

- Ask a question by typing (`#questionInput` + Ask button)
- Ask a question by voice (Web Speech API `SpeechRecognition`) — browser-dependent, works best in Chrome
- Spoken answer playback (`SpeechSynthesis`), with an accent/voice picker (English UK / India / US) and a mute toggle
- Matches the typed/spoken question against the local FAQ seed and shows the matched question + answer, plus alternate suggestions when the match is uncertain
- Example-question quick-ask buttons
- Branding consistent with the rest of the app: same Fraunces/Inter/IBM Plex Mono fonts, parchment/ink/moss/clay/gold color tokens, and a top nav bar (with the Yaksha logo) matching `frontend/src/components/Navbar.tsx`'s pill-link style
- Entry point from the main app: a "🎙️ Ask the Voice Agent" link on `frontend/src/pages/FaqPage.tsx`, opening `/voice-agent` in a new tab
- Dev-mode routing: `frontend/vite.config.ts` proxies `/voice-agent` to the backend, same as `/api`, so the link works whether you're running the Vite dev server or the built app

## API

GET /voice-agent/api/faqs

Returns:

```json
{
  "source": "local-seed:voice-agent/data/faq-seed.json",
  "fetchedAt": "...",
  "faqs": [
    {
      "id": "1.3",
      "question": "...",
      "section": "...",
      "answer": "...",
      "aliases": ["..."],
      "voiceAnswer": "..."
    }
  ]
}
```

Note the response shape is different from every other module — no
`success`/`data` wrapper (see `DOCUMENTS/BACKEND_INTEGRATION.md` for how
this compares to the rest of the API). Errors return HTTP `502` with
`{ "error": "...", "message": "..." }`. The standalone copy's own server
(`Voice agent/FAQS/server.js`) exposes the same shape at `/api/faqs` on
port 3100.

The seed is loaded once and cached in memory per process — restart the
server (`npm run dev` for the backend, or `node server.js` for the
standalone copy) to pick up a regenerated seed file.

## Refreshing the FAQ content

From inside `Voice agent/FAQS/`:

```bash
npm run refresh
```

This runs the full pipeline: pulls fresh text from the live Samagama FAQ
page → rebuilds `src/faq-data.js` → regenerates `data/faq-seed.json`.
Needs network access to `samagama.in`. You can also run the three steps
individually: `npm run import`, `npm run builddata`, `npm run seed`.

Then, to actually update what the deployed app serves, copy the result
over to the integrated copy:

```bash
cp "Voice agent/FAQS/data/faq-seed.json" backend/voice-agent/data/faq-seed.json
```

Restart the backend afterward.

## How to run

**Integrated (what the app actually uses):**

```bash
cd backend
npm install
npm run dev              # http://localhost:5002
```

Then open `http://localhost:5002/voice-agent` directly, or click "🎙️ Ask
the Voice Agent" on the FAQ page (`http://localhost:5173/faq` in dev, via
the frontend's Vite proxy).

**Standalone (offline reference / demo without the rest of the app):**

```bash
cd "Voice agent/FAQS"
npm install
npm start                 # http://localhost:3100
```

No MongoDB and no network access required for either — both serve from a
local seed file.

## Known gaps

- **No sync script** between the two seed files — see [Important](#important-there-are-two-copies-of-this-module) above. Easy to refresh one copy and forget the other.
- **Seed can drift from the real FAQ.** It's a manually refreshed snapshot, not live, and also not the same data source as the MongoDB-backed `/api/faqs` used by the main FAQ page — the voice agent and the FAQ page can answer the same question differently if one has been updated and not the other.
- **Voice recognition/synthesis quality depends entirely on the browser** — Chrome-based browsers work best; support elsewhere (Safari, Firefox) is inconsistent since it's the browser's native Web Speech API, not a bundled library.
- `backend/voice-agent/src/faq-data.js` is copied alongside the seed but isn't actually read by `voiceAgentRoutes.ts` — it's a leftover intermediate build artifact from the same pipeline that produces `faq-seed.json`, harmless but unused.

## Tech stack

- Vanilla JS, HTML, CSS (no framework) — Web Speech API (`SpeechRecognition` / `SpeechSynthesis`) for voice
- Served either by its own tiny `http` Node server (`Voice agent/FAQS/server.js`, standalone) or by the shared Express backend (`backend/src/routes/voiceAgentRoutes.ts` + static middleware in `backend/src/app.ts`, integrated)
- No database — local JSON seed file only