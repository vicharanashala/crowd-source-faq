# Frontend Guide

The frontend is a single-page application (SPA) built with React, TypeScript, TailwindCSS, and Vite. It is designed to run either stand-alone (with a separate proxy/hosting like Vercel) or as a statically compiled client served directly by the Express backend.

---

## Technical Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: TailwindCSS (v3) and Vanilla CSS custom properties
- **Routing**: React Router DOM (v6) with path base `/csfaq`
- **State Management**: React Context + Custom Hooks
- **Icons**: Lucide React

---

## Project Structure

All frontend files are located in `apps/frontend/src`:

```
src/
  admin/                   -- Admin-only views, hooks, components, and layout
    components/            -- Admin specific UI blocks
    hooks/                 -- Admin state hooks
    pages/                 -- Admin pages (moderation, settings, tickets, etc.)
  components/              -- Public user-facing components
    auth/                  -- Auth state modals and triggers
    layout/                -- Navbar, Footer, and Page Shells
    ui/                    -- Reusable components (buttons, badges, spinners)
  context/                 -- Global React Context providers
    BatchContext.tsx       -- Active Batch/Program selection and persistence
    FeatureFlagContext.tsx -- Dynamic feature toggle checks
  hooks/                   -- Global custom hooks
    useAuth.tsx            -- Current user state, JWT handling, and login/register
  pages/                   -- Public portal pages (FAQ, Community, Support, etc.)
  routes/                  -- React Router configurations
    AppRoutes.tsx          -- URL mapping and access rules (Public vs Admin)
  styles/                  -- CSS entry points and custom Tailwind directives
  utils/                   -- Shared frontend helpers (date formatting, API clients)
```

---

## Global Context Providers

The application's behavior is shaped by three key state providers wrapped in `App.tsx`:

### 1. Authentication Context (`useAuth`)
Provides the authentication state, token refresh mechanisms, and helper methods:
- **State**: `user` profile, `isAuthenticated`, `token` (JWT).
- **Methods**: `login()`, `logout()`, `register()`, and `refreshSession()`.
- **Storage**: The JWT token is saved in `localStorage` for session persistence. If a request returns a 401 status code, a refresh token call is sent to clear or renew the session.

### 2. Batch/Program Context (`BatchContext`)
Allows users and admins to work within a specific program scope:
- **State**: `activeBatch` (currently selected Batch object).
- **Methods**: `selectBatch()`, `fetchActiveBatches()`.
- **Storage**: Persists the selected batch ID to `localStorage` so a user does not have to re-select it upon reload.

### 3. Feature Flag Context (`FeatureFlagContext`)
Fetches and evaluates feature toggles in real time:
- **Source**: Communicates with `/api/programs/feature-flags` to load active settings.
- **Usage**: Controls whether tabs (like Community, Support, Zoom recordings) are visible.
- **Example**:
  ```tsx
  const { isEnabled } = useFeatureFlags();
  if (isEnabled('community_portal')) {
    return <CommunityTab />;
  }
  ```

---

## Routing and Navigation

The app uses `BrowserRouter` with `basename="/csfaq"`. In production, all routes map under `/csfaq/...`:
- **User Routes**:
  - `/` (Home page / Program selector)
  - `/faq` (FAQ list and search tool)
  - `/community` (Community Q&A and escalations)
  - `/support` (My support requests and Golden Ticket flow)
- **Admin Routes**:
  - `/admin/login` (Admin login access)
  - `/admin/dashboard` (Stats overview)
  - `/admin/faqs` (Manage FAQ entries)
  - `/admin/moderation` (Review flagged posts and comments)
  - `/admin/settings` (System configuration, AI providers, and integration logs)

---

## Local Development and Config

1. Make sure the backend API is running locally (defaults to `http://localhost:6767`).
2. Create `apps/frontend/.env` (copy from `apps/frontend/.env.example`).
3. Launch the development server:
   ```bash
   pnpm --filter frontend dev
   ```
4. The dev server runs at `http://localhost:5173/csfaq/`.
5. The Vite proxy configuration in `vite.config.ts` automatically forwards all `/csfaq/api/*` requests to the backend server:
   ```typescript
   proxy: {
     '/csfaq/api': { target: 'http://localhost:6767', changeOrigin: true }
   }
   ```

---

## Production Build

To build the client assets:
```bash
pnpm --filter frontend build
```

This generates static files in `apps/frontend/dist/`.
- In a **single-container deployment**, these files are copied into the backend's public distribution folder, allowing the backend to serve them via `express.static()`.
- In a **multi-container deployment**, you can upload `apps/frontend/dist/` directly to a hosting provider (like Vercel, Netlify, or AWS S3) and serve it as a static website, with a reverse proxy routing `/csfaq/api/` to the backend.
