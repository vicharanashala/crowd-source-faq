# Backend Testing Plan

This document lists the backend tests the team should add for CrowdFAQ.

Automated test files should be created in:

```text
backend/tests/
```

This folder is documentation only; do not place runnable Jest files here unless the test script is changed to include this folder.

## Test Command

From the repository root:

```powershell
npm.cmd run test --workspace backend
```

## Existing Backend Test

Current test file:

```text
backend/tests/triage.test.js
```

Current coverage:

```text
GET /api/v1/search with a query
GET /api/v1/search without q
```

## Required Backend Test Files

Create these files:

```text
backend/tests/health.test.js
backend/tests/auth.test.js
backend/tests/user.test.js
backend/tests/question.test.js
backend/tests/answer.test.js
backend/tests/search.test.js
backend/tests/admin.test.js
```

## Shared Test Approach

Use:

```text
Jest
Supertest
Mocked MongoDB model methods for controller/route tests
Mocked OpenAI service for AI/search tests
```

Avoid:

```text
Real OpenAI requests
Real MongoDB Atlas dependency
Tests that depend on local machine state
```

## Health Tests

Owner:

```text
Admin/QA member
```

File:

```text
backend/tests/health.test.js
```

Test cases:

```text
GET / returns 200 and API welcome message
GET /api/v1/health returns 200
GET /api/v1/health includes service, status, and database fields
Unknown route returns 404
```

## Auth Tests

Owner:

```text
Auth/User member
```

File:

```text
backend/tests/auth.test.js
```

Endpoints:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

Test cases:

```text
Register succeeds with displayName, email, password
Register stores passwordHash, not plain password
Register rejects missing displayName
Register rejects missing email
Register rejects invalid email
Register handles duplicate email safely
Login succeeds with correct credentials
Login rejects wrong password
Login rejects unknown email
Logout clears token cookie
GET /me returns current user when authenticated
GET /me returns 401 when not authenticated
Response never includes passwordHash
```

## User Tests

Owner:

```text
Auth/User member
```

File:

```text
backend/tests/user.test.js
```

Endpoints:

```text
PATCH /api/v1/users/me
GET   /api/v1/users/:id
GET   /api/v1/users/:id/questions
GET   /api/v1/users/:id/answers
```

Test cases:

```text
Update profile succeeds for authenticated user
Update profile rejects unauthenticated user
Public profile returns safe fields only
Public profile returns 404 for missing user
User questions endpoint returns only that user's questions
User answers endpoint returns only that user's answers
```

## Question Tests

Owner:

```text
Questions member
```

File:

```text
backend/tests/question.test.js
```

Endpoints:

```text
GET    /api/v1/questions
POST   /api/v1/questions
GET    /api/v1/questions/:id
PATCH  /api/v1/questions/:id
DELETE /api/v1/questions/:id
```

Test cases:

```text
Create question succeeds for authenticated user
Create question rejects missing title
Create question rejects missing body
Create question normalizes tags
Create question hides embedding in response
List questions returns pagination metadata
List questions supports tag filter
List questions supports status filter
List questions supports sort options
List questions includes answerCount
Get question by id returns populated author
Get question by id returns answers when available
Get question by invalid id returns 400
Get missing question returns 404
Update question succeeds for author
Update question rejects non-author unless admin/moderator
Delete question soft-closes by setting status to closed
Delete question rejects non-author unless admin/moderator
```

## Answer Tests

Owner:

```text
Answers member
```

File:

```text
backend/tests/answer.test.js
```

Endpoints:

```text
POST   /api/v1/answers
PATCH  /api/v1/answers/:id
DELETE /api/v1/answers/:id
POST   /api/v1/answers/:id/vote
PATCH  /api/v1/answers/:id/accept
POST   /api/v1/answers/official/create
```

Test cases:

```text
Create answer succeeds for authenticated user
Create answer rejects missing questionId
Create answer rejects missing body
Create answer rejects invalid questionId
Create answer returns 404 when question does not exist
Create answer changes pending question to answered
Edit answer succeeds for answer author
Edit answer rejects non-author unless admin/moderator
Delete answer succeeds for author/admin/moderator
Vote answer accepts only up or down
Vote answer rejects invalid vote type
Vote answer increments upvoteCount for up
Vote answer increments downvoteCount for down
Accept answer sets isAccepted true
Accept answer unsets other accepted answers for same question
Accept answer updates question status to resolved
Official answer requires admin/moderator
Official answer sets isOfficial true
Official answer sets isAccepted true
Official answer emits realtime event when io exists
```

## Search And AI Tests

Owner:

```text
Search/AI member
```

Files:

```text
backend/tests/search.test.js
backend/tests/ai.test.js
```

Endpoints:

```text
GET  /api/v1/search?q=...
GET  /api/v1/search/similar?q=...
POST /api/v1/search/triage
POST /api/v1/ai/draft-answer
POST /api/v1/ai/reindex
```

Test cases:

```text
Search rejects missing q
Search returns allow_post when no match exists
Search returns gentle_suggest for medium match
Search returns soft_intercept for strong match
Search returns hard_intercept for duplicate-level match
Search falls back when OpenAI embedding fails
Search escapes regex input in text fallback
Similar questions returns ranked matches
AI draft answer rejects missing title/body
AI draft answer returns generated text when OpenAI succeeds
AI endpoints return safe fallback when OpenAI key is missing
Reindex endpoint updates embeddings for existing questions
```

Mock:

```text
backend/services/openaiService.js
```

Do not call the real OpenAI API in tests.

## Admin Tests

Owner:

```text
Admin/QA member
```

File:

```text
backend/tests/admin.test.js
```

Endpoints:

```text
GET    /api/v1/admin/stats
GET    /api/v1/admin/users
PATCH  /api/v1/admin/users/:id/role
GET    /api/v1/admin/questions
PATCH  /api/v1/admin/questions/:id/status
DELETE /api/v1/admin/questions/:id
GET    /api/v1/admin/answers
PATCH  /api/v1/admin/answers/:id/official
DELETE /api/v1/admin/answers/:id
```

Test cases:

```text
Admin routes reject unauthenticated requests
Admin routes reject normal student users
Admin routes allow admin users
Stats endpoint returns counts
List users returns users without passwordHash
Update user role validates allowed roles
List admin questions supports filters
Update question status validates allowed status
Delete question closes/removes according to project rule
List admin answers returns answers
Mark answer official sets isOfficial true
Delete answer works for admin
```

## Socket/Realtme Tests

Owner:

```text
Admin/QA member
```

Potential file:

```text
backend/tests/socket.test.js
```

Test cases:

```text
Socket connects successfully
join_question joins the expected room
new_answer event is emitted after answer creation
answer_accepted event is emitted after accepting an answer
official_answer_created event is emitted after official answer creation
question_status_updated event is emitted after admin status change
```

## Test Data Rules

Use helper data shaped like:

```text
User: displayName, email, passwordHash, role
Question: title, body, author, tags, status
Answer: question, author, body, isAccepted, isOfficial
```

Never include real secrets or real user data in tests.

## Pull Request Checklist

Before merging backend work:

```text
Tests added or updated
npm.cmd run test --workspace backend passes
No real OpenAI calls in tests
No dependency on local MongoDB unless intentionally integration-tested
No passwordHash returned in API responses
Protected routes tested for unauthenticated access
Admin routes tested for role restrictions
```

