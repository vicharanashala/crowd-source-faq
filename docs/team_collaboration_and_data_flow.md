# Team Collaboration & Data Flow Guide (Simple English)

This guide explains how our **11-member team** is divided into sub-teams and how we share information (inputs and outputs) to build the CrowdFAQ platform.

---

## 1. Team Responsibilities

Think of building CrowdFAQ like building a house:
* 🎨 **Team A (Frontend)** builds the **rooms, paint, and doors** (what the user sees on their screen).
* 🔧 **Team B (Backend & DB)** builds the **pipes, wires, and storage** under the floors (saving users, questions, and answers to the database).
* 🧠 **Team C (AI & QA)** builds the **smart assistant** (the AI brain that reads questions) and inspects the building to make sure nothing breaks.

---

## 2. Information Exchanged Between Teams

### 2.1 Team A (Frontend) ◄──► Team B (Backend)
This exchange connects the website screen with the database.

* **What Frontend sends to Backend (Backend's Input)**:
  * Information the user types (like email & password to log in, a new question title, or an answer).
  * The user's security key (JWT token) to prove they are logged in.
* **What Backend sends to Frontend (Frontend's Input)**:
  * Saved posts to show on screen (like lists of questions, user profiles, points, and badges).
  * Status updates (like "Success" or "Wrong password error").

### 2.2 Team B (Backend) ◄──► Team C (AI & QA)
This exchange connects the server logic with the smart AI tools.

* **What Backend sends to AI (AI's Input)**:
  * The text of new questions (to see if they are duplicates) and lists of answers (to summarize).
* **What AI sends to Backend (Backend's Input)**:
  * Duplicate alerts (like: *"This question is 90% identical to an old one"*).
  * Text summaries of answers.
  * Recommended tags (like: `Admissions`, `Scholarships`).

### 2.3 Team A (Frontend) ◄──► Team C (AI & QA)
This exchange connects the user's direct screen actions with the AI.

* **What Frontend sends to AI (AI's Input)**:
  * Chat messages typed into the AI Chatbot window.
  * Live text typed in the "Ask Question" box.
* **What AI sends to Frontend (Frontend's Input)**:
  * The chatbot's reply.
  * Warning alerts to show on screen (like *"Show warning modal: duplicate question found"*).
  * Suggested tags to click on.

