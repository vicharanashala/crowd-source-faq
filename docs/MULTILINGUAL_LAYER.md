# Person 3 — Multilingual Layer Documentation

**Feature Branch:** `dev/faq-portal-updates/voicefaq-multilingual`  
**Module Location:** `apps/backend/src/modules/ai/multilingual.service.ts`  
**Test Suite:** `apps/backend/src/modules/ai/__tests__/multilingual.service.test.ts`  

---

## 1. Overview

The **Multilingual Layer** enables non-English speaking users (e.g. Hindi, Spanish, Telugu, French, etc.) to query the Yaksha FAQ Portal seamlessly in their native language and receive translated responses, while leveraging the portal's existing English Knowledge Base and Atlas Vector Search index.

### Architecture Workflow

```
┌───────────────────────────────┐
│ User Query (e.g. Hindi/Span)  │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ 1. detectLanguage(text)       │  → Detects language code (e.g., 'hi', 'es'), confidence, isEnglish
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ 2. translateToEnglish(text)   │  → Converts non-English query to English
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ 3. RAG / Vector / Text Search │  → Queries English FAQs & Knowledge Base
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ 4. translateFromEnglish(ans)  │  → Translates English answer back into user's native language
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│ Output: { answer, lang, ... } │  → Returns translated response + source metadata
└───────────────────────────────┘
```

---

## 2. Key Modules & Specifications

### `multilingual.service.ts`

Location: [`apps/backend/src/modules/ai/multilingual.service.ts`](file:///c:/Users/ayush/OneDrive/Desktop/kshethragna/crowd-source-faq/apps/backend/src/modules/ai/multilingual.service.ts)

#### Core Functions

#### `detectLanguage(text: unknown): Promise<LanguageDetectionResult>`
Identifies the language of the provided text string using `AiClient`. Returns a structured object:
```ts
export interface LanguageDetectionResult {
  language: string;    // ISO code or language name (e.g. 'hi', 'es', 'en')
  isEnglish: boolean;  // true if language is English
  confidence: number; // confidence level between 0.0 and 1.0
}
```

#### `translateToEnglish(text: unknown, existingDetection?: LanguageDetectionResult): Promise<string>`
Translates non-English text into English using system prompt instructions on `AiClient`.
- Returns original text if text is empty, already in English, or if translation fails.
- Accepts an optional pre-detected `LanguageDetectionResult` to avoid redundant language detection calls.

#### `translateFromEnglish(text: unknown, targetLang: string): Promise<string>`
Translates English text into the target language specified by `targetLang`.
- Returns original text if `targetLang` is `'en'`/`'english'`, or if translation fails.

#### `processMultilingualQuery(text: unknown): Promise<MultilingualProcessResult>`
Main entry point for pipeline processing.
Standardized Output Format:
```ts
export interface MultilingualProcessResult {
  translatedText: string;  // English query string used for DB search
  detectedLanguage: string;// Detected language (e.g., 'hi', 'es')
  isEnglish: boolean;      // True if input query was English
}
```

---

## 3. Pipeline Integration

### 3.1 RAG Assistant (`rag.service.ts`)
Location: [`apps/backend/src/modules/ai/rag.service.ts`](file:///c:/Users/ayush/OneDrive/Desktop/kshethragna/crowd-source-faq/apps/backend/src/modules/ai/rag.service.ts)

1. Incoming question runs through `processMultilingualQuery(question)`.
2. Vector embeddings and source hits (FAQ, Community, Knowledge) are retrieved using `multi.translatedText`.
3. If input query was non-English (`!multi.isEnglish`), the synthesized English answer is translated back to the target language via `translateFromEnglish(answer, multi.detectedLanguage)`.
4. Returns `RagResult` containing `detectedLanguage` and `translatedText` metadata.

### 3.2 Hybrid Search Controller (`search.controller.ts`)
Location: [`apps/backend/src/modules/search/search.controller.ts`](file:///c:/Users/ayush/OneDrive/Desktop/kshethragna/crowd-source-faq/apps/backend/src/modules/search/search.controller.ts)

1. `semanticSearch` handles user search requests.
2. Query runs through `processMultilingualQuery(query)`.
3. Text search is executed against MongoDB text indices using `queryToSearch` (translated English text).
4. Fallback search attempts raw query text if no hits are found, ensuring complete coverage.

---

## 4. Resilience & Fallback Handling

To prevent pipeline failures due to external AI provider outages or network errors:
- All LLM calls inside `multilingual.service.ts` are wrapped in try-catch blocks.
- On failure (e.g. rate limit, network timeout, malformed LLM response), the service logs a warning and gracefully defaults to `language: 'en'` and original input text.
- Zero service interruptions or application crashes occur during AI provider downtime.

---

## 5. Testing & Verification

### Unit Test Suite
Location: [`apps/backend/src/modules/ai/__tests__/multilingual.service.test.ts`](file:///c:/Users/ayush/OneDrive/Desktop/kshethragna/crowd-source-faq/apps/backend/src/modules/ai/__tests__/multilingual.service.test.ts)

Run tests:
```bash
pnpm --filter=yaksha-faq-backend test:run src/modules/ai/__tests__/multilingual.service.test.ts
```

Test Cases Covered:
- Short/empty string handling.
- Language detection for Hindi, Spanish, English.
- Translation to English and from English.
- Pipeline integration output shape (`{ translatedText, detectedLanguage, isEnglish }`).
- Error fallback handling.

### TypeScript & Linter Verification
- `pnpm typecheck` — 0 errors across 5 workspace packages.
- `pnpm run lint` — 0 errors.
