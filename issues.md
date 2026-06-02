# Yaksha FAQ Portal — Full Codebase Audit Report

> **Audited:** 2026-05-31 | **Scope:** Frontend (React/Vite) + Backend (Express/MongoDB)

---

## 🔴 CRITICAL — Blocking / Security Risks

### 1. TypeScript Build Fails — `PostDetailDialog.tsx` Has 14 Type Errors
**File:** `frontend/src/components/community/PostDetailDialog.tsx`  
**Impact:** Frontend build (`npm run build`) fails. Production deployment broken.  
**Root Cause:** The `Post` type in `types/ui.ts` defines `comments` as `unknown[]`, but `PostDetailDialog` accesses typed properties (`.upvotes`, `.downvotes`, `._id`) on comment objects without casting correctly. The `.find(cm => cm._id === ...)` calls fail because `cm` is `unknown`.

**Errors include:**
- `'cm' is of type 'unknown'` (lines 333, 381)
- `Property 'upvotes' does not exist on type '{}'` (lines 336, 364, 365)
- `Property 'downvotes' does not exist on type '{}'` (lines 384, 427, 428)
- `Parameter 'u' implicitly has an 'any' type` (lines 336, 364, 365, 384, 427, 428)

**Fix:** Define a proper `Comment` interface in `types/ui.ts` with `_id`, `body`, `author`, `upvotes`, `downvotes`, `replies`, `parentId` fields. Change `Post.comments` from `unknown[]` to `Comment[]`.

---

### 2. Zoom OAuth Tokens Stored in Plaintext in MongoDB
**Files:** `backend/models/User.ts`, `backend/controllers/zoomAuthController.ts`  
**Impact:** If the database is compromised, attacker gets full Zoom API access for all connected users.  
**Details:** `zoomAccessToken` and `zoomRefreshToken` are stored as plain `String` fields. They are NOT marked `select: false` on the schema, meaning they are returned in **every** User query that doesn't explicitly exclude them — including `GET /api/auth/users` (admin user list), `getAllPosts` (populates `author`), etc.

**Fix:** 
1. Mark both fields with `select: false` in the User schema (like `password`)
2. Encrypt tokens at rest using `crypto.createCipheriv()` before saving
3. Audit all `User.find()` calls to ensure tokens are never leaked to API responses

---

### 3. JWT_SECRET Non-null Assertion (`!`) — Server Crashes if Missing
**Files:** `backend/middleware/auth.ts:19`, `backend/middleware/admin.ts:22`  
**Impact:** If `JWT_SECRET` is undefined (e.g., `.env` not loaded properly), `jwt.verify()` throws a cryptic runtime error, not a useful error message.  
**Details:** Both middleware files use `process.env.JWT_SECRET!` — the `!` silences TypeScript but doesn't prevent runtime failures. The `validateEnv()` function in `server.ts` only runs in development mode (`NODE_ENV !== 'production'`), meaning production deployments skip validation entirely.

**Fix:** 
1. Move `validateEnv()` outside the development-only block — run it always
2. Fallback: Add a guard in `auth.ts`/`admin.ts`: `const secret = process.env.JWT_SECRET; if (!secret) return res.status(500).json(...)` 

---

### 4. `authorize()` Middleware Returns 500 Instead of 403
**File:** `backend/middleware/auth.ts:34-42`  
**Impact:** When a user with insufficient permissions hits a protected route (e.g., a regular user trying to access admin FAQ endpoints), the `authorize()` middleware calls `next(new Error('Insufficient permissions.'))` — which triggers the **global error handler** and returns a `500 Internal Server Error` instead of `403 Forbidden`.

**Fix:** Replace `next(new Error(...))` with `res.status(403).json({ message: 'Insufficient permissions.' }); return;`

---

### 5. `validateEnv()` Skipped in Production
**File:** `backend/server.ts:246-251`  
**Impact:** When `NODE_ENV=production`, the server skips all environment variable validation and starts without checking for `MONGODB_URI`, `JWT_SECRET`, etc. The server will crash on first request with a cryptic error.

**Fix:** Always call `validateEnv()` regardless of `NODE_ENV`.

---

## 🟠 HIGH — Functional Bugs

### 6. `getConfidenceLevel()` Always Returns "Medium" or "High" — Never "Low"
**File:** `frontend/src/pages/HomePage.tsx:116-123`  
**Details:** The function has a dead code path:
```ts
if (textScore >= 2 || vectorScore >= 0.9) return 'High';
if (textScore > 0 || vectorScore >= 0.82) return 'Medium';
return 'Medium'; // ← should be 'Low'
```
The fallback `return 'Medium'` means low-confidence results are indistinguishable from medium ones.

