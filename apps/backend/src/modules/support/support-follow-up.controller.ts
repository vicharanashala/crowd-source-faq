/**
 * supportFollowUpController.ts — Follow-up messages and status changes
 * for Session Support tickets.
 *
 * Routes (from routes/support.ts):
 *   POST  /api/support/requests/:id/follow-ups    (user/admin, rate-limited, gated by flag)
 *   PATCH /api/support/requests/:id/status        (admin, gated by flag)
 *
 * Each follow-up notification also goes to AdminLog via supportCore.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import SupportRequest, {
  type ISupportFollowUp,
  type SupportStatus,
} from './support-request.model.js';
import { supportLog } from '../../utils/http/logger.js';
import {
  VALID_STATUSES,
  getAuthedUserId,
  getAuthedUserRole,
  stripAdminOnlyFields,
  fanOutToAdmins,
  notifyUser,
  logAdminAction,
  requireFeatureOn,
  supportTicketLink,
} from './support-core.controller.js';

function asStringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * POST /api/support/requests/:id/follow-ups
 * Add a follow-up message. Students can reply on their own tickets;
 * admins can reply on any. Gated by flag.
 */
export async function addSupportFollowUp(req: Request, res: Response): Promise<void> {
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

  const body = (req.body ?? {}) as {
    message?: string;
    documents?: { name?: string; url?: string; type?: string }[];
    requestProof?: boolean;
  };
  const message = String(body.message || '').trim();
  if (!message) {
    res.status(400).json({ message: 'Follow-up message cannot be empty.' });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ message: 'Follow-up message is too long.' });
    return;
  }

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

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    if (!isAdmin && request.userId.toString() !== userId.toString()) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }

    const { default: User } = await import('../auth/user.model.js');
    const sender = await User.findById(userId).select('name').lean();
    if (!sender) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    const senderRole = isAdmin ? 'admin' : 'student';
    const requestProof = isAdmin && Boolean(body.requestProof);

    request.followUps.push({
      senderRole,
      senderId: userId,
      senderName: sender.name,
      message,
      requestProof,
      documents: documents as ISupportFollowUp['documents'],
      createdAt: new Date(),
    } as ISupportFollowUp);
    await request.save();

    // Notify the *other* side
    if (isAdmin) {
      await notifyUser(request.userId, {
        title: 'New reply on your support request',
        message: message.slice(0, 200),
        link: supportTicketLink(request),
        metadata: {
          supportRequestId: request._id.toString(),
          issueType: request.issueType,
          status: request.status,
          requestProof,
        },
      });
      await logAdminAction(userId, sender.name, 'support_follow_up', request._id, message.slice(0, 200));
    } else {
      await fanOutToAdmins({
        title: 'Student reply on support request',
        message: message.slice(0, 200),
        link: '/admin/support/' + request._id.toString(),
        metadata: {
          supportRequestId: request._id.toString(),
          issueType: request.issueType,
          status: request.status,
        },
      });
    }

    res.json({ request: stripAdminOnlyFields(request.toObject(), isAdmin) });
  } catch (err) {
    supportLog.error(`[support] addSupportFollowUp failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to add follow-up.' });
  }
}

/**
 * PATCH /api/support/requests/:id/status
 * Admin-only. Change status, add notes, attach session access URL.
 * Gated by flag.
 */
export async function updateSupportStatus(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid request id.' });
    return;
  }

  const body = (req.body ?? {}) as {
    status?: string;
    adminNote?: string;
    internalNote?: string;
    resolutionSummary?: string;
    sessionAccessUrl?: string;
    followUpMessage?: string;
    requestProof?: boolean;
  };
  const nextStatus = String(body.status || '').trim() as SupportStatus;
  if (!VALID_STATUSES.includes(nextStatus)) {
    res.status(400).json({ message: 'Invalid status value.' });
    return;
  }

  if (nextStatus === 'Rejected' && !String(body.adminNote || '').trim()) {
    res.status(400).json({ message: 'An admin note is required when rejecting a request.' });
    return;
  }

  const adminNote = String(body.adminNote || '').trim().slice(0, 2000);
  const internalNote = String(body.internalNote || '').trim().slice(0, 2000);
  const resolutionSummary = String(body.resolutionSummary || '').trim().slice(0, 2000);
  const sessionAccessUrl = String(body.sessionAccessUrl || '').trim().slice(0, 500);
  const followUpMessage = String(body.followUpMessage || '').trim().slice(0, 2000);
  const requestProof = Boolean(body.requestProof);

  try {
    const request = await SupportRequest.findById(id);
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    if (request.status === nextStatus) {
      res.status(409).json({ message: `Request is already in status '${nextStatus}'.` });
      return;
    }

    const { default: User } = await import('../auth/user.model.js');
    const admin = await User.findById(userId).select('name').lean();
    if (!admin) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    // v1.65.1 — Golden Ticket cooldown. Stamped on BOTH admin
    // resolution AND admin rejection (one unified rule, not a
    // punishment). The previous version also deducted an SP penalty
    // on rejection (default 1.25x) and stamped a 72h ban; both
    // have been removed per the new spec ("cooldown only, never
    // ban, never deduct beyond the SP spend"). The cooldown
    // duration is configurable via `goldenCooldownHours` (default
    // 48). 0 disables the gate entirely.
    let goldenRejectionEndsAt: Date | null = null;
    if ((nextStatus === 'Rejected' || nextStatus === 'Resolved') && request.isGolden) {
      const { readSetting } = await import('../program/app-setting.model.js');
      const cooldownHours = await readSetting('goldenCooldownHours', 48);
      if (cooldownHours > 0) {
        goldenRejectionEndsAt = new Date(Date.now() + cooldownHours * 60 * 60 * 1000);
      }
    }

    request.status = nextStatus;
    request.adminNote = adminNote || request.adminNote;
    if (goldenRejectionEndsAt) {
      request.goldenRejectionReason = adminNote || '';
      request.goldenRejectionEndsAt = goldenRejectionEndsAt;
    }
    if (internalNote) {
      request.internalNotes.push({
        note: internalNote,
        addedBy: userId,
        addedByName: admin.name,
        createdAt: new Date(),
      });
    }
    if (resolutionSummary) request.resolutionSummary = resolutionSummary;
    if (sessionAccessUrl) request.sessionAccessUrl = sessionAccessUrl;
    if (followUpMessage) {
      request.followUps.push({
        senderRole: 'admin',
        senderId: userId,
        senderName: admin.name,
        message: followUpMessage,
        requestProof,
        documents: [],
        createdAt: new Date(),
      } as ISupportFollowUp);
    }
    request.statusHistory.push({
      status: nextStatus,
      note: adminNote || resolutionSummary || `Status changed to ${nextStatus}.`,
      updatedBy: userId,
      updatedByName: admin.name,
      timestamp: new Date(),
    });
    request.updatedAt = new Date();
    await request.save();

    // v1.65.3 — The user-level cooldown is no longer stamped on
    // admin Resolved/Rejected. Per the spec pivot, the cooldown
    // starts at SUBMISSION (set in createSupportRequest), so the
    // admin closing a ticket is a no-op for the user's cooldown
    // state. We keep the per-ticket `goldenRejectionEndsAt` /
    // `goldenRejectionReason` writes above for any future admin-UI
    // display of "when this ticket closed" but no longer mirror
    // them onto the user record.

    // Notify the student
    // v1.65: status enum extended with 'open' and 'closed'. The two new
    // states are reachable via admin transitions (Golden Ticket flow);
    // user-facing copy is added so the Record<SupportStatus, string>
    // typecheck still passes and notifications are never undefined.
    const titleByStatus: Record<SupportStatus, string> = {
      'Pending':   'Your support request was reopened',
      'In Review': 'Your support request is under review',
      'Resolved':  'Your support request was resolved',
      'Rejected':  'Your support request was rejected',
      'open':      'Your support request was opened by the support team',
      'closed':    'Your support request was closed',
    };
    const baseMsg = nextStatus === 'Resolved' && request.sessionAccessUrl
      ? 'Your request was approved and the recorded session is available now.'
      : nextStatus === 'Resolved'
      ? 'Your request was approved. The recorded session link will appear once shared by the admin team.'
      : nextStatus === 'Rejected'
      ? 'Your request was reviewed and marked rejected. Please check the admin note for details.'
      : 'Your request is being reviewed by the support team.';
    await notifyUser(request.userId, {
      title: titleByStatus[nextStatus],
      message: baseMsg,
      link: supportTicketLink(request),
      metadata: {
        supportRequestId: request._id.toString(),
        issueType: request.issueType,
        status: nextStatus,
        sessionAccessUrl: request.sessionAccessUrl || '',
      },
    });
    await logAdminAction(
      userId,
      admin.name,
      'support_status_change',
      request._id,
      `Status: ${nextStatus}${adminNote ? ` | Note: ${adminNote.slice(0, 100)}` : ''}`,
    );
    if (sessionAccessUrl) {
      await logAdminAction(
        userId,
        admin.name,
        'recorded_session_attached',
        request._id,
        `Recorded session URL attached on ${nextStatus}`,
      );
    }

    res.json({ request: stripAdminOnlyFields(request.toObject(), true) });
  } catch (err) {
    supportLog.error(`[support] updateSupportStatus failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to update support request.' });
  }
}
