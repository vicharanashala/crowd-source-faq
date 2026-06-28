# Admin API Notes

This document describes the current moderation/admin API and the Socket.IO events associated with moderation actions.

## Endpoints

All routes below use the `/api/v1/admin` prefix.

### Moderator Or Admin Access

```text
GET   /stats
GET   /users
GET   /questions
PATCH /questions/:id/status
GET   /answers
PATCH /answers/:id/official
```

### Admin-Only Access

```text
PATCH  /users/:id/role
DELETE /questions/:id
DELETE /answers/:id
```

## Role Rules

- `student` users are blocked from the admin router.
- `moderator` users can inspect dashboard data and moderate content state.
- `admin` users can additionally manage user roles and hard-delete content.

## Socket Events

Public-facing Socket.IO events used by answer/admin flows:

```text
new_answer
answer_accepted
official_answer_created
question_status_updated
```

The event bridge lives in `backend/config/socket.js` and maps internal controller events such as `answer:created` to the public event names above.

## Integration Note

The admin router is implemented in `backend/routes/adminRoutes.js`.
The main Express app must mount that router before `/api/v1/admin/*` becomes reachable in the running server.
