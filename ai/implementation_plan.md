# Implementation Plan - Team C AI & RAG Chatbot Integration
This plan details the implementation of Team C's AI capabilities, featuring Gemini integration, offline vector embeddings using `@xenova/transformers`, a Retrieval-Augmented Generation (RAG) chatbot, moderation tools, and unit tests with mock suites.
## User Review Required
> [!IMPORTANT]
> **Dependencies to Install**: We will install `@google/generative-ai` for Gemini API calls, `@xenova/transformers` (or `@huggingface/transformers` based on runtime compatibility) for offline 384-dimension embeddings, and `mongodb-memory-server` for isolated tests.
> **Database Vector Search Index**: The backend now standardizes on Gemini `text-embedding-004` vectors, so the MongoDB Vector Search index must use 768 dimensions on the `embedding` field.
> **Environment Configuration**: We require a `GEMINI_API_KEY` to be set in `backend/.env` for live operations.
---
## Proposed Changes
### Component 1: Dependencies and Environment Setup
#### [MODIFY] [package.json](file:///c:/Desktop/FAQ-VLED-main/backend/package.json)
- Add dependencies:
  - `@google/generative-ai` (Gemini SDK)
  - `@xenova/transformers` (Offline embeddings model)
  - `mongodb-memory-server` (Testing database isolation)
  - `jest` and `supertest` if not fully configured.
---
### Component 2: AI Services
#### [NEW] [geminiService.js](file:///c:/Desktop/FAQ-VLED-main/backend/services/geminiService.js)
- Instantiate Gemini client using `GEMINI_API_KEY`.
- Implement `generateAutoTagsAndCategory(title, body)`:
  - Call Gemini to recommend category and 3-5 tags.
  - Return JSON format.
- Implement `generateThreadSummary(answers)`:
  - Call Gemini to summarize the discussions into exactly 3 sentences.
- Implement `generateRAGResponse(query, contextQuestions)`:
  - Build prompt using retrieved context QA and query.
  - Call Gemini to construct the final response.
#### [NEW] [embeddingService.js](file:///c:/Desktop/FAQ-VLED-main/backend/services/embeddingService.js)
- Import `@xenova/transformers`.
- Initialize `all-MiniLM-L6-v2` pipeline for generating 384-dimension vector embeddings.
- Implement `generateOfflineEmbedding(text)` utility.
---
### Component 3: Database & Schemas
#### [MODIFY] [Question.js](file:///c:/Desktop/FAQ-VLED-main/backend/models/Question.js)
- Update validation of `embedding` field to support 768-dimension Gemini vectors.
- Add fields for moderation:
  - `isReported: { type: Boolean, default: false }`
  - `reportReason: { type: String, default: "" }`
  - `isHidden: { type: Boolean, default: false }`
#### [MODIFY] [Answer.js](file:///c:/Desktop/FAQ-VLED-main/backend/models/Answer.js)
- Add fields for moderation:
  - `isReported: { type: Boolean, default: false }`
  - `reportReason: { type: String, default: "" }`
  - `isHidden: { type: Boolean, default: false }`
#### [MODIFY] [User.js](file:///c:/Desktop/FAQ-VLED-main/backend/models/User.js)
- Add fields for moderation/account standing:
  - `isSuspended: { type: Boolean, default: false }`
---
### Component 4: Triage, Duplicates & Chatbot Controllers
#### [NEW] [chatbotController.js](file:///c:/Desktop/FAQ-VLED-main/backend/controllers/chatbotController.js)
- Implement RAG chatbot logic:
  - Generate 384-dimension embedding of query.
  - Perform MongoDB vector search on `questions` collection with candidate limit 3.
  - Compile questions/answers context.
  - Request summary/response from Gemini.
  - Return to client.
#### [NEW] [moderationController.js](file:///c:/Desktop/FAQ-VLED-main/backend/controllers/moderationController.js)
- Implement endpoints for moderators:
  - `getReportedContent`: Fetch flagged questions and answers.
  - `dismissReport`: Resolve reports without hiding content.
  - `hideContent`: Hide flagged questions or answers.
  - `suspendUser`: Mark user status as suspended.
---
### Component 5: Routes
#### [NEW] [chatbotRoutes.js](file:///c:/Desktop/FAQ-VLED-main/backend/routes/chatbotRoutes.js)
- Expose `POST /api/v1/chatbot/query` route.
#### [NEW] [moderationRoutes.js](file:///c:/Desktop/FAQ-VLED-main/backend/routes/moderationRoutes.js)
- Expose endpoints:
  - `GET /api/v1/moderation/reports`
  - `POST /api/v1/moderation/dismiss`
  - `POST /api/v1/moderation/hide`
  - `POST /api/v1/moderation/suspend`
#### [MODIFY] [server.js](file:///c:/Desktop/FAQ-VLED-main/backend/server.js)
- Import and mount chatbot and moderation routes.
---
### Component 6: Tests and Mocking
#### [NEW] [geminiMock.js](file:///c:/Desktop/FAQ-VLED-main/backend/tests/mocks/geminiMock.js)
- Provide mock responses for Gemini SDK to avoid API usage/costs in test environments.
#### [NEW] [chatbot.test.js](file:///c:/Desktop/FAQ-VLED-main/backend/tests/chatbot.test.js)
- Tests RAG query pipeline using offline mock setup.
#### [NEW] [moderation.test.js](file:///c:/Desktop/FAQ-VLED-main/backend/tests/moderation.test.js)
- Tests for content reporting, dismissing, hiding, and suspending accounts.
#### [NEW] [setupTests.js](file:///c:/Desktop/FAQ-VLED-main/backend/tests/setupTests.js)
- Setup `mongodb-memory-server` to run tests against an isolated, in-memory MongoDB environment.
---
## Verification Plan
### Automated Tests
- Run `npm run test` on the backend workspace to verify:
  - Auth registration/login flows.
  - Moderation content hiding/actions.
  - Chatbot querying flows using mock RAG responses.
### Manual Verification
- Test local connection to Gemini API by running a small debug runner.
- Validate local model load of `all-MiniLM-L6-v2` offline embedding generator.
- Check integration of `POST /api/v1/chatbot/query`.
