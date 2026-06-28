# CrowdFAQ Testing Guide

This folder contains testing documentation and test plans for the CrowdFAQ project.

Actual automated backend tests currently live in:

```text
backend/tests/
```

The `testing/` folder is used for team-facing testing plans, checklists, and manual QA notes.

## Current Testing Stack

Backend:

```text
Jest
Supertest
Mongoose mocks where needed
OpenAI service mocks where needed
```

Frontend:

```text
Jest
React Testing Library
```

## Run Backend Tests

From the repository root:

```powershell
npm.cmd run test --workspace backend
```

Or from the backend folder:

```powershell
cd backend
npm.cmd test
```

## Backend Testing Documents

Detailed backend testing plan:

```text
testing/backend/README.md
```

## Backend Test File Location

Backend test files should be added here:

```text
backend/tests/
```

Recommended files:

```text
backend/tests/auth.test.js
backend/tests/user.test.js
backend/tests/question.test.js
backend/tests/answer.test.js
backend/tests/search.test.js
backend/tests/admin.test.js
backend/tests/health.test.js
```

## Testing Rules

- Do not hit real OpenAI in tests.
- Do not depend on MongoDB Atlas in unit tests.
- Mock external services.
- Test success cases and failure cases.
- Keep tests close to the backend behavior, not frontend UI behavior.
- Run tests before pushing a backend branch.

