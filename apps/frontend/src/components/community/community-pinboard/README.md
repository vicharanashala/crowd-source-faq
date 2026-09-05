# Community Pinboard

A proactive information channel for the CSFAQ platform: mentors and senior interns can pin reminders and important links for new joinees, instead of relying entirely on search-driven FAQ discovery.

> **Problem it solves:** a new intern can't search for something they don't know exists (a changed Zoom password, an attendance cut-off, a submission deadline). The Pinboard pushes that information to them instead of waiting for them to ask.

---

## Status

This checklist tracks the feature against the six-workstream completion plan. Check items in before merging the PR; anything left unchecked is real, outstanding work — not a formality.

### ✅ Core (must be true before this PR merges)

- [ ] Single canonical `Reminder` / `ImportantLink` type in `packages/types/pinboard.ts`, and the other divergent type definitions (in `packages/types/models/reminder.ts` and the local type inside `BookmarkList.tsx`) removed
- [ ] `services/` data layer added (`useReminders`, `useBookmarks`, `useImportantLinks`) calling the existing backend endpoints — no component fetches or fakes its own data
- [ ] `CommunityPinboardPage.tsx` Reminders tab renders live data via `ReminderList` / `ReminderCard` (placeholder text removed)
- [ ] `ReminderFilters` / `ReminderSearch` connected to the backend's existing search/tag/priority query support
- [ ] Bookmarks tab renders live data via `BookmarkList`, using the real `POST /reminders/:id/bookmark` and `GET /reminders/bookmarks` endpoints
- [ ] Reported bookmark-save bug reproduced and fixed
- [ ] Duplicate Important Links implementation removed (`community-pinboard/link/ImportantLinks.tsx`, which used hardcoded sample data) — only `important-links/ImportantLinksTab.tsx` remains
- [ ] `ImportantLinksTab` persists to the real backend (`important-link` model/routes) instead of local-only React state
- [ ] "Add Reminder" UI wired to `POST /reminders`
- [ ] `EditReminderModal` wired in and reachable (currently built but unused anywhere)
- [ ] Pin / verify controls added to `ReminderCard` for admins/moderators, calling `POST /reminders/:id/pin` and `/verify`
- [ ] `/community-pinboard` registered in `AppRoutes.tsx` (the page currently has no route and is unreachable)
- [ ] Pinboard entry-point icon added to `HomePage.tsx`, linking to the route above
- [ ] `docs/design/community-pinboard-plan.md` filled in (currently an empty file)

### 🔜 Future scope (not required for this PR — track separately)

- [ ] Reminder expiration / auto-archive using the existing optional `eventDate` field
- [ ] Notifications (in-app badge or digest) for newly pinned or mentor-verified reminders
- [ ] Engagement analytics for admins (most-read / most-bookmarked / most-voted reminders)
- [ ] Automated test coverage: voting, pin/verify authorization, bookmark uniqueness (none currently exist)
- [ ] Server-side sorting/pagination for admin list views currently sorted client-side, if volume grows
- [ ] Reporting/flagging flow for inappropriate community-submitted reminders
- [ ] Multilingual support for reminders and important links, in line with the platform's broader translation work

---

## Architecture

```
HomePage.tsx  (pinboard icon)
      │
      ▼
CommunityPinboardPage.tsx  (routed at /community-pinboard)
      │
      ├── Reminders tab  ──┐
      ├── Bookmarks tab  ──┤
      └── Important Links ─┘
                            │
                            ▼
              services/  (useReminders, useBookmarks, useImportantLinks)
              — single source of truth: packages/types/pinboard.ts
                            │
                            ▼
              Express API — community.routes.ts
              (/community/reminders, /community/important-links)
                            │
                            ▼
              MongoDB Atlas
              CommunityReminder · ReminderBookmark · ImportantLink
```

The backend (models, routes, controllers, Zod validation) was built first and has not needed to change since. Everything above the `services/` layer is what this PR/checklist is closing out.

## Folder structure

```
apps/frontend/src/components/community/community-pinboard/
├── reminders/        Reminder cards, list, filters, search, empty/loading states
├── bookmark/          Saved-reminders list
├── link/              (superseded — see checklist: duplicate implementation to remove)
└── services/          Data layer: hooks over the pinboard API (this PR)

apps/frontend/src/components/community/important-links/
└── ...                Admin-managed links UI — the implementation actually used by CommunityPage

apps/frontend/src/components/community/moderation/
└── ...                Admin controls, edit/delete, verification badge

apps/backend/src/modules/community/
├── community-reminder.model.ts
├── reminder-bookmark.model.ts
├── reminder.routes.ts / .controller.ts / .service.ts
└── important-link.routes.ts / .controller.ts / .model.ts

packages/validation/src/schemas/pinboard.schema.ts   Shared Zod schemas
packages/types/pinboard.ts                            Canonical shared types (this PR)
```

**Note on naming:** earlier scaffolding used `bookmarks/`, `links/`, `admin/`, `create/`, `widget/` (plural, and some now missing). Actual folders are `bookmark/`, `link/` (singular). Pick one convention and rename to match before merging, so future contributors don't recreate the mismatch.

## API reference

| Method & Path | Access | Purpose |
|---|---|---|
| `GET /community/reminders` | Public | List reminders (search / tag / priority filters, sort, pagination) |
| `GET /community/reminders/:id` | Public | Fetch a single reminder |
| `GET /community/reminders/bookmarks` | Authenticated | List the current user's bookmarked reminders |
| `POST /community/reminders` | Authenticated | Create a reminder |
| `PATCH /community/reminders/:id` | Authenticated | Update a reminder |
| `DELETE /community/reminders/:id` | Authenticated | Delete a reminder |
| `POST /community/reminders/:id/vote` | Authenticated | Upvote / downvote |
| `POST /community/reminders/:id/bookmark` | Authenticated | Toggle bookmark |
| `POST /community/reminders/:id/pin` | Admin / Moderator | Toggle pinned state |
| `POST /community/reminders/:id/verify` | Admin / Moderator | Toggle mentor-verified badge |
| `GET /community/important-links` | Public | List important links |
| `POST /community/important-links` | Admin / Moderator | Create a link |
| `PATCH /community/important-links/:id` | Admin / Moderator | Update a link |
| `DELETE /community/important-links/:id` | Admin / Moderator | Delete a link |

## Contributing to what's left

Work through the ✅ checklist top to bottom — item 1 (canonical types + services layer) should land before anything else, since every other item depends on it and re-declaring types in isolation is exactly what caused the duplication this checklist exists to fix. Items 2–4 can then proceed in parallel; item 5 (routing/entry point) should be last since it's what makes everything else visible.

Do not modify another contributor's folder unless discussed with the feature owner.
