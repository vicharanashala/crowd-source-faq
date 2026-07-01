# Community and Moderation

The platform hosts an interactive Q&A community feed scoped per Batch/Program. It allows students to ask questions, engage in discussion threads, vote on answers, and earn reputation points. Administrators can moderate posts, define automated policies, and escalate unresolved issues.

---

## Community Post Lifecycle

Community posts transition through several states as they move from user submissions to resolved answers:

### 1. Basic Status
- **`unanswered`**: The default state for new posts.
- **`answered`**: Triggered when a comment is marked as the accepted solution by the author or an administrator.

### 2. Deep Lifecycle Statuses (`LifecycleStatus`)
To facilitate converting community knowledge into official FAQs, posts follow a progressive lifecycle:
1. **`open`** — The post is created and open for discussion.
2. **`answered`** — A reply has been selected as the answer.
3. **`community_accepted`** — The answer has received a high number of community upvotes.
4. **`ai_validated`** — The AI has verified that the answer is accurate and complete based on existing reference materials.
5. **`admin_accepted`** — An administrator has reviewed and signed off on the answer.
6. **`converted_to_faq`** — The post is promoted into the official FAQ collection.

---

## The Reputation System

To encourage high-quality contributions, the platform tracks member reputation:

### 1. Reputation Calculations
Reputation is calculated **per program** to prevent historical points from dominating newer runs.
- Source of truth: `ProgramReputation` collection (`yaksha_program_reputation`).
- Points are earned or revoked based on actions:
  - **Posting an accepted answer**: `+20` points.
  - **Receiving an upvote**: `+5` points.
  - **Upvoting content**: `+1` point (to encourage feedback).
  - **Receiving a report/flag (confirmed)**: `-10` points.

### 2. Badges and Tiers
The system automatically updates user tiers and awards badges:
- **Tiers**: `bronze`, `silver`, `gold`, `platinum`. Tiers are calculated based on threshold limits of program points.
- **Positive Badges**: Awarded for milestones like "First Responder", "Community Scholar" (5 accepted answers), or "Top Contributor".
- **Negative Badges**: Checked by the system when a user's posts are repeatedly flagged or flagged for code-of-conduct violations.

---

## Content Moderation

Moderation is split into automated runtime sanitization and admin-moderator review paths:

### 1. Automated Soft-Censorship
The backend implements a soft-censorship profanity filter using the `obscenity` package at the database write layer:
- **Actions**: Applied to post titles, bodies, and comment texts inside Mongoose pre-save middleware.
- **Mechanism**: The engine uses a compiled RegExp dataset that automatically detects English profanity, including common leetspeak substitutions (e.g., character replacements or spacing).
- **Behavior**: The submission succeeds and does not throw a 400 validation error, but the profanity is masked with asterisks (`****`) before write. Every reader is served the sanitized version.

### 2. Reporting and Flags
Users can flag posts or comments for review:
- Flagged items populate the **Admin -> Moderation Queue**.
- Reports store the reporting user's ID and the stated reason.

### 3. Moderation Actions
Through the moderation dashboard, staff can:
- **Dismiss**: Clear reports on a post.
- **Hide**: Set a post's visibility flag to false, removing it from public feeds while keeping it in the database.
- **Delete**: Fully purge the post or comment.
- **Suspend/Ban**: Lock the author's account from creating new community content.

---

## AI Auto-Answers

The platform attempts to auto-resolve new community questions using the RAG search engine:
1. When a post is submitted, a background job searches the FAQ database.
2. If a match is found with high confidence (> 85%), the AI drafts a suggested answer.
3. The post's `aiAnswerStatus` is set to `suggested`.
4. The suggested answer is clearly styled as a "Suggested AI Answer" in the UI.
5. Users can upvote the AI suggestion. Admins can approve it (marking the post as officially `answered`) or reject/dismiss it.