**Fix:** Change the final `return` to `return 'Low'` and add a "Low" style to the `ConfidenceTag` component.

---

### 7. Community Posts Filter/Sort State Is UI-Only — Not Sent to Backend
**File:** `frontend/src/pages/CommunityPage.tsx:31-33, 41-57`  
**Impact:** The `filter`, `sort`, and `search` state variables are declared and rendered in the UI, but `fetchPosts()` never passes them as query params. The backend always returns all posts sorted by `createdAt: -1` regardless of what the user selects.

**Fix:** Pass `filter`, `sort`, and `search` as query params in the `api.get('/community', { params: { ... } })` call, and handle them in the backend `getAllPosts` controller.

---

### 8. Admin Login Doesn't Prevent Regular Users from Logging In Before Navigation
**File:** `frontend/src/admin/pages/AdminLogin.tsx:15-31`  
**Impact:** When a non-admin user logs in via `/admin/login`, the `login()` function succeeds and stores the JWT token + user in localStorage. Then the role check happens client-side. The user is shown an error message, but their token and session are already saved. If they navigate to `/` manually, they're logged in.

**Fix:** Either check the role server-side (dedicated admin login endpoint), or call `logout()` when the role check fails.

---

### 9. Cache Hash Collision Risk — `hashQuery()` Uses 32-bit Hash
**File:** `backend/utils/cache.ts:30-38`  
**Impact:** The cache key uses a simple 32-bit djb2 hash. With 500+ cached queries, hash collisions become likely. Two different queries could return the same cached results — **users would see wrong answers**.

**Fix:** Use a proper hash function (e.g., `crypto.createHash('sha256')`) or include the full normalized query string in the cache key.

---

### 10. Frontend API Cache Breaks Stale-While-Revalidate for POST `/search`
**File:** `frontend/src/utils/api.ts:30-33`  
**Impact:** The adapter caches `POST /search` responses for 1 minute keyed by `method:url:params:data`. If a user searches "offer letter", gets cached results, then an FAQ is updated, they'll see stale results for up to 1 minute — **even if they search again**. The cache key includes the request body, but the cache doesn't get invalidated when FAQ data changes on the server.

Additionally, `POST` requests being cached is confusing for developers and violates HTTP semantics.

---

## 🟡 MEDIUM — Code Quality / UX Issues

### 11. `HomePage.tsx` Is 885 Lines — God Component
**File:** `frontend/src/pages/HomePage.tsx`  
**Impact:** Extremely hard to maintain. Contains 5+ inlined sub-components (`DoodleElements`, `ConfidenceTag`, `ClockIcon`, `ThumbsUpIcon`, `ThumbsDownIcon`, `ResultItem`, `HistoryModal`) plus the main `HomePage` component. Any change risks breaking something else.

**Fix:** Extract `ResultItem`, `HistoryModal`, `DoodleElements`, and all SVG icons into separate files.

---

### 12. SearchBar Auto-Triggers Search on Every Keystroke After Debounce — No Way to Cancel
**File:** `frontend/src/components/ui/SearchBar.tsx:117-128`  
**Impact:** Once the user types 3+ characters, a search fires automatically after 600ms. There's no way for the user to just type without triggering a search. This wastes API calls and can be annoying.

**Additional issue:** The `disableSuggestions` prop on the HomePage SearchBar means the suggestion dropdown is disabled, but the auto-search debounce still fires. The intent seems confusing.

---

### 13. `Post.comments` Type Is `unknown[]` — Causes Type Errors Everywhere
**File:** `frontend/src/types/ui.ts:11`  
**Impact:** Every component that accesses comment properties has to use `as` casts or unsafe access, leading to the 14 TS errors in `PostDetailDialog.tsx` and fragile code elsewhere.

**Fix:** Define a `Comment` type and use it throughout.

---

### 14. `CommunityPage.tsx` Fetches All Posts But Doesn't Paginate on Scroll
**File:** `frontend/src/pages/CommunityPage.tsx:41-57`  
**Impact:** `hasMore` state is tracked but there's no intersection observer or "Load More" button visible in the initial page load logic. The `loadMore` state is set but the UI doesn't seem to have a trigger for it in the code I reviewed.

---

### 15. Redundant DB Connection Per Request
**File:** `backend/server.ts:48-55`  
**Impact:** Every single request calls `connectDB()` as middleware. While the function caches the connection, it still checks `if (cachedConnection)` on every request — adding overhead. This was likely added for serverless (Vercel) but runs on every request in local dev too.

---

