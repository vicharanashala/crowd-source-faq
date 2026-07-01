/**
 * supportRequestsController.ts — Session Support ticket CRUD.
 *
 * Routes (from routes/support.ts):
 *   GET  /api/support/troubleshoot/:issueType    (user, gated by flag)
 *   POST /api/support/requests                    (user, gated by flag, rate-limited)
 *   GET  /api/support/requests                   (user/admin, gated by flag)
 *   GET  /api/support/requests/:id               (user/admin, gated by flag)
 *
 * Follow-up messages and status changes are in supportFollowUpController.ts.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import SupportRequest, {
  ISSUE_CONFIGS,
  getIssueConfig,
  type SupportIssueType,
  type SupportStatus,
  type ISupportFollowUp,
} from './support-request.model.js';
import SupportCategory, { type IContextField } from './support-category.model.js';
import { supportLog } from '../../utils/http/logger.js';
import { postNotification } from '../../integrations/discord/notifications.js';
import { assertCanCreateContent } from '../../utils/banUtils.js';
// v1.69 — Phase 3c: scope support reads by program. The middleware
// attaches req.programContext (only when the URL/query carries a
// valid batchId), so we thread it through the filter on the
// read paths. Until the rollout flips required=true on the
// programScope middleware, single-tenant callers still work.
import { withCurrentProgram } from '../../utils/db/scopedQuery.js';
import {
  VALID_STATUSES,
  getAuthedUserId,
  getAuthedUserRole,
  escapeRegex,
  coerceContextFieldValue,
  isEmptyContextValue,
  stripAdminOnlyFields,
  fanOutToAdmins,
  requireFeatureOn,
} from './support-core.controller.js';

function asStringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

// ─── Troubleshoot (read) ──────────────────────────────────────────────────

/**
 * GET /api/support/troubleshoot/:issueType
 * Returns the checklist + custom context-field schema for an issue
 * type. Reads from SupportCategory (the new admin-editable model).
 * Falls back to the hardcoded ISSUE_CONFIGS defaults if no row
 * exists yet (covers the case where the seed script hasn't been run
 * — e.g. fresh dev environment). Gated by flag.
 */
