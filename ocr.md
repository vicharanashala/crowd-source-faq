# Implementation Plan: OCR & Document-Based FAQ Generation

## Goal
To implement a robust, backend-driven pipeline for extracting text from images (via `tesseract.js`) and other documents (via a `markitdown` port) to generate "Document Insights". These insights will be held for review and promoted to official FAQs only when they are frequently searched by users.

## User Review Required

> [!IMPORTANT]
> **Dependencies & Packages**
> We will be adding `tesseract.js` for pure image OCR, and `markitdown-ts` (or `markitdown-js`) for broader document support (PDFs, DOCX, XLSX). Because this processing is intensive, it will run entirely on the Node.js backend to keep the frontend lightweight. Are you okay with the potential high memory usage on your backend server during active document processing, or should we implement a queue system (like BullMQ/Redis) to limit concurrent OCR tasks?

> [!CAUTION]
> **Promotion Logic**
> You mentioned "only be created as FAQ if its searched multiple times by AI assistant or Search". To achieve this, we will write a CRON job that compares `UnresolvedSearch` logs against the embeddings of our newly extracted `DocumentInsight`s. If a match exceeds a frequency threshold (e.g., 3 times), it auto-promotes to an FAQ. Does this match your vision for the promotion trigger?

## Proposed Changes

---

### Backend: Models

#### [NEW] [DocumentRecord.ts](file:///Users/yashhwanth/Documents/shamagama/backend/models/DocumentRecord.ts)
- Create a new Mongoose model to track uploaded documents.
- Fields: `userId`, `fileName`, `fileType` (image, pdf, docx), `status` (pending, extracting, ai_processing, completed, failed), `rawExtractedText`.

#### [NEW] [DocumentInsight.ts](file:///Users/yashhwanth/Documents/shamagama/backend/models/DocumentInsight.ts)
- Similar to `ZoomInsight`, but tailored for static documents.
- Fields: `documentId`, `type`, `question`, `answer_or_content`, `pageNumber`/`location`, `status` (default: `pending_review`), `searchMatchCount`.

---

### Backend: OCR & Extraction Services

#### [NEW] [documentExtractor.ts](file:///Users/yashhwanth/Documents/shamagama/backend/utils/documentExtractor.ts)
- Expose a unified function: `extractTextFromFile(buffer, mimeType)`.
- **Images (`image/png`, `image/jpeg`)**: Use `tesseract.js` to run OCR and extract text.
- **Documents (`application/pdf`, etc.)**: Use `markitdown-ts` to extract structural markdown text from the file.

#### [NEW] [documentAiPipeline.ts](file:///Users/yashhwanth/Documents/shamagama/backend/utils/ai/documentAiPipeline.ts)
- A dedicated AI prompt specifically for static files (different from the conversational Zoom prompt).
- Instructs the AI to identify factual statements, policies, or how-to steps and format them as Q&A pairs (Insights).

---

### Backend: API Routes & Controllers

#### [NEW] [documentController.ts](file:///Users/yashhwanth/Documents/shamagama/backend/controllers/documentController.ts)
- `POST /api/documents/upload`: Accepts `multipart/form-data`.
- Validates the file, creates a `DocumentRecord`, and offloads the extraction and AI processing asynchronously to prevent HTTP timeouts.

#### [MODIFY] [server.ts](file:///Users/yashhwanth/Documents/shamagama/backend/server.ts)
- Register the new `/api/documents` routes.

---

### Backend: Automated Promotion Job

#### [MODIFY] [faqAuditController.ts](file:///Users/yashhwanth/Documents/shamagama/backend/controllers/faqAuditController.ts) (or create new cron)
- Add a scheduled function `promotePopularDocumentInsights()`.
- Logic: Queries `UnresolvedSearch` logs. Groups them by semantic similarity. Queries `DocumentInsight` embeddings. If a pending document insight answers a high-frequency search query, automatically update its status to `approved` and create an official `FAQ`.

---

### Frontend: UI & Upload Flow

#### [MODIFY] [AccountPage.tsx](file:///Users/yashhwanth/Documents/shamagama/frontend/src/pages/AccountPage.tsx)
- Add a new "Upload Knowledge Document" section alongside the Zoom VTT upload.
- Support file types: `.png, .jpg, .pdf, .docx, .xlsx`.
- Add modern, glassmorphic UI elements and subtle upload progress animations following our modern web guidelines.

#### [NEW] [DocumentInsightsAdmin.tsx](file:///Users/yashhwanth/Documents/shamagama/frontend/src/pages/admin/DocumentInsightsAdmin.tsx)
- An admin view (similar to the Zoom Insights view) to manually review and promote document insights that haven't yet reached the auto-promote threshold.

## Verification Plan

### Automated Tests
- Run backend unit tests on `extractTextFromFile` using a sample image to verify `tesseract.js` output.
- Run tests using a sample PDF to verify `markitdown-ts` output.
- Mock the AI response to ensure `DocumentInsight` records are created properly.

### Manual Verification
1. Upload a PNG image containing text via the UI.
2. Verify the text is extracted in the backend logs.
3. Verify the AI splits the text into `DocumentInsight`s.
4. Perform 3 identical searches on the frontend that yield no results, triggering the `UnresolvedSearch` logger.
5. Trigger the cron job and verify the relevant `DocumentInsight` is converted to an `FAQ`.
