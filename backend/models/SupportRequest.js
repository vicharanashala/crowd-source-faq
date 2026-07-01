import mongoose, { Schema as MongooseSchema } from 'mongoose';
// v1.68 — schema audit note: this enum has TitleCase +
// lowercase mixed (the v1.65 Golden extension added the
// lowercase values; the v1.5 admin inbox had the
// TitleCase values). The audit recommends normalizing to
// lowercase only. KEPT AS-IS in v1.68 to avoid breaking
// ~20 controller / script call sites that compare against
// the TitleCase values. A follow-up commit can normalize
// the DB values via LEGACY_STATUS_MAP and remove the
// TitleCase variants. Tracked in issues.md schema-audit M1.
// v1.68 — compatibility map for the future normalization.
// New writes should use the lowercase form. Old DB rows
// carry TitleCase values; the controller can normalize
// on read using this map.
export const LEGACY_STATUS_MAP = {
    Pending: 'Pending', // already canonical
    'In Review': 'In Review', // already canonical
    Resolved: 'Resolved', // already canonical
    Rejected: 'Rejected', // already canonical
    open: 'open',
    closed: 'closed',
};
// Default issue-type display labels + 4-step checklists. These are
// seeded into the AttendanceGuidance collection on first read; admins
// can override any of them via PUT /api/support/guidance/:issueType.
export const ISSUE_CONFIGS = {
    internet: {
        label: 'Internet Problem',
        shortLabel: 'Internet',
        steps: [
            'Restart your router or hotspot once.',
            'Switch to a backup network if one is available.',
            'Disable VPN or proxy tools that may interfere with the class link.',
            'Note the time the connection dropped so the team can review it.',
        ],
    },
    camera: {
        label: 'Camera Issue',
        shortLabel: 'Camera',
        steps: [
            'Check browser camera permission in the address bar.',
            'Close and reopen the class tab, then test your camera again.',
            'Reconnect the camera or switch to another device if you have one.',
            'Write down the exact browser or device error if the camera still fails.',
        ],
    },
    microphone: {
        label: 'Microphone Issue',
        shortLabel: 'Microphone',
        steps: [
            'Check microphone permission in the browser.',
            'Unplug and reconnect the mic or headset if you are using one.',
            'Test microphone input in another app to confirm the device works.',
            'Write down the browser or device message you saw.',
        ],
    },
    device: {
        label: 'Device Failure',
        shortLabel: 'Device',
        steps: [
            'Restart the device once and try reconnecting to the class.',
            'Plug in power or move to another device if one is available.',
            'If the device is overheating or crashing, stop using it for a moment.',
            'Write down any boot, crash, or hardware message you see.',
        ],
    },
    power: {
        label: 'Power Outage',
        shortLabel: 'Power',
        steps: [
            'Confirm whether the outage affects only your room or the full area.',
            'Move to a backup power source or a different location if possible.',
            'Use your phone hotspot if mobile data is available.',
            'Mention the outage timing and duration in your request.',
        ],
    },
    other: {
        label: 'Other Reason',
        shortLabel: 'Other',
        steps: [
            'Write a short description of what stopped you from joining.',
            'Note the time the issue started and whether it affected the whole session.',
            'Submit the request so the support team can review it.',
        ],
    },
};
export function getIssueConfig(issueType) {
    return ISSUE_CONFIGS[issueType] ?? ISSUE_CONFIGS.other;
}
const documentSubSchema = new MongooseSchema({
    name: { type: String, default: '' },
    url: { type: String, default: '' },
    type: { type: String, default: '' },
}, { _id: false });
const followUpSubSchema = new MongooseSchema({
    senderRole: { type: String, enum: ['admin', 'student'], required: true },
    senderId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true, trim: true, maxlength: 100 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    requestProof: { type: Boolean, default: false },
    documents: { type: [documentSubSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });
const internalNoteSubSchema = new MongooseSchema({
    note: { type: String, required: true, trim: true, maxlength: 2000 },
    addedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    addedByName: { type: String, required: true, maxlength: 100 },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });
const statusHistorySubSchema = new MongooseSchema({
    // v1.65: enum extended with 'open' and 'closed' (Golden Ticket lifecycle).
    // Existing 'Pending' | 'In Review' | 'Resolved' | 'Rejected' continue
    // to write to history — no migration on existing entries needed.
    status: { type: String, enum: ['Pending', 'In Review', 'Resolved', 'Rejected', 'open', 'closed'], required: true },
    note: { type: String, default: '', maxlength: 2000 },
    updatedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
    updatedByName: { type: String, required: true, maxlength: 100 },
    timestamp: { type: Date, default: Date.now },
}, { _id: true });
const supportRequestSchema = new MongooseSchema({
    userId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true },
    // v1.69 — see interface.
    batchId: {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Batch',
        default: null,
        index: true,
    },
    userName: { type: String, required: true, trim: true, maxlength: 100 },
    userEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    issueType: {
        type: String,
        enum: ['internet', 'camera', 'microphone', 'device', 'power', 'other'],
        required: true,
        index: true,
    },
    issueLabel: { type: String, required: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    details: { type: String, required: true, trim: true, maxlength: 4000 },
    attemptedSteps: { type: [String], default: [] },
    status: {
        // v1.65: enum extended with 'open' and 'closed' (Golden Ticket
        // lifecycle). Existing tickets and the existing 'Pending' default
        // are unchanged. New admin transitions to 'open' / 'closed' only
        // happen via the Golden Ticket / status-update endpoints.
        type: String,
        enum: ['Pending', 'In Review', 'Resolved', 'Rejected', 'open', 'closed'],
        default: 'Pending',
        index: true,
    },
    adminNote: { type: String, default: '', maxlength: 2000 },
    internalNotes: { type: [internalNoteSubSchema], default: [] },
    resolutionSummary: { type: String, default: '', maxlength: 2000 },
    sessionAccessUrl: { type: String, default: '', maxlength: 500 },
    // v1.66 — terminal-state timestamps + reason (see interface).
    resolvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', maxlength: 2000 },
    followUps: { type: [followUpSubSchema], default: [] },
    statusHistory: { type: [statusHistorySubSchema], default: [] },
    // Provenance — when the user last saw the troubleshooting checklist
    guidanceShownAt: { type: Date, default: null },
    // ── Schema-driven context fields (additive) ──────────────────────────
    // Stored as a list of {key, label, value} triples so the admin view
    // can render the *current* label even if the field was renamed or
    // archived after this ticket was submitted. Key is the immutable
    // schema identifier; value is the canonical type-coerced input.
    contextFields: {
        type: [{
                _id: false,
                key: { type: String, required: true, trim: true, maxlength: 60 },
                label: { type: String, required: true, trim: true, maxlength: 120 },
                value: { type: MongooseSchema.Types.Mixed, default: null },
            }],
        default: [],
    },
    // ── Golden Ticket fields (additive, v1.65) ────────────────────────────
    // All default to safe, non-Golden values so existing documents in the
    // `yaksha_faq_session_support` collection read as non-Golden without
    // a migration script. Mongoose only applies `default` on insert, so
    // legacy documents missing these fields return `undefined` from
    // `.toObject()` — admin views and the public inbox MUST treat
    // `undefined` and `false` identically. Helpers in supportCore.ts
    // (`isGoldenTicket`, `goldenRejectionActive`) centralise that.
    isGolden: { type: Boolean, default: false },
    spCost: { type: Number, default: 0, min: 0 },
    goldenConvertedAt: { type: Date, default: null },
    goldenConvertedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User', default: null },
    goldenConvertedByName: { type: String, default: '', maxlength: 100 },
    goldenRejectionReason: { type: String, default: '', maxlength: 2000 },
    goldenRejectionEndsAt: { type: Date, default: null },
}, { timestamps: true });
// Hot query paths
// "My tickets" list — index scan
supportRequestSchema.index({ userId: 1, createdAt: -1 });
// Admin inbox — common filter combo
supportRequestSchema.index({ status: 1, issueType: 1, updatedAt: -1 });
// Admin pending queue (sorted by oldest-first to triage the backlog)
supportRequestSchema.index({ status: 1, createdAt: 1 });
// Status-update race guard (used by controller to prevent two
// simultaneous transitions)
supportRequestSchema.index({ _id: 1, status: 1 });
// v1.65 — Golden Ticket admin inbox: filter Golden vs non-Golden + sort
// golden first (newest). Compound index keeps the admin "Golden" filter
// fast without scanning non-Golden docs.
supportRequestSchema.index({ isGolden: 1, status: 1, createdAt: -1 });
// Cooldown / analytics: count a user's Golden tickets in a date window.
supportRequestSchema.index({ userId: 1, isGolden: 1, createdAt: -1 });
// v1.65.1 — Escalation Queue: spCost desc with createdAt asc
// tiebreaker (oldest first). Filtered by pending statuses.
supportRequestSchema.index({ isGolden: 1, status: 1, spCost: -1, createdAt: 1 });
export default mongoose.model('SupportRequest', supportRequestSchema, 'yaksha_faq_session_support');