export async function getTroubleshootSteps(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  try {
    const issueType = String(req.params.issueType || '').trim() as SupportIssueType;
    const config = getIssueConfig(issueType);

    // Prefer the admin-editable SupportCategory
    let cat = await SupportCategory.findOne({ issueType, isActive: true }).lean();
    if (!cat) {
      // Fall back to the in-code defaults + an empty field list
      cat = await SupportCategory.findOneAndUpdate(
        { issueType },
        {
          $setOnInsert: {
            issueType,
            label: config.label,
            shortLabel: config.shortLabel,
            steps: config.steps,
            fields: [],
            isActive: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    }

    res.json({
      issueType,
      label: cat?.label ?? config.label,
      shortLabel: cat?.shortLabel ?? config.shortLabel,
      steps: cat?.steps ?? config.steps,
      // Only return non-archived fields — the user form doesn't render
      // archived ones. The admin ticket view looks these up from the
      // stored triples (the ticket knows its own label snapshot).
      fields: (cat?.fields ?? []).filter((f) => !f.archived),
    });
  } catch (err) {
    supportLog.error(`[support] getTroubleshootSteps failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load troubleshooting steps.' });
  }
}

// ─── Create request ───────────────────────────────────────────────────────

/**
 * POST /api/support/requests
 * Submit a new request. Gated by flag.
 *
 * v1.65 — Golden Ticket cooldowns. A user who had a Golden ticket
 * rejected within the last `lastGoldenRejectionEndsAt` window cannot
 * create a NEW Golden ticket (regular non-Golden support tickets are
 * not affected). The cooldown is stamped on the user by the admin
 * rejection flow in supportFollowUpController.ts (status='Rejected'
 * on a Golden ticket). Non-Golden creation is always allowed — the
 * base support flow is unchanged.
 */
export async function createSupportRequest(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }
  // v1.66 — Golden-ban gate. A user under a 72h ban cannot raise
  // support tickets (or Golden tickets) even though they can still
  // log in and browse. The check is `goldenBannedUntil > now`.
  if (!assertCanCreateContent(req.user as { goldenBannedUntil: Date | null }, res)) return;

  // v1.65 — Golden rejection cooldown gate. Cheap, one indexed read,
  // no side effects. Only fires for Golden conversion attempts (the
  // client passes isGolden=true to opt in). For non-Golden support
  // tickets the cooldown is invisible to the user. The cooldown
  // duration is configurable from Admin → Settings
  // (goldenCooldownHours, default 48). A 0-hour cooldown disables
  // the gate entirely.
  const body = (req.body ?? {}) as {
    issueType?: string;
    title?: string;
    details?: string;
    attemptedSteps?: string[];
    documents?: { name?: string; url?: string; type?: string }[];
    guidanceShownAt?: string;
    contextFields?: Record<string, unknown>;
    isGolden?: boolean;        // v1.65 — opt-in to a Golden ticket at submit time
    spCost?: number;           // v1.65 — SP to invest (1..100 by default)
  };
  const isGoldenRequested = body.isGolden === true;
  const spCostRequested = Math.max(0, Math.trunc(Number(body.spCost) || 0));
  if (isGoldenRequested) {
    // v1.65.1 — goldenTicket is its own experimental flag. If the admin
    // has it off, refuse Golden submissions with the same 404 the
    // page-level FeatureDisabledPanel surfaces. Without this check,
    // a user could keep creating Golden tickets through the regular
    // support flow (which only checks sessionSupport) even after the
    // admin disabled the Golden feature.
    const { isFeatureEnabled } = await import('../program/feature-flag.controller.js');
    const goldenOn = await isFeatureEnabled('goldenTicket');
    if (!goldenOn) {
      res.status(404).json({ message: 'This feature is not available.' });
      return;
    }
    const { readSetting } = await import('../program/app-setting.model.js');
    const [{ default: User }, cooldownHours] = await Promise.all([
      import('../auth/user.model.js'),
      readSetting('goldenCooldownHours', 48),
    ]);
    const requester = await User.findById(userId)
      .select('lastGoldenRejectionAt')
      .lean();

    // v1.65.3 — `User.lastGoldenRejectionAt` stores the END date of
    // the active cooldown (now + goldenCooldownHours at stamp time).
    // Stamped on successful Golden submission; readers use the field
    // directly. The previous "+ cooldownHours" math was a 2x bug
    // left over from when the field stored the event timestamp.
    if (cooldownHours > 0) {
      const lastRej = requester?.lastGoldenRejectionAt;
      if (lastRej && new Date(lastRej).getTime() > Date.now()) {
        const endsAt = new Date(lastRej).toISOString();
        res.status(429).json({
          message: `You are in a Golden Ticket cooldown. Try again after ${endsAt}.`,
          cooldownUntil: endsAt,
          cooldownHours,
        });
        return;
      }
    }
  }

  const rawIssueType = String(body.issueType || '').trim();
  if (!(rawIssueType in ISSUE_CONFIGS)) {
    res.status(400).json({ message: 'Please choose a valid issue type.' });
    return;
  }
  const issueType = rawIssueType as SupportIssueType;
  const config = ISSUE_CONFIGS[issueType];

  const details = String(body.details || '').trim();
  if (!details) {
    res.status(400).json({ message: 'Please describe the issue before submitting.' });
    return;
  }

  const title = String(body.title || '').trim().slice(0, 180)
    || `${config.label} — Unable to attend session`;

  const attemptedSteps = Array.isArray(body.attemptedSteps)
    ? body.attemptedSteps.map((s) => String(s).trim()).filter(Boolean).slice(0, 10)
    : [];

  const documents = Array.isArray(body.documents)
    ? body.documents
        .filter((d) => d && typeof d.url === 'string' && d.url)
        .map((d) => ({
          name: String(d.name || '').slice(0, 200),
          url:  String(d.url || '').slice(0, 1000),
          type: String(d.type || '').slice(0, 60),
        }))
        .slice(0, 4)
    : [];

  const guidanceShownAt = body.guidanceShownAt
    ? new Date(body.guidanceShownAt)
    : null;
  if (guidanceShownAt && isNaN(guidanceShownAt.getTime())) {
    res.status(400).json({ message: 'Invalid guidanceShownAt.' });
    return;
  }

  // ── Validate + coerce contextFields against the live category schema ─
  // Look up the active category so we honour admin-edits without a
  // deploy. Defaults to the hardcoded fallback if no row exists yet.
  const activeCategory = await SupportCategory.findOne({ issueType, isActive: true }).lean();
  const schemaFields: IContextField[] = (activeCategory?.fields ?? []).filter((f) => !f.archived);
  const contextFieldsInput = (body.contextFields ?? {}) as Record<string, unknown>;

  const contextFields: { key: string; label: string; value: string | number | boolean | null }[] = [];
  for (const field of schemaFields) {
    const raw = contextFieldsInput[field.key];
    const coerced = coerceContextFieldValue(field, raw);
    if (!coerced.ok) {
      res.status(400).json({ message: `Field "${field.label}": ${coerced.error}` });
      return;
    }
    if (field.required && isEmptyContextValue(coerced.value)) {
      res.status(400).json({ message: `Field "${field.label}" is required.` });
      return;
    }
    if (!isEmptyContextValue(coerced.value)) {
      contextFields.push({ key: field.key, label: field.label, value: coerced.value });
    }
  }

  try {
    // Fetch the requester's user record for denormalised name/email
    const { default: User } = await import('../auth/user.model.js');
    const requester = await User.findById(userId).select('name email').lean();
    if (!requester) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    // v1.65 — User-driven Golden Ticket submission. If the client
    // passed isGolden=true with spCost>0, debit the SP from the
    // requester's wallet BEFORE creating the request. The admin-
    // conversion flow (POST /api/support/requests/:id/convert-to-golden)
    // does the same debiting and remains available for power users.
    if (isGoldenRequested && spCostRequested > 0) {
      const { spendSpurtiPoints } = await import('../program/promotion.service.js');
      try {
        await spendSpurtiPoints(
          userId.toString(),
          spCostRequested,
          'Golden Ticket submission (user-driven)',
          // no source ticket id — request is created below
        );
      } catch (spErr) {
        res.status(400).json({
          message: (spErr as Error).message || 'Insufficient Spurti Points to submit a Golden ticket.',
        });
        return;
      }
    }

    const request = await SupportRequest.create({
      userId,
      userName: requester.name,
      userEmail: requester.email,
      issueType,
      issueLabel: activeCategory?.label ?? config.label,
      title,
      details,
      attemptedSteps,
      status: 'Pending',
      statusHistory: [{
        status: 'Pending',
        note: isGoldenRequested
          ? `Request submitted as Golden Ticket (${spCostRequested} SP invested).`
          : 'Request submitted.',
        updatedBy: userId,
        updatedByName: requester.name,
        timestamp: new Date(),
      }],
      guidanceShownAt,
      contextFields,
      // v1.65 — Golden fields. Set at create time when the user opts in.
      isGolden: isGoldenRequested,
      spCost: isGoldenRequested ? spCostRequested : 0,
      goldenConvertedAt: isGoldenRequested ? new Date() : null,
      goldenConvertedBy: isGoldenRequested ? userId : null,
      goldenConvertedByName: isGoldenRequested ? requester.name : '',
    });

    // Attach the documents (if any) as the first follow-up, so the
    // student can attach proof at submit time without the admin
    // having to request it.
    if (documents.length > 0) {
      const initialFollowUp: Partial<ISupportFollowUp> = {
        senderRole: 'student',
        senderId: userId,
        senderName: requester.name,
        message: documents.length === 1 ? 'Attached proof:' : 'Attached proofs:',
        requestProof: false,
        documents: documents as ISupportFollowUp['documents'],
      };
      request.followUps.push(initialFollowUp as ISupportFollowUp);
      await request.save();
    }

    // Notify all admins
    await fanOutToAdmins({
      title: 'New session support request',
      message: `${requester.name} reported ${config.label.toLowerCase()} and needs help attending a session.`,
      link: '/admin/support',
      metadata: {
        supportRequestId: request._id.toString(),
        issueType,
        status: 'Pending',
      },
    });

    // v1.68 — also post a notification to the configured
    // Discord channel (if the bot is enabled).
    void postNotification({
      kind: 'new_support_ticket',
      title: `🎟️  New ${isGoldenRequested ? '🏆 Golden ' : ''}support ticket`,
      description: [
        `**${requester.name}** (${userId}) opened a **${config.label}** ticket.`,
        (details ?? '').slice(0, 400),
      ].join('\n\n'),
      fields: [
        { name: 'Type', value: config.label, inline: true },
        { name: 'User', value: `<@${requester.email ?? requester.name}>\n${userId}`, inline: true },
        { name: 'Ticket ID', value: `\`${request._id.toString()}\``, inline: true },
      ],
      mentionAdmins: isGoldenRequested,
    }).catch(() => { /* never block the response */ });

    // v1.65.3 — Stamp the user-level cooldown on successful Golden
    // submission. The field stores the END date directly (now +
    // goldenCooldownHours) so readers can use it as-is. This is the
    // ONLY place the user-level cooldown is now stamped — admin
    // Resolved/Rejected no longer fires it (per the v1.65.3 spec
    // pivot: "cooldown starts at submission, blocks new ones until
    // it expires"). `requester` (selected from User above) carries
    // the cooldown end on the request, so admins can see when the
    // user becomes eligible again.
    if (isGoldenRequested) {
      const { readSetting } = await import('../program/app-setting.model.js');
      const cooldownHours = await readSetting('goldenCooldownHours', 48);
      if (cooldownHours > 0) {
        await User.updateOne(
          { _id: userId },
          { $set: { lastGoldenRejectionAt: new Date(Date.now() + cooldownHours * 60 * 60 * 1000) } }
        );
      }
    }

    res.status(201).json({ request: stripAdminOnlyFields(request.toObject(), false) });
  } catch (err) {
    supportLog.error(`[support] createSupportRequest failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to submit support request.' });
  }
}

// ─── List + get requests ──────────────────────────────────────────────────

/**
 * GET /api/support/requests
 * List own requests; admin/moderator sees all with filters.
 * Gated by flag.
 */
export async function listSupportRequests(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const isAdmin = getAuthedUserRole(req) === 'admin' || getAuthedUserRole(req) === 'moderator';

  try {
    const { status, issueType, q, userName, email, from, to, isGolden } = req.query as Record<string, string | undefined>;
    // v1.69 — Phase 3c: scope by program. Admins see all tickets in
    // the active program; users see only their own within the program.
    const baseFilter: Record<string, unknown> = isAdmin ? {} : { userId };
    const filter = withCurrentProgram(baseFilter, req.programContext);
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? (isAdmin ? '25' : '20'))) || (isAdmin ? 25 : 20)));
    const skip = (page - 1) * limit;

    if (status && VALID_STATUSES.includes(status as SupportStatus)) {
      filter.status = status;
    }
    if (issueType && issueType in ISSUE_CONFIGS) {
      filter.issueType = issueType;
    }
    // v1.65 — Golden Ticket inbox filter. Admin-only by design; a
    // student querying their own list will never see another user's
    // tickets anyway because the `userId` filter is already in
    // place, and the compound index `{ userId, isGolden, createdAt }`
    // keeps this fast. Accepts 'true' / 'false' / '1' / '0'.
    // v1.66 — Golden tickets now live in /api/admin/golden-tickets
    // (their own section). Default to hiding them from the Support
    // inbox unless the admin explicitly opts in via isGolden=true.
    if (isAdmin && (isGolden === 'true' || isGolden === '1')) {
      filter.isGolden = true;
    } else if (isAdmin && (isGolden === 'false' || isGolden === '0')) {
      filter.isGolden = false;
    } else if (isAdmin) {
      // No explicit filter from admin → exclude Golden by default.
      // Students still see all of their own (they only have their
      // userId in the filter and might be a Golden ticket owner).
      filter.isGolden = { $ne: true };
    }
    if (q) {
      const regex = new RegExp(escapeRegex(q).slice(0, 120), 'i');
      filter.$or = [
        { userName: regex },
        { userEmail: regex },
        { title: regex },
        { details: regex },
        { adminNote: regex },
        { resolutionSummary: regex },
      ];
    }
    if (isAdmin && userName) {
      filter.userName = new RegExp(escapeRegex(userName).slice(0, 80), 'i');
    }
    if (isAdmin && email) {
      filter.userEmail = new RegExp(escapeRegex(email).slice(0, 120), 'i');
    }
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;
      if (fromDate && !isNaN(fromDate.getTime())) createdAt.$gte = fromDate;
      if (toDate && !isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        createdAt.$lte = toDate;
      }
      if (Object.keys(createdAt).length) filter.createdAt = createdAt;
    }

    const [total, requests, statusRows, issueRows, recentRows] = await Promise.all([
      SupportRequest.countDocuments(filter),
      SupportRequest.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean(),
      SupportRequest.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      SupportRequest.aggregate([
        { $match: filter },
        { $group: { _id: '$issueType', count: { $sum: 1 } } },
      ]),
      SupportRequest.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(5)
        .select('userId userName issueType status createdAt updatedAt')
        .lean(),
    ]);

    const statusCounts = statusRows.reduce<Record<string, number>>((acc, r) => {
      acc[r._id] = r.count;
      return acc;
    }, {});
    const issueTypeCounts = issueRows.reduce<Record<string, number>>((acc, r) => {
      acc[r._id] = r.count;
      return acc;
    }, {});

    const byStatus = VALID_STATUSES.reduce<Record<string, number>>((acc, s) => {
      acc[s] = statusCounts[s] ?? 0;
      return acc;
    }, {});
    const byIssueType = Object.keys(ISSUE_CONFIGS).reduce<Record<string, number>>((acc, k) => {
      acc[k] = issueTypeCounts[k] ?? 0;
      return acc;
    }, {});

    const unresolved = (byStatus['Pending'] ?? 0) + (byStatus['In Review'] ?? 0) + (byStatus['Rejected'] ?? 0);

    res.json({
      requests: requests.map((r) => stripAdminOnlyFields(r, isAdmin)),
      summary: {
        total,
        unresolvedCount: unresolved,
        byStatus,
        byIssueType,
        recent: recentRows,
      },
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      issueOptions: Object.entries(ISSUE_CONFIGS).map(([key, value]) => ({
        key,
        label: value.label,
        shortLabel: value.shortLabel,
      })),
    });
  } catch (err) {
    supportLog.error(`[support] listSupportRequests failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load support requests.' });
  }
}

/**
 * GET /api/support/requests/:id
 * Get one. Students see only their own. Admin sees any.
 * Gated by flag.
 */
export async function getSupportRequest(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const role = getAuthedUserRole(req);
  const isAdmin = role === 'admin' || role === 'moderator';

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid request id.' });
    return;
  }

  try {
    const request = await SupportRequest.findById(id).lean();
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    // v1.69 — Phase 3c: if a program context is attached, enforce it.
    // Admins can still see across programs, but only if they didn't
    // arrive via a program-scoped route.
    const programContext = req.programContext;
    if (programContext && !isAdmin) {
      const ticketBatch = (request as { batchId?: Types.ObjectId | string | null }).batchId;
      if (!ticketBatch || ticketBatch.toString() !== programContext.batchId) {
        res.status(404).json({ message: 'Support request not found.' });
        return;
      }
    }
    if (!isAdmin && request.userId.toString() !== userId.toString()) {
      // Don't leak existence — return 404, not 403
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    res.json({ request: stripAdminOnlyFields(request, isAdmin) });
  } catch (err) {
    supportLog.error(`[support] getSupportRequest failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load support request.' });
  }
}

// ─── Self-delete (student removes their own ticket) ─────────────────────────
//
// v1.65 — Golden Ticket spec asks for a self-delete flow with a
// cooldown. Rules:
//   1. The requester may only delete their OWN ticket (admins still
//      use the existing admin moderation flow).
//   2. The ticket must still be in a pre-acknowledged state
//      ('Pending' or 'open'). Once the admin has moved it to 'In
//      Review', 'Resolved', 'Rejected', or 'closed', self-delete is
//      refused — the work has begun and the audit trail must stay.
//   3. The ticket must be <= 10 minutes old. After that window the
//      student must contact support to remove it. Prevents the
//      "submit → sit on it → delete once you regret it" abuse path.
//   4. If the ticket is Golden, any SP already debited is refunded
//      through the existing `refundSpurtiPoints` helper.

const SELF_DELETE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * DELETE /api/support/requests/:id
 * Student self-deletes their own ticket. Cooldowns + state guards
 * are applied. Admin can still use any other path to remove a ticket
 * — this endpoint is student-only.
 */
export async function selfDeleteSupportRequest(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid request id.' });
    return;
  }

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    if (request.userId.toString() !== userId.toString()) {
      // Don't leak existence.
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }

    // State guard: pre-acknowledged only.
    if (request.status !== 'Pending' && request.status !== 'open') {
      res.status(409).json({
        message: `Cannot self-delete a ticket in status '${request.status}'. Contact support if you need this ticket removed.`,
      });
      return;
    }

    // Cooldown: 10 minutes from creation.
    const ageMs = Date.now() - new Date(request.createdAt).getTime();
    if (ageMs > SELF_DELETE_WINDOW_MS) {
      res.status(409).json({
        message: `Self-delete window has expired (tickets are self-deletable for ${SELF_DELETE_WINDOW_MS / 60000} minutes after creation). Contact support to remove the ticket.`,
      });
      return;
    }

    // Refund any SP that was debited when the ticket was converted to
    // Golden. The helper throws on failure (e.g. user already gone)
    // — log and continue with the delete so the ticket state stays
    // consistent; admin can re-credit via /award-sp if needed.
    if (request.isGolden && request.spCost > 0) {
      try {
        const { refundSpurtiPoints } = await import('../program/promotion.service.js');
        await refundSpurtiPoints(
          request.userId.toString(),
          request.spCost,
          'Self-delete of Golden ticket; SP refund',
          request._id,
        );
      } catch (refundErr) {
        supportLog.warn(`[support] self-delete refund failed: ${(refundErr as Error).message}`);
      }
    }

    await SupportRequest.deleteOne({ _id: request._id });

    // Notify admins so the audit trail is complete (e.g. a flood of
    // self-deletes looks like abuse on the admin analytics page).
    try {
      const { fanOutToAdmins } = await import('./support-core.controller.js');
      await fanOutToAdmins({
        title: 'Support request self-deleted',
        message: `A user self-deleted their support request (${request.issueLabel}).`,
        link: '/admin/support',
        metadata: {
          supportRequestId: request._id.toString(),
          issueType: request.issueType,
          status: 'self_deleted',
          isGolden: request.isGolden,
          spCost: request.spCost,
        },
      });
    } catch (notifyErr) {
      supportLog.warn(`[support] self-delete admin notify failed: ${(notifyErr as Error).message}`);
    }

    res.json({ deleted: true, refundedSp: request.isGolden ? request.spCost : 0 });
  } catch (err) {
    supportLog.error(`[support] selfDeleteSupportRequest failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to self-delete support request.' });
  }
}
