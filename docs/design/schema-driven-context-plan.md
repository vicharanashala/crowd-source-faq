# Schema-Driven Context System — Plan

> Extension of the existing Session Support feature. The current
> 6 hardcoded issue types (`internet / camera / microphone / device
> / power / other`) each carry a 4-step troubleshooting checklist
> and nothing else. This plan adds **per-category custom metadata
> fields** that admins configure and the user form renders
> dynamically, so support gets first-touch context without bloating
> the simple cases.

---

## 1. Goals & non-goals

**Goals**
- Admins attach custom form fields to any support category via a
  dedicated schema editor — field name, type, required/optional,
  dropdown options, validation.
- User form starts minimal (Category + Description) and grows
  context-aware fields only after a category is selected.
- Submitted tickets bundle a structured `contextFields: Record<key,
  value>` block alongside the standard fields. Admin can read it at
  a glance.
- Existing 6 categories keep working — their current checklists
  become their default schemas with zero fields attached. Pure
  additive migration.

**Non-goals (v1)**
- Per-field conditional logic (e.g. "show `errorCode` only if
  `hasError === true`"). That needs a rules engine. v1 is
  unconditional rendering.
- Per-field filter UI on the admin inbox. v1 keeps the existing
  status / type / text filters; dynamic-field filtering is v2.
- Renaming a field's `key` after submissions exist. `key` is the
  stable identifier; renaming `label` is fine, renaming `key`
  would orphan historical data.
- Cross-category search ("show me all tickets where `os` is
  Windows"). v1 admin can read contextFields on a single ticket;
  no aggregate queries.

---

## 2. Data model

### 2.1 New collection `SupportCategory` (replaces the role of `AttendanceGuidance`)

We **rename and expand** the existing `AttendanceGuidance` model.
It's the per-category lookup; the only data on it today is
`{issueType, steps, updatedBy, timestamps}`. After this plan it's
the full category definition.

```
{
  _id          : ObjectId
  issueType    : String   (unique, kebab-case key — e.g. 'internet', 'stipend-issue')
  label        : String   (display name — e.g. "Internet Problem")
  shortLabel   : String   (one-word for compact UI — e.g. "Internet")
  description  : String   (admin-only, optional)
  iconKey      : String   (enum: 'wifi' | 'camera' | 'mic' | 'device' | 'power' | 'other' | 'generic')
  steps        : String[] (existing troubleshooting checklist)
  fields       : ContextField[]
  isActive     : Boolean  (default true)
  displayOrder : Number   (admin can reorder categories)
  createdBy    : ObjectId(User)
  createdAt    : Date
  updatedAt    : Date
}
```

### 2.2 `ContextField` (subdocument on SupportCategory)

```
{
  _id          : ObjectId
  key          : String   (machine-readable, immutable after creation;
                           used as the key in the ticket's contextFields map.
                           auto-derived from label if not provided.)
  label        : String   (display name, editable)
  type         : 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'dropdown'
  required     : Boolean
  placeholder  : String   (text/textarea only)
  helpText     : String   (small grey text below the field, optional)
  options      : { value, label }[]  (dropdown only, min 1)
  displayOrder : Number
  archived     : Boolean  (soft delete; preserved for historical tickets)
  archivedAt   : Date | null
}
```

Indexes:
- `{ isActive: 1, displayOrder: 1 }` — user-facing list
- `{ issueType: 1 }` (unique) — admin lookup

### 2.3 Extend `SupportRequest` (additive)

```
{
  …existing fields…
  contextFields : Map<String, String | Number | Boolean | null>   // NEW
}
```

Why `Map` and not a typed subdoc? Because the field set is dynamic
per category — typed subdocs would force an enum update every time
an admin adds a field. Mongoose Maps serialize cleanly to BSON and
let us filter by key at the controller layer.

Storage: `contextFields.set('errorCode', 'E1234')` →
`{ errorCode: 'E1234' }` in the BSON document.

### 2.4 No changes to: `User`, `FeatureFlag`, `Notification`, `AdminLog`.

---

## 3. The 4 field types

| Type | UI widget | Validation | Stored as |
| --- | --- | --- | --- |
| `text` | single-line input | max length 200, trim non-empty if required | string |
| `textarea` | multi-line input (4 rows) | max length 2000, trim non-empty if required | string |
| `number` | number input | numeric, optional min/max (v2) | number |
| `date` | `<input type="date">` | ISO yyyy-mm-dd | string (ISO) |
| `boolean` | checkbox | always true/false | boolean |
| `dropdown` | `<select>` | one of `options[].value` | string |

A `DynamicFieldInput` component encapsulates the render + client-side
validation. The controller re-validates on submit (defence in depth).

---

## 4. The submission shape

```
POST /api/support/requests
{
  issueType: 'device',
  title: 'Device Failure — Unable to attend session',   // optional; derived if blank
  details: 'My laptop kept crashing when joining the call',
  attemptedSteps: ['Restart the device once…', …],
  documents: [ … ],
  guidanceShownAt: '2026-06-10T07:03:11.000Z',
  contextFields: {
    os:           'Windows',
    errorMessage: 'BSOD — driver_irql_not_less_or_equal',
    hasAdapter:   true,
    purchasedOn:  '2024-11-01',
  }
}
```

Server-side flow on submit:
1. Look up the `SupportCategory` for `issueType`. If missing or
   `isActive: false` → 400 INVALID_CATEGORY.
2. For each field in the category, validate the submitted value:
   - Required + missing → 400 MISSING_FIELD_<key>
   - Wrong type → 400 INVALID_FIELD_<key>
   - Dropdown value not in `options` → 400 INVALID_FIELD_<key>
3. Coerce values to the canonical type for storage (number→number,
   date→ISO string, etc.)
4. Persist on the ticket. The category's own `displayOrder` etc. is
   never stored on the ticket — only the values.

---

## 5. Admin schema editor — `/admin/support/categories`

A new admin page. Sidebar gets a new "Categories" entry under the
existing "Support" group.

### 5.1 Layout

```
┌─ Support / Categories ────────────────────────┐
│ [+ New Category]                              │
│                                              │
│ ┌─ Internet (internet) ─────────────────┐   │
│ │ Label: Internet Problem               │   │
│ │ Description: …                       │   │
│ │ Steps: 4                             │   │
│ │ Fields: 0  [Edit checklist] [Edit]   │   │
│ │ Active ☑   Order ↑↓   [Archive]      │   │
│ └──────────────────────────────────────┘   │
│                                              │
│ ┌─ Device (device) ─────────────────────┐   │
│ │ Fields (2)  [+ Add field]              │   │
│ │   • OS  (dropdown, required)  [↑↓] [×] │   │
│ │   • Error message (textarea, opt) [↑↓] [×] │
│ └──────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### 5.2 Field modal (Add / Edit)

Same modal for both:
- **Label** (text, required)
- **Key** (text, auto-derived from label; lowercase, dash-separated,
  immutable after first save — disabled input on edit)
- **Type** (dropdown: text / textarea / number / date / boolean / dropdown)
- **Required** (checkbox)
- **Placeholder** (text, only for text/textarea)
- **Help text** (textarea, optional)
- **Options** (repeatable `value` + `label` rows, only for dropdown;
  at least 1 required)

### 5.3 Reorder

Up/Down buttons (no drag-and-drop — the existing admin pattern is
plain buttons, keeps the bundle small).

---

## 6. User-side flow

The submit wizard grows from 3 steps to 4:

1. **Pick category** (was "Pick issue type")
2. **Follow checklist** (unchanged)
3. **Describe** — main description + dynamic context fields
4. **Attach proof** (optional, was bundled into step 3)

We could keep 3 steps by folding attach-proof into step 3, but
mobile UX benefits from a dedicated small step. Going with 4.

When the user picks a category in step 1, the page fetches the
category's full schema (steps + fields). Subsequent step
transitions are instant (no re-fetch).

`DynamicFieldInput` renders the right widget per type. The component
is shared between the user form (write) and the admin ticket view
(read-only).

---

## 7. Admin ticket view — rendering context

The admin ticket page (`AdminSupportTicket.tsx`) renders a new
"Provided context" section between the student's message and the
follow-up thread. Layout:

```
┌─ Provided context ──────────────────────┐
│ OS:            Windows                  │
│ Error message: BSOD — driver_…         │
│ Has adapter:   ✓                        │
│ Purchased on:  Nov 1, 2024              │
└────────────────────────────────────────┘
```

Empty state: hidden (the section only appears if `contextFields`
has at least one key).

If a field was archived after the ticket was submitted, the value
still renders, but with a small `(archived)` badge next to the
label so admins know the field is no longer in the schema.

---

## 8. Backwards compatibility & migration

**Migration script** (`scripts/seedSupportCategories.ts`, idempotent):

1. For each of the 6 existing `ISSUE_CONFIGS` keys (`internet`,
   `camera`, `microphone`, `device`, `power`, `other`):
   - Upsert a `SupportCategory` with `issueType: key`,
     `label: ISSUE_CONFIGS[key].label`, `shortLabel: key`,
     `steps: ISSUE_CONFIGS[key].steps`, `fields: []`,
     `isActive: true`.
   - The `iconKey` defaults to the issue type itself.

2. Existing `AttendanceGuidance` documents: the controller keeps
   reading from `SupportCategory` going forward. Old
   `AttendanceGuidance` rows are left in place (read by no one) for
   one release, then a separate cleanup script removes them in
   v1.1.

3. Existing `SupportRequest` documents: `contextFields` is missing
   on the schema level. Mongoose defaults to `{}`. Admin ticket
   view sees an empty map → section hidden. No data migration
   needed.

The new `SupportCategory` model is the source of truth. The
existing `ISSUE_CONFIGS` constant in `SupportRequest.ts` becomes a
one-time seed value, not a runtime lookup.

---

## 9. Validation rules (defence in depth)

- **Client**: `DynamicFieldInput` validates before allowing submit.
  Required-but-empty → field shows red border + inline error.
- **Server**: support controller re-validates every field on every
  submit and status update. Returning 400 with a stable error code
  per field is enough — the client UI knows how to display.
- **Archived fields**: if a ticket was submitted with a field that
  has since been archived, the value is kept in `contextFields` but
  no field is rendered for input on new submissions. Admin can still
  read the historical value on the existing ticket.

---

## 10. Edge cases

1. **Category deleted between page load and submit** → controller
   returns 400 INVALID_CATEGORY with a message that the user can
   retry on. The category dropdown in the wizard can re-fetch and
   show the new list.
2. **Required field added after a ticket is open** → historical
   ticket keeps its existing contextFields; new submissions are
   required to fill it. The admin ticket view shows the field's
   current label, with a `(not provided)` annotation if absent.
3. **Dropdown option removed after a ticket is open** → the ticket's
   value still renders, even if it's no longer a valid option.
4. **User picks "Other"** → no fields are shown (Other has 0 default
   fields). The user can still type free text in `details`.
5. **Field count gets large** (>10 fields per category) → the wizard
   step scrolls naturally; no special UI needed.
6. **Two admins edit the same category at once** → last-write-wins.
   We don't need optimistic locking for a v1 admin tool; admins are
   trusted not to step on each other.
7. **A field with `key: 'os'` is renamed via direct DB intervention
   to `key: 'operatingSystem'`** → historical tickets still have
   `os: 'Windows'`, the admin view looks up the field by the
   *current* key and won't render. **Solution**: store the field's
   `key` snapshot on the value at submit time, so the admin view
   can render "OS: Windows" using the field's display label even
   after the key is renamed. **v1 simplification**: just store
   `{key, label, value}` triples in `contextFields` instead of a
   bare map. Slightly more storage, much more robust. Going with
   this.

The `{key, label, value}` triple format is the chosen v1 storage
shape:

```ts
contextFields: { key: string, label: string, value: string | number | boolean | null }[]
```

---

## 11. Security

- All admin category endpoints require `authorize('admin', 'moderator')`.
- The user-side form never sends the field definition (only the
  value). The category schema is fetched separately, server-side
  validated.
- Per-user RBAC: students can read category schemas (so the wizard
  can render fields) but cannot list all categories with their
  full schema; they only see the active one they picked. The
  public `GET /api/support/troubleshoot/:issueType` returns just
  steps + fields (no admin-only metadata).
- The user-side validation client-side is a UX nicety, not a
  security boundary — server always re-validates.

---

## 12. Folder structure (delta only)

```
backend/
├── models/
│   ├── AttendanceGuidance.ts         (deprecated — read by no one after rollout)
│   └── SupportCategory.ts             (new — replaces the above)
├── controllers/
│   └── supportController.ts           (add: listCategories, upsertCategory, archiveCategory,
│                                       addContextField, updateContextField, archiveContextField;
│                                       modify: getTroubleshootSteps returns fields too;
│                                       modify: createSupportRequest validates + persists contextFields)
├── routes/
│   └── support.ts                     (add: /categories GET + admin POST/PATCH/DELETE;
│                                       add: /categories/:type/fields POST/PATCH/DELETE)
├── scripts/
│   └── seedSupportCategories.ts       (new, idempotent — one-time run)
└── server.ts                          (no change)

frontend/src/
├── pages/
│   └── NewSupportRequestPage.tsx      (extend step 3 with dynamic fields)
├── components/
│   ├── support/
│   │   ├── types.ts                   (add ContextField, FieldType, SupportCategory)
│   │   ├── api.ts                     (add category CRUD)
│   │   ├── DynamicFieldInput.tsx      (new — renders + validates one field)
│   │   └── ContextFieldsDisplay.tsx    (new — read-only rendering for admin view)
│   └── admin/
│       └── pages/
│           ├── AdminSupportCategories.tsx  (new — schema editor)
│           └── AdminSupportTicket.tsx      (extend — render ContextFieldsDisplay)
└── admin/components/layout/AdminSidebar.tsx  (add 'Categories' under Support group)
```

---

## 13. Rollout

1. **Backend model + migration** — `SupportCategory.ts`,
   `seedSupportCategories.ts`. Run migration. Existing 6 categories
   now live in the DB with empty `fields: []`. Behaviour for the
   existing feature is identical to before.
2. **Backend controller** — extend supportController to:
   - Return fields alongside steps in `/troubleshoot/:issueType`
   - Accept and validate `contextFields` on submit
   - Persist `contextFields` on the ticket
3. **Backend admin endpoints** — category CRUD + field CRUD
4. **Frontend types + API client** — wire the new shapes
5. **`DynamicFieldInput` component** — single component handling
   all 4 field types
6. **Frontend user wizard** — render dynamic fields in step 3
7. **`ContextFieldsDisplay` component** — read-only view
8. **Frontend admin ticket view** — render `ContextFieldsDisplay`
9. **Admin Categories page** — schema editor
10. **Admin sidebar** — add link
11. **Commit + push**

Estimated 1 working day end-to-end on top of the existing support
feature.

---

## 14. Why this design (vs alternatives)

**Why not store schema on the ticket directly?**
Storing the full field definition on each ticket would mean every
ticket ships a copy of the schema. A category change (rename
label, add a new field) would never apply to historical tickets —
but that means the admin view can never show "updated labels".
The "schema lives in one place, values live on the ticket" split
is the same pattern the existing guidance editor uses.

**Why a `Map` of `{key, label, value}` triples, not a flat map?**
The triple format survives admin renames of the field's `label`
without losing meaning. The cost is ~30% more storage per ticket,
which is fine for the expected volume (< 1k tickets/month).

**Why open the `issueType` enum (no longer hardcoded)?**
Admins will want to add new categories like "Stipend Issue" or
"Certificate Problem". The hardcoded enum blocks this. Moving
the validation to a DB lookup is the natural extension and
matches the dynamic nature of the schema system.

**Why 4 wizard steps instead of 3?**
The dynamic fields could overflow the "Describe" step on mobile.
A dedicated "Provide details" step is the cleaner UX. Most users
won't notice the extra step count because step 1 is now strictly
"pick a category" — no field render yet.

---

## 15. What v2 should add

When v1 has been live for a month and admins have actually been
configuring fields, v2 priorities would be:

1. **Dynamic filter UI on the admin inbox** — pick a category,
   then pick a field from that category to filter by.
2. **Per-field conditional visibility** — "show `errorCode` only
   when `hasError === true`". Rules engine in the schema.
3. **Field-level analytics** — for each field, show a histogram of
   values across the ticket population. Useful for spotting common
   config (e.g. 80% of device tickets report `os: Windows`).
4. **Field templates** — admins can save a set of fields as a
   template and apply it to multiple categories at once.
5. **Search inside contextFields** — "show me all tickets where
   `errorMessage` contains 'driver_irql'".
