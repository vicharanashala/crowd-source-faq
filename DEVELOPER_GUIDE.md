# Developer Quick Reference Guide

## 🚀 Quick Start

### Run the Project
```bash
# Terminal 1: Backend
cd backend
npm run dev
# Runs on http://localhost:5000

# Terminal 2: Frontend
cd frontend
npm start
# Runs on http://localhost:3001
```

### Test the API
```bash
# Health check
curl http://localhost:5000/api/v1/health

# Get questions
curl http://localhost:5000/api/v1/questions

# Register user
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Test","email":"test@test.com"}'
```

---

## 📂 Project Structure

```text
backend/
├── controllers/
│   ├── questionController.js     ✅ Create, list, get questions
│   ├── answerController.js       ✅ Answer CRUD, voting
│   └── triageController.js       ✅ Search & duplicate detection
├── routes/
│   ├── questionRoutes.js         ✅ Question endpoints
│   ├── answerRoutes.js           ✅ Answer endpoints
│   ├── searchRoutes.js           ✅ Search endpoint
│   └── authRoutes.js             ⚠️ Register/logout only (no login)
├── models/
│   ├── Question.js               ✅ Schema with validation
│   ├── Answer.js                 ✅ Schema with validation
│   └── User.js                   ✅ Schema ready
├── middleware/
│   ├── authMiddleware.js         ✅ JWT protection
│   └── errorHandler.js           ✅ Error handling
└── server.js                     ✅ Express setup

frontend/
├── src/
│   ├── components/
│   │   ├── layout/               ✅ Navbar, Footer, PageShell, AdminShell
│   │   └── ui/                   ✅ Radix UI primitive components
│   ├── pages/
│   │   ├── Home.tsx              ✅ Main Q&A feed
│   │   ├── Analytics.tsx         ✅ Stats & charts dashboard
│   │   ├── AskQuestion.tsx       ✅ Question creation page
│   │   ├── Categories.tsx        ✅ FAQ categories listing
│   │   ├── Login.tsx             ✅ Login interface
│   │   ├── Moderation.tsx        ✅ Admin moderation interface
│   │   ├── QuestionDetail.tsx    ✅ Question thread with answers
│   │   └── SearchResults.tsx     ✅ Search & triage results
│   ├── lib/
│   │   ├── mockData.ts           ✅ Sample questions/answers data
│   │   └── utils.ts              ✅ CN class merging helpers
│   ├── App.tsx                   ✅ Application router
│   ├── App.css                   ✅ Core styling definitions
│   └── index.tsx                 ✅ React entrypoint
```

---

## 🧪 Test Commands

### Test Backend
```bash
# Register user
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"displayName":"John","email":"john@test.com"}'

# List questions
curl http://localhost:5000/api/v1/questions
```

### Check Frontend
1. Open http://localhost:3001
2. Check browser console for errors (F12 → Console)
3. Try registering a user
4. Try logging out
