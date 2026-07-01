# Program Management

The platform supports a multi-tenant structure organized by cohort or program run, called a **Batch**. Scoping FAQs, community feeds, integrations, and support logs to specific batches allows multiple programs or calendar runs to share a single codebase and database cluster without mixing user data or configurations.

---

## Batches (Program Runs)

Every batch document (`Batch` model) defines a specific cohort lifecycle:

### 1. Program Statuses
- **`draft`**: The program is being configured by admins. It is invisible to the public portal.
- **`active`**: The program is live. Students can see it, enroll (if open), and access its resources.
- **`completed`**: The program run has concluded. Content is read-only for students.
- **`archived`**: Hidden from standard dashboards, preserved for historical reporting and audit.

### 2. Enrollment Control
Admins can define the enrollment behavior per program:
- **Open (`open`)**: Any authenticated student can self-enroll in the batch.
- **Invite Only (`invite_only`)**: Self-enrollment is disabled. Students must receive an email invite or admin approval.
- **Closed (`closed`)**: Strictly managed. Staff must manually import or link students to the program.
- **Enrollment Cap**: A maximum student count (`maxEnrollment`). The API rejects self-enrollments once the count is reached.

---

## Program Feature Flags

Feature flags (`FeatureFlag` model) enable or disable specific parts of the user interface (e.g. Community, Support tickets, Zoom recordings, AI summaries) at runtime.

### 1. Global vs. Per-Program Overrides
- **Global Flag**: A document with `batchId: null` represents the system default.
- **Program Override**: A document referencing a specific `batchId` overrides the global default for that cohort.
- **Lookup Resolution**: The system checks for a cohort-specific override first, falling back to the global default if none exists.

*Example compound index setup:*
```json
{ "key": 1, "batchId": 1 } // Enforces uniqueness of a flag key per cohort
```

---

## Courses and Curriculum

A program run contains multiple courses (`Course` model):
- **Cohort Scoping**: Courses are associated with a specific `batchId`.
- **Lectures & Material**: Tracks lecture schedules, topics, and resource download links.
- **Dynamic Content**: Connected to the Zoom integration to sync meeting records with the appropriate course structure.

---

## Registration and Onboarding

- **Registration Configuration**: Admins configure custom forms, metadata fields, and email templates per batch.
- **Welcome Packages**: Custom welcome messages, orientation schedules, and start-up checklists are loaded dynamically when a student enters their active program portal.
- **Audit Logging**: Any changes to student enrollment status, program switches, or onboarding steps are logged in `OnboardingAuditLog` for verification.
