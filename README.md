# CSFAQ – Samagama Internship Support Portal

CSFAQ is a full-stack web application developed for the Phase-1 Project of Samagama Vicharanashala Internship Program. It provides interns with a centralized platform to:

- 📖 Browse Frequently Asked Questions
- 💬 Participate in Discussion Forums
- 🚨 Raise Escalation Requests
- 🛠️ Manage FAQs through an Admin Portal
- 🎙️ Interact with an AI-powered Voice Agent

To get a brief about features of separate components checkout Documents Folder.
For overall understanding of application checkout Product.md .
---

# Tech Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS

### Backend
- Node.js
- Express.js
- TypeScript
- MongoDB
- Mongoose

### AI / Voice Agent
- Web Speech API
- Official Samagama FAQ Knowledge Base

---

# Prerequisites

Install the following before running the project:

- Node.js (v18 or later recommended)
- npm
- MongoDB Community Edition **or** MongoDB Atlas
- Git

---

# Clone the Repository

```bash
git clone <repository-url>
cd CSFAQ
```

---

# Install Dependencies

## Backend

```bash
cd backend
npm install
```

## Frontend

Open a second terminal.

```bash
cd frontend
npm install
```

---

# Configure Environment Variables

Create a file named

```
backend/.env
```

Example:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/csfaq
```

If using MongoDB Atlas:

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/csfaq
```

---

# Seed the FAQ Database (First Time Only)

The application stores FAQs in MongoDB.

Populate the database by running:

```bash
cd backend

npm run seed:faq
```

This command:

- Deletes existing FAQ records
- Inserts the official Samagama FAQ dataset into MongoDB

> **Note:** You only need to seed the database once. Run it again only if the FAQ dataset changes.

---

# Start the Backend

```bash
cd backend

npm run dev
```

Backend runs on:

```
http://localhost:5000
```

---

# Start the Frontend

Open another terminal.

```bash
cd frontend

npm run dev
```

Frontend runs on:

```
http://localhost:5173
```

---

# Using the Application

Visit

```
http://localhost:5173
```

The application includes:

- FAQ Portal
- Discussion Forum
- Escalation Portal
- Admin Portal
- Voice Agent

---

Demo of the project 

https://drive.google.com/file/d/1G_-rrC20eJufKDOH1oPJHgfTGOmu_5za/view

---
# Project Structure

```
CSFAQ/
│
├── frontend/                  # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── styles/
│   │   └── assets/
│   ├── public/
│   └── package.json
│
├── backend/                   # Express + MongoDB backend
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── seeds/
│   │   └── server.ts
│   ├── .env
│   └── package.json
│
├── Voice agent/               # Voice Agent resources
│   └── FAQS/
│       ├── data/              # Official Samagama FAQ dataset
│       ├── app.js             # Voice recognition & response logic
│       ├── index.html         # Voice Agent interface
│       ├── styles.css
│       └── package.json
│
├── README.md
└── .gitignore
```
---

## Modules

- **FAQ Portal** – Browse and search official Samagama FAQs.
- **Discussion Forum** – Community discussion platform for interns.
- **Escalation Portal** – Raise and track support requests.
- **Admin Portal** – Manage FAQs and portal content.
- **Voice Agent** – Voice-enabled interface powered by the official Samagama FAQ knowledge base. The Voice Agent is integrated into the main application and can be accessed directly from the frontend.

---

# Available Scripts

## Backend (`backend/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Starts the Express backend in development mode using Nodemon. |
| `npm run build` | Compiles the TypeScript backend into the `dist` folder. |
| `npm run start` | Runs the compiled backend. |
| `npm run seed:faq` | Seeds MongoDB with the official Samagama FAQ dataset. |
| `npm run lint` | Runs ESLint on the backend source code. |

---

## Frontend (`frontend/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Starts the React + Vite development server. |
| `npm run build` | Compiles TypeScript and creates a production build. |
| `npm run preview` | Serves the production build locally. |
| `npm run lint` | Runs ESLint on the frontend source code. |

---

## Team Contributors

# Team Contributions

| Area / Module | Contributor(s) |
|----------------|----------------|
| FAQ Portal (Frontend) | **Vaishnav Gopale** |
| FAQ Voice Agent (Frontend) | **Kanika** |
| Discussion Forum (Frontend + Backend) | **Arni** |
| Escalation Portal (Frontend) | **Rushikesh Barge** |
| Admin Dashboard (Frontend) |**Tathagata Banerjee** **Rushikesh Barge** |
| Backend Development (APIs, Database & Server) | **Tathagata Banerjee** |
| Project Documentation & README | **Arni** |

---
## Developed For

Vicharanashala Internship (VINS)
Indian Institute of Technology (IIT) Ropar
