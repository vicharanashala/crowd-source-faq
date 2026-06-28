# Developer Onboarding & Documentation Guidelines (MERN)

This folder contains coding standards, onboarding configurations, environment variables lists, and JSDoc rules for the CrowdFAQ project.

For a simple explanation of team collaboration and data flow between sub-teams, see the [Team Collaboration & Data Flow Guide](file:///c:/Users/kkp18/OneDrive/Pictures/Documents/IIT/CrowdFAQ/docs/team_collaboration_and_data_flow.md).
For the current moderation backend surface, see [Admin API Notes](file:///c:/Users/kkp18/OneDrive/Pictures/Documents/IIT/CrowdFAQ/docs/admin_api.md).

---

## 1. Onboarding Guide for Developers

To run the MERN stack application locally:

### 1.1 Pre-requisites
* **Node.js** (v16.0 or higher) & **npm** (v8.0 or higher)
* **MongoDB** (Local Community Edition or a MongoDB Atlas cloud cluster)

### 1.2 Step-by-Step Setup
1. **Clone the project repository**:
   ```bash
   git clone <repo-url>
   cd CrowdFAQ
   ```
2. **Setup the Backend**:
   * Refer to the [Backend Blueprint](file:///c:/Users/kkp18/OneDrive/Pictures/Documents/IIT/CrowdFAQ/backend/README.md) to install packages and configure the `.env` variables.
   * Run the seed script to populate roles, categories, and badges:
     ```bash
     cd backend
     node database/seed.js
     ```
3. **Setup the Frontend**:
   * Refer to the [Frontend Blueprint](file:///c:/Users/kkp18/OneDrive/Pictures/Documents/IIT/CrowdFAQ/frontend/README.md) to launch the React development server.

---

## 2. Coding Style & Conventions

To keep the JavaScript and JSX codebase readable and consistent:

### 2.1 Code Formatting
* **Linting & Formatting**: ESLint (AirBnb config recommended) + Prettier.
* **Nomenclature**:
  * Use **camelCase** for variables and function names (e.g., `checkDuplicates`).
  * Use **PascalCase** for React components (e.g., `LeaderboardTable.jsx`).
  * Use **UPPERCASE_SNAKE** for global constants (e.g., `ACCESS_TOKEN_EXPIRY`).

### 2.2 Docstrings & Comments
Document all controllers and middleware functions using **JSDoc format**:

```javascript
/**
 * Triggers duplicate detection for questions based on titles.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {Promise<Object>} JSON array of matching duplicate questions.
 */
const checkDuplicates = async (req, res) => {
    // Controller implementation...
};
```

---

## 3. Deployment Configuration Reference

For production release pipelines:

* **Frontend**: Deploy to **Vercel** or Netlify. Add a redirection rule in `public/_redirects` to route all traffic to `index.html` for single-page routing:
  ```txt
  /*    /index.html   200
  ```
* **Backend**: Deploy to **Render** or AWS App Runner. Ensure the database connection URL is configured as a secret environment variable (`MONGO_URI`).
* **Database**: Set up a serverless MongoDB cluster on **MongoDB Atlas**, enabling the required vector search index on the `questions` collection.
