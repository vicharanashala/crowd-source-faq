# 🎓 Samagama FAQ Intelligence Engine

A production-ready, fully animated React frontend for an AI-powered FAQ system — built for IIT Ropar's Samagama internship platform hackathon project.

---

## 📁 Project Structure

```
samagama/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.jsx              # React entry point
    ├── App.jsx               # Router + global state
    ├── index.css             # Tailwind + global styles
    ├── data/
    │   └── faqData.js        # All FAQ content + utility functions
    ├── hooks/
    │   └── useFAQState.js    # Vote/progress/click state with localStorage
    └── components/
        ├── Navbar.jsx        # Top nav with search trigger
        ├── SearchModal.jsx   # Full-screen search with intent detection
        ├── FAQCard.jsx       # Expandable FAQ with votes + related Q's
        ├── FAQPage.jsx       # Sidebar layout + main FAQ view
        ├── HomePage.jsx      # Landing page with section cards
        ├── AdminPage.jsx     # Confusion heatmap + admin tools
        ├── BubbleChart.jsx   # SVG doubt cluster map
        ├── TrendingPanel.jsx # 7-day trending questions
        └── ProgressBar.jsx   # Student section progress tracker
```

---

## ⚙️ Setup Instructions

### Prerequisites
- Node.js 18+ installed  
- npm or yarn

### Step 1 — Install dependencies

```bash
cd samagama
npm install
```

### Step 2 — Run the dev server

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### Step 3 — Build for production

```bash
npm run build
npm run preview
```

---

## 🧩 Features Implemented

### Student Side
| Feature | Description |
|---|---|
| **Priority Heatmap** | Red/Orange/Yellow/Green urgency system with auto-sort. Critical items float to top automatically. |
| **Smart Similar Questions** | "You may also need" panel with 3–4 semantically related questions per FAQ |
| **Live Search** | Real-time search (⌘K) with intent detection (when/who/how/what) and recent history |
| **Feedback + Vote Tracker** | 👍/👎 on every FAQ. Thumbs-down auto-escalates urgency score |
| **Trending This Week** | 7-day window showing top 5 most-viewed questions |
| **Section Progress Tracker** | "You've read X of 14 sections" strip stored in localStorage |
| **Doubt Cluster Map** | SVG bubble chart — bubble size = question volume, color = urgency |
| **Sidebar Layout** | Click a section → smooth sidebar transition with expand/collapse |

### Admin Side
| Feature | Description |
|---|---|
| **Confusion Heatmap** | Score per section showing where students are most confused |
| **Urgency Override** | Pin a critical message/banner to the top of the portal instantly |
| **Self-Healing Suggestions** | Flags questions with many thumbs-downs for rewriting |
| **Panic Mode Detector** | Detects search spikes (e.g. NOC 20→250) and promotes those FAQs |
| **Unresolved Cluster View** | Shows searches with no matching FAQ, suggests creating them |

---

## 🎨 Design System

- **Font**: Space Grotesk (display) + Inter (body)
- **Base color**: `#0d1117` (GitHub-dark tone)
- **Accent**: Brand blue `#3b6ef8`
- **Urgency palette**: Red → Orange → Yellow → Green
- **Motion**: Slide-in, fade-up, scale-in keyframe animations via Tailwind

---

## 🔗 Routes

| Path | Page |
|---|---|
| `/` | Homepage with section grid |
| `/faq` | FAQ browser with sidebar |
| `/faq?section=noc` | Jump directly to a section |
| `/faq?section=noc&q=noc-1` | Jump to specific question |
| `/admin` | Admin dashboard |
