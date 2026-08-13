\# AI Answer Feedback \& Rating System



\## Overview



The AI Answer Feedback \& Rating System allows authenticated users to rate AI-generated answers and optionally provide comments about the quality of the response.



The feature stores feedback in a dedicated MongoDB collection and ensures that users can only submit feedback for their own AI-generated answers.



\---



\## Features



\- Rate AI-generated answers

\- Add an optional comment

\- Update previously submitted feedback

\- Prevent duplicate feedback for the same user and AI question

\- Verify ownership of AI-generated questions

\- Protect feedback endpoints using authentication

\- Validate rating and comment data

\- Automated tests for feedback functionality



\---



\## Module Location



This feature is implemented in:



```text

apps/backend/src/modules/ai/



Main files related to this feature:



ai-feedback.model.ts

ai-question.model.ts

ask-ai.routes.ts



Test file:



\_\_tests\_\_/ai-feedback.controller.test.ts



Frontend component:



apps/frontend/src/components/askai/AskAIButton.tsx

How It Works



The feedback flow works as follows:



User asks AI question

&#x20;       ↓

AI generates an answer

&#x20;       ↓

User selects a rating

&#x20;       ↓

User optionally adds a comment

&#x20;       ↓

Backend validates the request

&#x20;       ↓

Backend verifies AI question ownership

&#x20;       ↓

Feedback is created or updated

&#x20;       ↓

Feedback is stored in MongoDB

Rating and Comment



A user can submit a rating along with an optional comment.



Example request data:



{

&#x20; "rating": 5,

&#x20; "comment": "The answer was clear and helpful."

}



The rating and comment are validated before the feedback is stored.



Feedback Update Behaviour



A user can submit feedback again for the same AI-generated answer.



Instead of creating multiple feedback records, the existing feedback is updated.



First submission

&#x20;     ↓

Create feedback



Second submission for same AI answer

&#x20;     ↓

Update existing feedback



This prevents duplicate feedback records from the same user for the same AI question.



Ownership and Security



Users can only submit feedback for AI questions that belong to them.



The backend verifies:



The user is authenticated.

The AI question exists.

The AI question has an owner.

The authenticated user owns the AI question.



If a user attempts to rate another user's AI answer, the request is rejected with:



403 Forbidden



This prevents unauthorized users from submitting feedback for other users' AI-generated answers.



Database



Feedback is stored using the AiFeedback Mongoose model.



The feedback record is associated with:



User

AI Question

Rating

Comment

Timestamps



The backend uses an upsert-style operation so that existing feedback can be updated instead of creating duplicate records.



API



The feedback functionality is exposed through the protected AI backend routes.



The authenticated user's identity is obtained from the authentication context.



The client does not need to provide the user ID for determining feedback ownership.



Example payload:



{

&#x20; "rating": 4,

&#x20; "comment": "Good answer, but could provide more examples."

}

Validation



The feedback request is validated before it reaches the database.



Validation includes:



Request structure

Rating value

Optional comment



Invalid requests are rejected and are not stored.



Testing



Automated tests are included for the AI feedback functionality.



The tests verify:



Create Feedback



A user can create feedback for an AI question that belongs to them.



Update Feedback



Submitting feedback again for the same AI question updates the existing feedback.



Reject Unauthorized Feedback



A user cannot submit feedback for an AI question belonging to another user.



Reject AI Question Without Owner



Feedback is rejected when the AI question does not have an owner.



Test Command



To run the feature-specific backend tests:



pnpm exec vitest run src/modules/ai/\_\_tests\_\_/ai-feedback.controller.test.ts

Type Checking



Backend type checking:



pnpm --filter yaksha-faq-backend typecheck



Frontend type checking:



pnpm --filter yaksha-faq-frontend typecheck

Files Changed



The feature involves the following files:



apps/backend/src/modules/ai/ai-feedback.model.ts

apps/backend/src/modules/ai/ai-question.model.ts

apps/backend/src/modules/ai/ask-ai.routes.ts



apps/backend/src/modules/knowledge/knowledge.controller.ts

apps/backend/src/utils/auth/validation.ts



apps/frontend/src/components/askai/AskAIButton.tsx



apps/backend/src/modules/ai/\_\_tests\_\_/ai-feedback.controller.test.ts

Expected User Experience



After implementation, an authenticated user can:



Ask a question to the AI.

Receive an AI-generated answer.

Select a rating for the answer.

Optionally write a comment.

Submit the feedback.

Update the feedback later if required.



The system ensures that feedback is securely associated with the correct user and AI-generated answer.



Verification



The AI feedback controller tests were successfully executed with:



3 tests passed



The tests covered:



Creating feedback for an owned AI question

Updating feedback when the same user submits again

Rejecting feedback for another user's AI question

Rejecting feedback when the AI question has no owner

