# Database Schema

The database layer runs on MongoDB, using **Mongoose** for schema definitions, validation, and middleware hook execution. 

---

## Database Indexing Strategy
To ensure high-performance queries at scale, the database employs several indexing strategies:
- **Scoping Indexes**: Queries are filtered by `batchId` to support program multi-tenancy. Most collections have compound indexes starting with `batchId` (e.g., `{ batchId: 1, createdAt: -1 }`).
- **Text Search Indexes**: Text indexes are built on text fields (`question`, `title`, `body`, `answer`) to support keyword fallback searches.
- **Vector Indexes**: Atlas vector search indexes are defined on `embedding` fields (cosine similarity) to support semantic matching.

---

## Core Collections Map

Here is the mapping of Mongoose models to MongoDB collections:

### 1. `yaksha_faq_users` (User)
Stores student and staff user profiles:
- **Key Fields**: `name`, `email`, `password` (hashed), `role` (`student` | `admin` | `superadmin`), `points` (global SP balance), `tier`, `positiveBadges`, `negativeBadges`.
- **Indexes**: Unique index on `email`.

### 2. `yaksha_faq_batches` (Batch)
Defines individual cohort programs:
- **Key Fields**: `name`, `startDate`, `endDate`, `status` (`draft` | `active` | `archived` | `completed`), `enrollmentMode` (`open` | `invite_only` | `closed`), `maxEnrollment` (optional).
- **Indexes**: Index on `status`, unique index on `name`.

### 3. `yaksha_faq_faqs` (FAQ)
Canonical frequently asked questions:
- **Key Fields**: `question`, `answer`, `category` (ObjectId ref Category), `embedding` (array of numbers), `trustLevel` (`high` | `expert` | `medium`), `helpfulVotes`, `batchId` (ObjectId ref Batch).
- **Indexes**: Compound index `{ batchId: 1, category: 1 }`, vector search index on `embedding`.

### 4. `yaksha_faq_categories` (Category)
Groups for FAQs:
- **Key Fields**: `name`, `icon`, `visibility` (boolean), `batchId` (ObjectId ref Batch).
- **Indexes**: Compound index `{ batchId: 1, name: 1 }`.

### 5. `yaksha_faq_communityposts` (CommunityPost)
Student-driven forum threads and comments:
- **Key Fields**: `title`, `body`, `tags`, `author` (ObjectId ref User), `status` (`answered` | `unanswered`), `comments` (array of subdocuments containing replies, authors, verified flags), `aiAnswer` (suggested AI answer metadata), `reports` (array of flags).
- **Indexes**: Compound index `{ batchId: 1, status: 1 }`, text index on `{ title: "text", body: "text" }`.

### 6. `yaksha_faq_session_support` (SupportRequest)
Technical troubleshooting ticket dashboard:
- **Key Fields**: `userId`, `userName`, `issueType` (`internet` | `camera` | `microphone` | `device` | `power` | `other`), `title`, `details`, `status` (`Pending` | `In Review` | `Resolved` | `Rejected`), `isGolden` (boolean), `spCost` (points paid for high priority), `followUps` (message thread), `batchId` (ObjectId ref Batch).
- **Indexes**: Compound index `{ isGolden: 1, status: 1, spCost: -1, createdAt: 1 }` (used to order the admin ticket inbox).

---

## Configuration and Integration Collections

### 7. `yaksha_program_configs` (ProgramConfig)
Encrypted integration tokens and application credentials for external services:
- **Key Fields**: `batchId`, `discord` (`enabled`, `botToken` [encrypted], `applicationId`, `guildId`), `zoom` (`clientId`, `clientSecret` [encrypted], `webhookSecretToken` [encrypted]).
- **Indexes**: Unique index on `batchId`.

### 8. `yaksha_program_settings` (ProgramSettings)
Program-level dynamic parameters and toggles:
- **Key Fields**: `batchId`, `checklists` (custom steps for support requests), `welcomeMessage`.
- **Indexes**: Unique index on `batchId`.

### 9. `yaksha_program_reputation` (ProgramReputation)
Cohort-specific point balances:
- **Key Fields**: `userId`, `batchId`, `points`, `acceptedAnswers`.
- **Indexes**: Compound unique index `{ userId: 1, batchId: 1 }`.

---

## Log and Ingestion Collections

### 10. `yaksha_faq_zoom_transcript_chunks` (ZoomTranscriptChunk)
Ingested transcript segments from Zoom cloud records:
- **Key Fields**: `zoomSessionId`, `meetingId`, `speaker`, `text`, `startTime`, `endTime`, `embedding` (for knowledge searches), `batchId`.
- **Indexes**: Vector search index on `embedding`.

### 11. `yaksha_faq_zoom_sessions` (ZoomSession)
Configurations and schedule tracking for Zoom integrations:
- **Key Fields**: `batchId`, `meetingIds` (array), `dailyResetTime`.
- **Indexes**: Unique index on `batchId`.

### 12. `yaksha_faq_feature_flags` (FeatureFlag)
Feature toggles for experimental UI blocks:
- **Key Fields**: `key`, `enabled`, `batchId` (null for global default, ObjectId for override).
- **Indexes**: Compound unique index `{ key: 1, batchId: 1 }`.

### 13. `yaksha_faq_searchlogs` (SearchLog)
Analytics logs for search queries:
- **Key Fields**: `query`, `resultsCount`, `topResultId`, `topResultSource` (`faq` | `community`), `userId`, `batchId`, `createdAt`.
- **Indexes**: Compound index `{ batchId: 1, createdAt: -1 }`.
