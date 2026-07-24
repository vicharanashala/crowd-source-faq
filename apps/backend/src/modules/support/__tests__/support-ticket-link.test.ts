/**
 * support-ticket-link.test.ts — unit tests for `supportTicketLink`,
 * the tiny helper that decides whether the in-app bell should
 * deep-link to /golden/ticket/:id or /support/:id.
 *
 * Why this test exists:
 *   Several notification fan-out sites in the support module use
 *   this helper to build the `link` they hand to `notifyUser` /
 *   `fanOutToAdmins`. The bell click navigates to whatever string
 *   ends up in `Notification.link`, so a misfire here means the
 *   user clicks "Your ticket was promoted to Golden" and lands on
 *   the generic /support/:id page — which does NOT render
 *   goldenResolutions[] (the v1.73 page that does is
 *   /golden/ticket/:id). This regression guard locks the routing
 *   contract: golden tickets always go through the golden thread.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { isGoldenTicket, supportTicketLink } from '../support-core.controller.js';

vi.mock('../auth/user.model.js', () => ({
  default: {
    find: vi.fn(async () => []),
  },
}));

vi.mock('../notification/notification.model.js', () => ({
  default: {
    insertMany: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
  },
}));

vi.mock('../../../utils/http/logger.js', () => ({
  supportLog: { warn: (): void => undefined, error: (): void => undefined },
}));

describe('supportTicketLink', () => {
  beforeEach(() => {
    // Nothing to reset — these are pure functions of their input.
  });

  it('routes golden tickets through /golden/ticket/:id', () => {
    const id = new Types.ObjectId('0000000000000000000000aa');
    expect(supportTicketLink({ _id: id, isGolden: true })).toBe(
      '/golden/ticket/0000000000000000000000aa'
    );
  });

  it('routes non-golden tickets through /support/:id', () => {
    const id = new Types.ObjectId('0000000000000000000000bb');
    expect(supportTicketLink({ _id: id, isGolden: false })).toBe(
      '/support/0000000000000000000000bb'
    );
  });

  it('defaults to /support/:id when isGolden is missing (legacy docs)', () => {
    const id = new Types.ObjectId('0000000000000000000000cc');
    expect(supportTicketLink({ _id: id })).toBe('/support/0000000000000000000000cc');
  });

  it('returns "#" for null/undefined ticket (defensive — no 500s)', () => {
    expect(supportTicketLink(null)).toBe('#');
    expect(supportTicketLink(undefined)).toBe('#');
  });

  it('coerces a string _id to the same shape', () => {
    expect(supportTicketLink({ _id: '0000000000000000000000dd', isGolden: true })).toBe(
      '/golden/ticket/0000000000000000000000dd'
    );
  });

  it('is consistent with the isGoldenTicket predicate (no drift)', () => {
    // The helper is implemented as a thin wrapper over isGoldenTicket.
    // Pin that contract so a future refactor of either function can't
    // accidentally route golden tickets to /support/:id.
    const id = new Types.ObjectId();
    for (const flag of [true, false, undefined]) {
      const ticket: { _id: Types.ObjectId; isGolden?: boolean } = { _id: id, isGolden: flag };
      const expected = isGoldenTicket(ticket)
        ? `/golden/ticket/${id.toString()}`
        : `/support/${id.toString()}`;
      expect(supportTicketLink(ticket)).toBe(expected);
    }
  });
});
