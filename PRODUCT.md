# Crowd Source FAQ (Yaksha FAQ Portal)

**Full-stack FAQ portal with semantic vector search, AI-powered community moderation, and an expert promotion layer.**

**Repository:** https://github.com/vicharanashala/crowd-source-faq

**PR:** #230

---

## 📖 Executive Summary

Crowd Source FAQ (Yaksha FAQ Portal) is a full-stack FAQ management platform that automates the entire FAQ lifecycle through AI-powered ingestion, answering, and quality control. Built with the "zero-touch" philosophy, the platform handles 1 million registered users while maintaining high-quality, up-to-date FAQ content.

The platform is designed for organizations whose communities generate more questions than a human team can answer — student cohorts, open-source projects, internal forums, and customer-success communities.

---

## 🎯 Introduction

Every question a user has has been asked before — and most will be asked again. The right answer should be there before the user finishes typing. The platform achieves this through four zero-touch pillars:

- **Zero-touch ingestion** — Zoom meetings, webhooks, and manual uploads feed the knowledge base without human intervention.
- **Zero-touch answering** — A 24-hour scheduler matches unanswered posts against the knowledge base.
- **Zero-touch quality control** — Approved FAQs are re-evaluated every 6 hours.
- **Zero-touch user lifecycle** — Deletion is anonymization, not destruction.

The platform is the operator. People handle exceptions, not the steady state.

---