### 16. No Rate Limiting on Authentication Endpoints
**File:** `backend/server.ts:99-116`  
**Impact:** Login and registration endpoints use the same generic `300 req/15min` limiter as all API endpoints. This is too permissive for auth endpoints — brute-force attacks can attempt 300 passwords per 15 minutes per IP.

**Fix:** Add a stricter rate limiter for `/api/auth/login` (e.g., 10 attempts per 15 minutes).

---

### 17. `AccountPage` Has No Edit Profile Functionality
**File:** `frontend/src/pages/AccountPage.tsx`  
**Impact:** The backend has `PATCH /api/auth/profile` and `PUT /api/auth/password` endpoints, but the Account page only shows the user's info and a Zoom integration card. Users can't change their name, email, or password from the UI.

---

### 18. `getAllUsers` in AuthController Duplicates Admin Check
**File:** `backend/controllers/authController.ts:110-121`  
**Impact:** The route already uses `protect, authorize('admin')` middleware, but the controller also checks `req.user.role !== 'admin'` manually. This is redundant and will diverge if roles change.

---

## 🔵 LOW — Minor Issues / Improvements

### 19. Unused Import: `axios` in `HomePage.tsx`
**File:** `frontend/src/pages/HomePage.tsx:3`  
**Details:** `axios` is imported directly but only used once for `axios.isCancel(err)`. The `api` instance already wraps axios. Could use `api.isAxiosError()` or just catch cancel errors differently.

---

### 20. `fallbackPopular` Hardcoded Queries Don't Match Real Data
**File:** `frontend/src/pages/HomePage.tsx:108-114`  
**Details:** Fallback popular searches ("offer letter", "noc request", etc.) are hardcoded and may not match any actual FAQs in the database, leading to "no results" when clicked.

---

### 21. No 404 Page — All Unknown Routes Redirect to Home
**File:** `frontend/src/App.tsx:114`  
**Details:** `<Route path="*" element={<Navigate to="/" replace />} />` silently redirects all invalid URLs. Users who mistype a URL won't know they made a mistake.

**Fix:** Create a proper 404 page component.

---

### 22. `AdminLogin` Uses `framer-motion` — Only Place in the App
**File:** `frontend/src/admin/pages/AdminLogin.tsx:3`  
**Impact:** Adds ~32KB to the bundle for a single fade-in animation on the admin login page. Can be done with CSS `@keyframes`.

---

### 23. SearchLog Batch Buffer Has No Drain on Shutdown
**File:** `backend/controllers/searchController.ts:32-61`  
**Impact:** If the server shuts down while logs are buffered, those search logs are lost. The `SIGTERM`/`SIGINT` handlers in `server.ts` don't flush the search log buffer.

---

### 24. Console Warnings in Production
**Files:** `backend/controllers/searchController.ts:80,120`, `backend/utils/cache.ts:57,61,79`  
**Impact:** `console.warn()` and `console.log()` calls for cache hits/misses and search failures run in production, cluttering logs with non-actionable noise. Should use the structured `logger` utility instead.

---

### 25. No `<title>` or Meta Tags on Any Page
**Files:** All pages in `frontend/src/pages/`  
**Impact:** Every page shows the default Vite `<title>` ("Vite + React + TS"). No page-specific titles, no meta descriptions. Bad for SEO and tab identification.

**Fix:** Use `react-helmet-async` or `document.title` in each page component.

---

### 26. Missing `aria-label` on Several Interactive SVG Buttons
**Files:** `Navbar.tsx` (profile dropdown), `HomePage.tsx` (thumbs up/down, history), `SearchBar.tsx` (search icon)  
**Impact:** Screen readers can't identify the purpose of icon-only buttons.

---

### 27. Backend `getAllUsers` Route Returns Full User Objects Including Zoom Fields
**File:** `backend/controllers/authController.ts:116`  
**Details:** `User.find({})` without `.select()` returns all fields. While `password` is `select: false`, other sensitive fields like `zoomUserId`, `banReason`, `positiveBadges`, `negativeBadges` are all returned to the admin frontend. The admin controller in `adminController.ts` correctly uses `.select('-password')` but `authController.ts` does not.

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 5 |
| 🟠 High | 5 |
| 🟡 Medium | 8 |
| 🔵 Low | 9 |
| **Total** | **27** |

### Recommended Fix Priority:
1. **Fix TS build errors** (#1, #13) — unblocks deployment
2. **Security: Zoom tokens + JWT validation** (#2, #3, #5) — critical vulnerabilities
3. **Fix authorize middleware 500 → 403** (#4) — users see wrong error
4. **Fix confidence level dead code** (#6) — misleads users  
5. **Fix admin login session leak** (#8) — security hole
6. **Add edit profile UI** (#17) — basic feature gap
7. **Everything else** — code quality and polish
