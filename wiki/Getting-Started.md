# Getting Started

## Prerequisites

- **Node.js** 22 or later
- **pnpm** 9.x (`npm install -g pnpm@9`)
- **MongoDB** Atlas cluster (or local MongoDB 7+)
- **Git**

Optional (for full feature set):
- **Redis** (Upstash or local) -- enables cross-instance caching and document queue
- **Discord Developer Application** -- enables bot and webhook logging
- **Zoom Marketplace App** -- enables meeting transcript ingestion
- **Google Cloud Storage bucket** -- enables image uploads
- **Anthropic/OpenAI/XAI API key** -- enables AI features

## Clone and Install

```bash
git clone https://github.com/vicharanashala/crowd-source-faq.git
cd crowd-source-faq
pnpm install
```

## Configure Environment Variables

### Backend

```bash
cp apps/backend/.env.example apps/backend/.env
```

Edit `apps/backend/.env` and set the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Min 32 characters. Generate with `openssl rand -hex 32` |
| `PORT` | No | Defaults to `6767` |
| `NODE_ENV` | No | `development` or `production` |
| `CLIENT_URL` | No | Full URL of the frontend (used for Zoom OAuth redirects) |

See [Environment Variables](./Environment-Variables.md) for the complete reference.

### Frontend

```bash
cp apps/frontend/.env.example apps/frontend/.env
```

For local development, the frontend `.env` can be left empty. The Vite dev server proxies API calls to `localhost:6767` automatically.

## Run in Development

### Using the development script

```bash
./run.sh
```

This starts both the backend (port 6767) and frontend dev server (port 5173) with hot module reloading.

### Using turbo (manual)

```bash
# Start both
pnpm dev

# Backend only
pnpm dev:backend

# Frontend only
pnpm dev:frontend
```

### Backend only (with tsx)

```bash
cd apps/backend
npx tsx src/server.ts
```

## Verify

- Backend health: `curl http://localhost:6767/csfaq/api/health`
- Frontend dev: Open `http://localhost:5173/csfaq/` in your browser
- Backend serves SPA: Open `http://localhost:6767/csfaq/` (uses compiled frontend from `apps/frontend/dist`)

## Build for Production

```bash
pnpm build
```

This runs `turbo build`, which:
1. Builds the frontend Vite SPA into `apps/frontend/dist`
2. The backend TypeScript is executed directly via `tsx` (no separate build step)

## Run Tests

```bash
pnpm test:run         # Unit tests
pnpm test:e2e         # End-to-end tests (Playwright)
pnpm test:all         # Both
pnpm typecheck        # TypeScript type checking
pnpm lint             # ESLint
```

## Create an Admin User

After the server is running with a connected database, create an admin user:

```bash
curl -X POST http://localhost:6767/csfaq/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Admin",
    "lastName": "User",
    "email": "admin@example.com",
    "password": "your-secure-password",
    "phone": "+1234567890"
  }'
```

Then promote the user to admin in MongoDB:

```javascript
// In MongoDB shell or Atlas UI
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "admin" } }
)
```

## Project Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps for production |
| `pnpm test` | Run tests in watch mode |
| `pnpm test:run` | Run tests once |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm lint` | Run ESLint |
| `pnpm format:check` | Check Prettier formatting |
| `pnpm format:write` | Fix Prettier formatting |