## 🏗️ System Design / Architecture

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          External Websites                              │
│                        (Embed Widget / Script)                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Frontend (React + Vite)                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │  Home   │ │  FAQ    │ │Community│ │  Admin  │ │  Embed  │          │
│  │  Page   │ │  Page   │ │  Page   │ │  Panel  │ │  Page   │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                                         │
│  Tech: React 18, TypeScript, Tailwind CSS, Framer Motion, Axios         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Backend (Node.js + Express)                    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        API Gateway                              │   │
│  │                   /csfaq/api/*                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│  │   Auth      │ │   FAQ       │ │  Community  │ │   Embed     │     │
│  │   Module    │ │   Module    │ │   Module    │ │   Module    │     │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │
│                                    │                                    │
│  Tech: Node.js, Express 4, Mongoose 8, JWT, bcryptjs, Zod             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Database (MongoDB Atlas)                       │
│                                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│  │   Users     │ │    FAQs     │ │   Batches   │ │  Categories │     │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │
│                                                                         │
│  Features: Vector Search, Text Search, Aggregation Pipelines           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
[User] → [Frontend] → [API Gateway] → [Controller] → [Service] → [Database]
                          │
                          ▼
                  [Embed Widget] → [External Site]
```

### Use-Case Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Yaksha FAQ Portal                              │
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│  │   User (Public) │    │   User (Auth)   │    │   Admin User    │    │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘    │
│         │                       │                       │              │
│         ▼                       ▼                       ▼              │
│  ┌─────────────┐          ┌─────────────┐         ┌─────────────┐    │
│  │  View FAQs  │          │  Post Q&A   │         │  Manage FAQs │    │
│  │  Search     │          │  Upvote     │         │  Audit FAQs  │    │
│  │  Browse     │          │  Comment    │         │  Manage Users│    │
│  │  Embed      │          │  Saved      │         │  AI Settings │    │
│  └─────────────┘          └─────────────┘         └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 💻 Implementation

### 5.1 Tech Stack & Justification

| Layer | Technology | Justification |
|-------|------------|---------------|
| **Frontend** | React 18 | Component-based architecture for scalable UI |
| | TypeScript | Type safety and better developer experience |
| | Tailwind CSS | Rapid UI development with utility classes |
| | Vite | Fast build and hot module replacement |
| **Backend** | Node.js + Express | Lightweight, fast, and scalable |
| | Mongoose 8 | ODM for MongoDB with schema validation |
| | JWT | Secure authentication and session management |
| | Zod | Runtime validation of API requests |
| **Database** | MongoDB Atlas | NoSQL with Vector Search for semantic search |
| **AI** | OpenAI/Anthropic | NLP for auto-answer and FAQ audit |
| **Embed** | Vanilla JS | Lightweight, no external dependencies |

### 5.2 Module/Feature Breakdown

#### Core Modules

| Module | Description | Key Files |
|--------|-------------|-----------|
| **Auth Module** | User registration, login, JWT-based sessions | `modules/auth/` |
| **FAQ Module** | CRUD operations for FAQs with approval workflow | `modules/faq/` |
| **Community Module** | Q&A board with voting and comments | `modules/community/` |
| **Embed Module** | Public API and widget for external embedding | `modules/embed/` ⭐ NEW |
| **Admin Module** | Dashboard for managing content and users | `modules/admin/` |
| **Search Module** | Hybrid vector + keyword search | `modules/search/` |
| **Zoom Module** | Zoom transcript ingestion and processing | `modules/zoom/` |
| **Program Module** | Batch and program management | `modules/program/` |

#### 🧩 New Embed Module (Feature Spotlight)

| Component | Description | Path |
|-----------|-------------|------|
| **Embed Controller** | Handles API requests for FAQ data | `modules/embed/embed.controller.ts` |
| **Embed Routes** | Public API endpoints for embedding | `modules/embed/embed.routes.ts` |
| **Embed Index** | Module exports | `modules/embed/index.ts` |
| **Widget Script** | JavaScript widget for external sites | `frontend/public/widget.js` |
| **Embed Page** | UI for generating embed code | `frontend/src/pages/EmbedPage.tsx` |

---

## ✨ Feature Spotlight

### 🧩 FAQ Embed Widget

#### Purpose & Impact

The FAQ Embed Widget allows external websites to display FAQs from the portal without any backend integration. This extends the reach of the knowledge base, reduces support tickets, and drives traffic back to the portal.

**Impact:**
- 📊 **Reduced Support Tickets** — Users find answers without contacting support
- 🌐 **Extended Reach** — Your FAQs appear on external websites
- ⏱️ **Self-Service** — Users get answers instantly
- 🎯 **SEO Benefits** — FAQs help external sites rank better
- 📈 **Content Distribution** — Your FAQs reach a wider audience

#### Real-World Usefulness

| Use Case | Example |
|----------|---------|
| **Product Websites** | Display FAQs directly on product pages |
| **Help Centers** | Embed FAQs in support documentation |
| **Blog Posts** | Add relevant FAQs to articles |
| **Landing Pages** | Answer common questions on landing pages |
| **Documentation** | Include interactive FAQ sections |

#### Technical Implementation

**1. Public API Endpoint**

```http
GET /csfaq/api/embed/faqs?limit=10&batchId=BATCH_ID
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "question": "How do I reset my password?",
      "answer": "Go to the login page and click 'Forgot Password'...",
      "tags": ["password", "account"],
      "createdAt": "2026-08-22T..."
    }
  ],
  "meta": {
    "count": 1,
    "limit": 10
  }
}
```

**2. Widget Script (`widget.js`)**

- ✅ Lightweight (~8KB)
- ✅ No external dependencies
- ✅ Auto-detects API URL
- ✅ Supports dark/light themes
- ✅ Responsive design

**3. Customization Options**

| Attribute | Description | Example |
|-----------|-------------|---------|
| `data-limit` | Number of FAQs to show | `data-limit="10"` |
| `data-title` | Custom widget title | `data-title="Help Center"` |
| `data-theme` | Light or dark mode | `data-theme="dark"` |
| `data-batch-id` | Filter by batch | `data-batch-id="BATCH_ID"` |
| `data-container` | Custom container ID | `data-container="my-faq"` |
| `data-show-tags` | Show/hide tags | `data-show-tags="false"` |
| `data-show-date` | Show/hide dates | `data-show-date="true"` |

**4. Embed Code**

```html
<script src="https://yourdomain.com/csfaq/widget.js" 
        data-limit="5" 
        data-title="FAQ" 
        data-theme="light">
</script>
```

#### Demo Screenshot

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FAQ Embed Widget Example                             │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ❓ Frequently Asked Questions                                  │   │
│  │                                                                 │   │
│  │  ▶ How do I reset my password?                                 │   │
│  │     [Answer expands when clicked]                              │   │
│  │                                                                 │   │
│  │  ▶ What is the Yaksha FAQ Portal?                              │   │
│  │     [Answer expands when clicked]                              │   │
│  │                                                                 │   │
│  │  ▶ How do I register a new account?                            │   │
│  │     [Answer expands when clicked]                              │   │
│  │                                                                 │   │
│  │  ────────────────────────────────────────────────────────────── │   │
│  │  Powered by Yaksha FAQ Portal                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Embed Code:                                                            │
│  <script src="https://yourdomain.com/csfaq/widget.js"></script>        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🚧 Challenges & Limitations

### Challenges Overcome

| Challenge | Solution |
|-----------|----------|
| **MongoDB Connection** | IP whitelisting and connection string optimization |
| **CORS Issues** | Configured CORS headers for public API endpoints |
| **Widget Security** | Rate limiting for public API |
| **Base URL Routing** | Properly configured `/csfaq/` base path |
| **Module Pattern** | Created Embed module following existing architecture |

### Current Limitations

| Limitation | Description | Future Enhancement |
|------------|-------------|-------------------|
| **Single Language** | Only supports English | Add multi-language support |
| **No Analytics** | No tracking of widget usage | Add analytics and insights |
| **Manual Sync** | FAQs updated manually | Auto-sync with database changes |
| **Fixed Theme** | Light/Dark only | Custom CSS support |

---

## 🔮 Future Enhancements

| Feature | Description | Priority | Timeline |
|---------|-------------|----------|----------|
| **Multi-Language Support** | Support multiple languages for FAQs | High | Phase 2 |
| **Widget Analytics** | Track impressions, clicks, and engagement | Medium | Phase 2 |
| **Auto-Sync** | Widget updates when FAQs change | High | Phase 2 |
| **Custom CSS** | Allow users to override styles | Medium | Phase 2 |
| **AI Chatbot** | Add conversational AI to widget | Low | Phase 3 |
| **Dark Mode Auto-Detect** | Auto-detect system theme | Low | Phase 2 |

---

## 👥 Team Information

| Name | Role | Email | Contributions |
|------|------|-------|---------------|
| Saniya Kousar | Developer | saniyakousar013@gmail.com | Full-stack development, FAQ Embed Widget, Product Documentation |

---

## 📁 Repository Structure

```
crowd-source-faq/
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── embed/           # 🧩 NEW: Embed module
│   │   │   │   │   ├── embed.controller.ts
│   │   │   │   │   ├── embed.routes.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── faq/
│   │   │   │   ├── auth/
│   │   │   │   └── ...
│   │   │   ├── bootstrap/
│   │   │   │   └── routes.ts        # 📝 MODIFIED
│   │   │   └── server.ts
│   │   └── package.json
│   └── frontend/
│       ├── src/
│       │   ├── pages/
│       │   │   └── EmbedPage.tsx    # 🧩 NEW
│       │   └── routes/
│       │       └── AppRoutes.tsx    # 📝 MODIFIED
│       └── public/
│           ├── widget.js            # 🧩 NEW
│           └── widget.html          # 🧩 NEW
├── docs/
├── PRODUCT.md                       # 📝 THIS FILE
└── README.md
```

---

## 📝 Summary of Changes

### Files Added (6)

| File | Purpose |
|------|---------|
| `apps/backend/src/modules/embed/embed.controller.ts` | API request handler |
| `apps/backend/src/modules/embed/embed.routes.ts` | Route definitions |
| `apps/backend/src/modules/embed/index.ts` | Module exports |
| `apps/frontend/src/pages/EmbedPage.tsx` | Embed page UI |
| `apps/frontend/public/widget.js` | Widget JavaScript |
| `apps/frontend/public/widget.html` | Widget demo page |

### Files Modified (2)

| File | Changes |
|------|---------|
| `apps/backend/src/bootstrap/routes.ts` | Added embed routes |
| `apps/frontend/src/routes/AppRoutes.tsx` | Added /embed route |

---

## 📄 License

MIT © 2026 vicharanashala
