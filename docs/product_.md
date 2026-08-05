# FAQ Quiz Mode — Product Overview

A spaced-repetition quiz layer over the approved FAQ base. Turns passive reading into active recall, and feeds correct answers back into the platform's existing reputation economy instead of introducing a parallel one.

---

## What it does

Three pillars, same "zero-touch" philosophy as the rest of the platform:

1. **Generate** — any approved FAQ automatically becomes a multiple-choice question. No manual question-writing, no separate content pipeline. The correct answer comes from the FAQ itself; three distractors are pulled from other approved FAQs in the same category.
2. **Score** — a user takes a quiz session; each answer is checked server-side against a private answer key (never exposed to the client before submission) and immediately marked correct/incorrect.
3. **Retain** — every answer updates a personal, per-FAQ spaced-repetition record (SM-2 algorithm — the method behind tools like Anki): ease factor, streak, and next-due date. This is the one axis nothing else in the platform covers — the existing AI layer manages whether FAQ *content* is accurate and fresh; this manages whether a *person* actually remembers it.

---

## Key features

- **Feature-flag gated** — registered as `quizMode` in the platform's existing closed-allowlist feature-flag system. Shows up in `/admin/features` automatically; supports the same per-batch override mechanism as every other experimental feature (`goldenTicket`, `askAiChatbot`, etc.) — no redeploy needed to toggle it on/off, globally or per-batch.
- **Answer-key privacy** — `POST /api/quiz/sessions` generates the question set and stores the correct answers only inside the server-side `QuizSession` document. The response sent to the browser never includes `correctIndex` — it's only revealed per-question, after the user submits an answer for it.
- **SM-2 spaced repetition** — a dedicated `QuizCard` collection tracks `easeFactor`, `intervalDays`, `repetitions`, and `dueAt` per (user, FAQ) pair, updated on every answer.
- **Native reputation integration** — correct answers award SP through the platform's existing `awardToUser` / `ReputationLog` / `autoAwardBadges` pipeline, the same code path used by comments, FAQ approvals, and other reputation-earning actions elsewhere in the app.
- **Batch-scoped** — quiz question pools respect the same `batchId` scoping used across FAQs, reputation, and feature flags.

---

## Tech stack (one-liner per layer)

| Layer | Pick |
|---|---|
| Backend | Node.js + Express + TypeScript — new `modules/quiz/` folder, sibling to `modules/faq/` and `modules/moderation/`, reusing the existing `protect` middleware |
| Database | MongoDB (Mongoose) — two new collections, `yaksha_faq_quiz_cards` and `yaksha_faq_quiz_sessions`, following the existing typed-interface + compound-index conventions |
| Frontend | React + TypeScript + Vite — new `/quiz` route wrapped in the existing `<FeatureGate>` component, wired into the existing nav-pill component |
| Scheduling | SM-2 spaced-repetition algorithm — rule-based, no external service or ML model required for v1 |

---

## API surface

| Method & Route | Purpose |
|---|---|
| `GET /api/quiz/questions` | Lightweight preview endpoint (reveals answers — testing only, not used for scoring) |
| `POST /api/quiz/sessions` | Starts a real scored session; stores the answer key server-side |
| `POST /api/quiz/sessions/:id/answer` | Submits one answer; returns correctness; updates the SM-2 quiz card |
| `POST /api/quiz/sessions/:id/complete` | Finalizes score; triggers the reputation/SP award |

---

## Data model

**`QuizCard`** (one per user + FAQ pair)
`userId, faqId, batchId, easeFactor, intervalDays, repetitions, dueAt, lastResult, lastReviewedAt`

**`QuizSession`** (one per quiz attempt)
`userId, batchId, categoryFilter, answerKey[], answers[], score, totalQuestions, startedAt, completedAt`

---

## Known limitation

Spaced repetition is **tracked but not yet applied to selection**. `QuizCard.dueAt` is correctly updated after every answer, but `startQuizSession` currently selects questions via a plain random shuffle of the approved-FAQ pool — it doesn't yet prioritize FAQs that are actually due for review. The tracking infrastructure is complete; one further change to the selection query (prefer `dueAt <= now`, fall back to random) would make the "wrong answers resurface sooner" behavior fully live. Tracked as the top item in Future Enhancements in the project report.

---

## Future enhancements

- Due-date-aware question selection (closes the limitation above)
- Instructor/admin analytics view — surface which FAQs are most frequently missed, as a feedback signal into FAQ content quality
- AI-generated distractors (upgrade from rule-based, using the platform's existing AI provider integration)
- User-selectable question count and category-scoped sessions (already supported server-side via `limit`/`category` params, not yet exposed in the UI)
- Daily quiz-streak notifications, reusing the existing notification system
