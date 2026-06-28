# CrowdFAQ

CrowdFAQ is a crowdsourced FAQ and community Q&A portal. It combines a React TypeScript frontend, an Express API, MongoDB-backed question and answer data, real-time updates via Socket.IO, and Gemini-powered semantic search.

## What It Solves

- **Reduces Repeated Support Work**: Centralizes common questions and official answers.
- **Unified Q&A Hub**: Gives users one searchable place to find FAQs and community answers.
- **Community Reputation**: Lets community members ask questions, contribute answers, and build reputation.
- **Admin Moderation**: Allows administrators and moderators to publish verified official responses and manage flagged content.

## Tech Stack

### Frontend
- **React 19 (TypeScript)**
- **Craco** (CRA config override)
- **Tailwind CSS & Tailwind Animate**
- **Radix UI Primitives**
- **Framer Motion**
- **Axios** (configured with global credentials handling)
- **React Hook Form & Zod**
- **Recharts** (for Analytics visualization)
- **Socket.IO Client** (for real-time notifications)

### Backend
- **Node.js & Express**
- **MongoDB with Mongoose**
- **JWT Authentication** (via HTTP-Only secure cookies)
- **Socket.IO** (for real-time question, answer, and status events)
- **Gemini API & Groq SDK** (Gemini for 3072-dimensional vector search embeddings, Groq for lightning-fast chatbot RAG responses)

## Project Structure

```text
CrowdFAQ/
  backend/      Express API, controllers, routes, schemas, and seeding scripts
  frontend/     TypeScript React application, Craco configuration, and Tailwind design system
  database/     Database-related project files and backup assets
  docs/         Technical specifications, team guides, and moderation API notes
  testing/      E2E and component-level testing support files
```

## Prerequisites

- **Node.js 18** or newer
- **npm** or **Yarn**
- **MongoDB** running locally or a MongoDB Atlas connection string
- **Gemini API Key** (required for vector embeddings)
- **Groq API Key** (optional, for fast RAG chat generation)

## Installation & Setup

### 1. Setup Backend
From the repository root:
```bash
cd backend
npm install
```
Create `backend/.env` and add:
```env
MONGODB_URI=mongodb://localhost:27017/CrowdFAQ
JWT_SECRET=change-this-secret
PORT=5000
CLIENT_ORIGIN=http://localhost:3000
NODE_ENV=development
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key
```

### 2. Setup Frontend
From the repository root:
```bash
cd frontend
npm install --legacy-peer-deps
```

---

## Running the Project

### Terminal 1: Run Backend
```bash
cd backend
npm run dev
# Runs backend on http://localhost:5000
```

### Terminal 2: Run Frontend
```bash
cd frontend
npm start
# Runs frontend on http://localhost:3000
```

---

## Available Scripts

### Backend Scripts
```bash
npm run dev    # Start backend with node --watch
npm start      # Start backend normally
npm test       # Run backend Jest test suite
```

### Frontend Scripts
```bash
npm start      # Start React development server
npm run build  # Build production frontend assets to frontend/build/
npm test       # Run frontend tests
```

---

## Core System Features

1. **AI FAQ Assistant (RAG)**: Uses MongoDB Atlas Vector Search and Gemini embeddings to retrieve relevant documentation, passing context to the chat model to answer user queries with clickable inline citations routing to `/q/:slug`.
2. **Dynamic Badges & Gamification**: Recalculates and persists user accomplishments (`Early Adopter`, `Storyteller`, `founder`, `verified`) to MongoDB when their profile is fetched.
3. **Interactive Comments & Flagging**: Allows inline nested discussions on questions and answers. Users can flag spam or policy-breaching posts, which populate in the moderator panel.
4. **Moderation Dashboard**: Admin/moderator console featuring real-time statistics, member management, and content flagging controls.

---

## Codebase & System Invariants

To keep the codebase stable and prevent deployment regressions, developers must adhere to the following invariants:

### 1. Vector Embedding Dimension (3072)
- **Rule**: The database schema in [Question.js](file:///c:/Users/kkp18/OneDrive/Pictures/Documents/IIT/CrowdFAQ/backend/models/Question.js) validates that any populated `embedding` array must be exactly **3072** elements.
- **Implication**: We use `gemini-embedding-001` which outputs 3072 dimensions. Changing the embedding model requires updating `EMBEDDING_DIMENSIONS` in both the schema validation and the MongoDB Atlas Search Vector index definition.

### 2. Cookie Authentication & Reverse Proxying
- **Rule**: Authentication JWT tokens are transmitted via secure, HTTP-Only cookies. The API client in `frontend/src/lib/api.ts` enforces `withCredentials: true`.
- **Implication**: To prevent modern browsers from blocking third-party cookies during deployment (e.g., frontend on Vercel, backend on Render), all backend requests are proxied via `/api/*` on the same domain. The `vercel.json` rewrite configuration must always proxy `/api/:path*` to the backend target url.

### 3. TypeScript Compilation & primitive Typing
- **Rule**: The frontend uses strict React 19 + TypeScript checks.
- **Implication**: Radical overrides and type augmentations are housed in `frontend/src/react-augmentation.d.ts` and `frontend/src/react-app-env.d.ts` (e.g., merging React's `forwardRef` types). Relaxed types (`any`) on Shadcn/Radix components are preserved to prevent compiler blocking during initial migrations.

### 4. ESLint Hook Check Directives
- **Rule**: In CI/CD pipelines (e.g., Vercel), compiler warnings are treated as hard errors (`CI=true`).
- **Implication**: Any `react-hooks/exhaustive-deps` warning overrides (like `// eslint-disable-next-line react-hooks/exhaustive-deps`) must be placed **directly above** the `useEffect` call declaration (not inside the dependency array).

### 5. Mock-Free State
- **Rule**: Application pages must pull real, dynamic data from the backend APIs rather than mock states.
- **Implication**: Mocks in `mockData.ts` are deprecated. Any newly added pages must consume state via the global `AuthContext` or Axios hooks.

### 6. Badges & Testing Connections
- **Rule**: The dynamic badge calculator `calculateAndStoreUserBadges` runs on-demand.
- **Implication**: It contains a safety guard checking `process.env.NODE_ENV === "test"` and Mongoose connection status. Database operations are bypassed during offline unit tests to avoid timeout crashes.
