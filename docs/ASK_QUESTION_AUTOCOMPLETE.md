# Ask Question Autocomplete / Rewrite Feature

## Overview

The Ask a Question modal now includes an AI-assisted rewrite suggestion for the question field.

When a user types a rough or incomplete question, the app waits briefly, sends the text to the backend, and shows one improved version of the question. The user can choose whether to apply it by clicking **Use this rewrite**.

Example:

```text
Input:
completed intership what to do tell

Suggested rewrite:
I have completed my internship. What should I do next?
```

The rewrite is designed to:

- keep the same meaning
- avoid adding fake details
- fix spelling, grammar, and clarity
- convert fragments into a proper question
- stay concise
- keep first-person wording when the user is describing their own issue

## User Flow

1. User opens **Ask a Question** in the Community page.
2. The question field is shown as a textarea with the placeholder:

   ```text
   Ask your question here...
   ```

3. When the user types at least 12 characters, the frontend waits 600ms.
4. The frontend calls the backend rewrite endpoint.
5. If a useful rewrite is returned, a suggestion panel appears below the question field.
6. User clicks **Use this rewrite** to replace their typed question.
7. The existing duplicate-checking and post submission flow continues as before.

## Files Changed

### Frontend

File:

```text
apps/frontend/src/components/community/CreatePostDialog.tsx
```

Changes made:

- Changed the question/title field from a single-line input to a textarea.
- Updated the label from `Title` to `Question`.
- Updated the placeholder to:

  ```text
  Ask your question here...
  ```

- Added rewrite suggestion state:
  - `rewriteSuggestion`
  - `checkingRewrite`
  - `rewriteError`
  - `rewriteTimerRef`
  - `rewriteRequestIdRef`
  - `acceptedRewriteRef`

- Added a 600ms debounce after the user types.
- Calls:

  ```text
  POST /ask-ai/rewrite-question
  ```

- Prevents stale responses from replacing newer input.
- Displays a suggestion panel below the question field.
- Adds the **Use this rewrite** button.
- Keeps existing session draft saving behavior.
- Keeps existing duplicate-check behavior intact.

### Backend Route

File:

```text
apps/backend/src/modules/ai/ask-ai.routes.ts
```

Changes made:

- Imported `rewriteQuestionController`.
- Added a protected rewrite route:

  ```text
  POST /csfaq/api/ask-ai/rewrite-question
  ```

- Added rate limiting:

  ```text
  20 rewrite requests per minute per IP
  ```

The route requires authentication because asking a community question already requires a logged-in user.

### Backend Controller

File:

```text
apps/backend/src/modules/knowledge/knowledge.controller.ts
```

Changes made:

- Imported the existing `AiClient`.
- Added helper functions:
  - `normalizeRewriteText`
  - `isMeaningfullyDifferent`
  - `isRewriteTooExpansive`

- Added `rewriteQuestionController`.

The controller:

- validates the input length
- rejects inputs shorter than 12 characters
- rejects inputs longer than 300 characters
- calls the existing AI provider system
- asks for exactly one rewritten question
- strips markdown, labels, quotes, and extra whitespace from the AI output
- rejects suggestions that are too short, identical, or too expansive
- returns:

  ```json
  {
    "suggestion": "I have completed my internship. What should I do next?"
  }
  ```

If the AI provider fails, the endpoint returns:

```json
{
  "message": "Question rewrite is temporarily unavailable."
}
```

### AI Provider Fixes

File:

```text
apps/backend/src/modules/ai/ai-client.service.ts
```

Changes made:

- Added support for `GEMINI_API_KEY` in the AI client constructor.
- Added support for `CUSTOM_API_KEY`.
- Updated the missing-key warning message to include Gemini and custom providers.
- Updated provider detection so Gemini from `.env` is recognized correctly.

File:

```text
apps/backend/src/utils/ai/aiProvider.ts
```

Changes made:

- Updated provider priority documentation.
- Added Gemini and custom provider checks to the pipeline provider fallback.

## Backend Endpoint

### Request

```http
POST /csfaq/api/ask-ai/rewrite-question
Content-Type: application/json
Authorization: Bearer <token>
```

Body:

```json
{
  "question": "zoom link not received"
}
```

### Success Response

```json
{
  "suggestion": "I have not received the Zoom link. Where can I access it?"
}
```

### Empty Suggestion Response

Returned when the AI output is not useful enough to show.

```json
{
  "suggestion": ""
}
```

### Validation Error

```json
{
  "message": "Question must be at least 12 characters"
}
```

## Prompt Behavior

The rewrite prompt asks the AI to:

- rewrite rough student questions for a community Q&A form
- preserve the exact meaning and perspective
- prefer first-person wording for personal issues
- avoid making the question more general than the input
- avoid adding facts or assumptions
- return plain text only

Good output:

```text
Input:
i didnt get certificate

Output:
I did not receive my certificate. What should I do?
```

Bad output:

```text
I completed the internship orientation and paid the fee, but I did not receive my certificate by email. What should I do?
```

That bad output invents details and should not be shown.

## Environment Setup

This feature uses the existing AI provider configuration.

At least one AI provider must be configured either in `.env` or in Admin AI Settings.

Example Gemini setup:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
```

The base URL can also be left empty because the backend has a Gemini default.

If Admin AI Settings are configured in the database, they may override `.env`.

## Running Locally

Start the backend:

```powershell
cd apps/backend
pnpm dev
```

Start the frontend in another terminal:

```powershell
cd apps/frontend
pnpm dev
```

Open the Vite URL shown in the frontend terminal, usually:

```text
http://localhost:5173
```

Then:

1. Go to the Community page.
2. Click **Ask a Question**.
3. Type 12+ characters in the question field.
4. Wait around 600ms.
5. Confirm that the suggestion panel appears.

## Verification Performed

Backend typecheck:

```powershell
node node_modules\typescript\bin\tsc -p apps\backend\tsconfig.json --noEmit
```

Frontend typecheck:

```powershell
node node_modules\typescript\bin\tsc -p apps\frontend\tsconfig.json --noEmit
```

Both checks passed after implementation.


The current implementation intentionally keeps the feature focused on the main question field because that field affects search quality, duplicate detection, and community post clarity.
