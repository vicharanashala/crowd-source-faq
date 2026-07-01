# Support System

The support module is a helpdesk ticketing system. It allows students to log technical, attendance, or program-related issues, access automated troubleshooting checklists before submitting requests, and message staff directly. It also features a "Golden Ticket" priority queue funded by user points.

---

## Ticket Lifecycle

Support requests transition through the following states:
- **`Pending`**: Default state upon submission. Appears in the active admin inbox.
- **`In Review`**: Staff has opened the request and started investigating.
- **`Resolved`**: The issue has been fixed. The resolution summary is shared with the user.
- **`Rejected`**: Staff has declined the request (e.g., duplicate or invalid issue) and logged a rejection reason.
- **`open` / `closed`**: Generic status layers used by integration handlers.

### Key Schema Features
- **Follow-up Thread**: A message thread between the student and staff. Admins can toggle a `requestProof` flag to prompt students to upload documents or screenshots.
- **Internal Notes**: Staff-only annotations that are excluded from student API responses.
- **Status History**: An immutable audit log documenting who changed the ticket status and when.

---

## Troubleshooting Guidance

To reduce ticket load, students must view and interact with a troubleshooting checklist before submitting a ticket:
- **Classifications**: `internet`, `camera`, `microphone`, `device`, `power`, `other`.
- **Checkpoint Verification**: When a user selects an issue type, the UI presents a 4-step checklist (e.g., restarting routers, checking permissions).
- **Time Tracker**: The system captures `guidanceShownAt` when the checklist is rendered. The API rejects submissions if the form is completed too quickly, ensuring the user actually read the troubleshooting steps.
- **Guidance Configs**: The checklists are seeded dynamically in the `AttendanceGuidance` collection. Admins can update the text and steps for each category via the admin portal.

---

## Golden Tickets (Expedited Priority)

"Golden Tickets" are premium, high-priority support requests:
- **SP Cost**: Opening or converting a ticket to "Golden" costs a specific amount of Support Points (`spCost` deducted from the user's profile).
- **Staff Promotion**: Staff can manually convert an urgent ticket into a Golden Ticket via:
  `POST /api/admin/support/requests/:id/convert-to-golden`
- **Guaranteed Response**: Golden tickets bubble to the top of the admin inbox and send real-time alerts to staff channels (e.g. Discord).
- **Rejections & Cooldowns**: If a Golden Ticket request is rejected by staff, the points are refunded, and a cooldown timestamp (`goldenRejectionEndsAt`) is set on the student's profile to prevent immediate resubmission.

---

## Program Scoping

Tickets are scoped to specific cohorts:
- **`batchId`**: Associates the ticket with a particular program run.
- **Dashboard Filters**: Allows cohort program managers to filter the support queue for their own students while global administrators can view all tickets across the system.
