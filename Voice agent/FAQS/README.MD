# Vicharanashala FAQ Voice Agent

> **Integrated:** this voice agent now also runs inside the main backend
> (`backend/voice-agent/`), on the same port as the rest of the CSFAQ app —
> see `http://localhost:5002/voice-agent` once the backend is running, or
> the "Ask the Voice Agent" button on the FAQ page. The standalone server
> below (port 3100) still works and is kept for offline/local-only demos of
> just this module, but it is no longer required for the integrated app.

A browser-based FAQ voice agent for the Vicharanashala Internship FAQ.

The app stores the FAQ data **locally** in `data/faq-seed.json`. The frontend
talks to the local Node server at `/api/faqs`, and the server reads that seed
file and returns it as JSON — there is no dependency on MongoDB, and no
network call to any external site at runtime.

> This is a fix from an earlier version of this module, which fetched FAQ
> content live from `https://samagama.in/internship/faq` (an already-deployed,
> unrelated production site) instead of using data owned by this project. That
> made the module impossible to demo offline and coupled it to a site outside
> our control. It now runs entirely on the bundled seed file.

## Features

- Ask internship FAQ questions by typing.
- Ask questions by voice using browser speech recognition.
- Speaks answers back using browser speech synthesis.
- Serves FAQ data from the local `data/faq-seed.json` file — works fully offline.
- Uses `data/training.json` for aliases and short voice-friendly answers (already merged into `faq-seed.json`).

## Project Structure

```txt
.
├── data/
│   ├── faq-seed.json      # FAQ data the server actually serves (source of truth)
│   └── training.json      # Aliases / short voice answers, used only when rebuilding the seed
├── scripts/
│   ├── build-data.js      # Optional: rebuild faq-seed.json from data/faq.txt + training.json
│   └── import-live-faq.js # Optional: pull fresh text from the live FAQ page for build-data.js
├── src/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── server.js
├── package.json
├── package-lock.json
└── README.md
```

## Important

`node_modules` is not included in the GitHub repository.

After cloning/downloading the project, install dependencies with:

```bash
npm install
```

## Run Locally
cd FAQS 
```bash
npm install
npm start
```

Then open:

```txt
http://localhost:3100
```

If the terminal shows:

```txt
Voice agent running at http://0.0.0.0:3100
```

that is normal. Open it in the browser using:

```txt
http://localhost:3100
```

## How FAQ Loading Works

When the app starts:

1. The frontend loads in the browser.
2. `src/app.js` calls `/api/faqs`.
3. `server.js` reads `data/faq-seed.json` from disk and returns it as JSON.
4. The voice agent searches those FAQ answers in the browser.

No MongoDB, and no live network call, is required for the voice agent to run.
This means mentors can clone the repo and run it with just `npm install && npm start`
— no database setup needed to see this feature working end to end.

## Deploy

This project needs a Node server, so do not deploy it as a static-only HTML site.

Use a Node hosting platform such as Render, Railway, Fly.io, or any VPS.

Build/install command:

```bash
npm install
```

Start command:

```bash
npm start
```

The server uses `process.env.PORT` automatically, so most hosting platforms will work without changing the code.

## Scripts

```bash
npm start
```

Starts the voice agent server, serving FAQ data from `data/faq-seed.json`.

```bash
npm run import
```

Optional. Downloads current FAQ text from the live Samagama FAQ page into
`data/faq.txt`, for refreshing the seed data later. Not required to run the app.

```bash
npm run builddata
```

Optional. Rebuilds `src/faq-data.js` from `data/faq.txt` and `data/training.json`.

```bash
npm run seed
```

Converts the current `src/faq-data.js` into `data/faq-seed.json` — the file
the server actually reads at runtime. Run this after `builddata` to make new
content live.

```bash
npm run refresh
```

Does all three steps in one go: pulls fresh text from the live FAQ page,
rebuilds `src/faq-data.js`, and regenerates `data/faq-seed.json`. Needs
network access to `samagama.in`. Restart the server (`npm start`) afterward
to pick up the new seed.

## Notes

- `data/faq-seed.json` is loaded once and cached in memory for the life of the process; restart the server to pick up an updated seed file.
- Voice recognition support depends on the browser. Chrome usually works best.
