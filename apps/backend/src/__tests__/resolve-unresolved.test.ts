import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock UnresolvedSearch model before importing controller ────────────────
const mockSave = vi.fn().mockResolvedValue(undefined);
const mockDoc = {
  _id: '507f1f77bcf86cd799439011',
  query: 'How do I reset my password?',
  faqId: null,
  userId: null,
  feedback: 'Could not find relevant FAQ',
  status: 'pending' as const,
  resolution: null,
  resolvedBy: null,
  save: mockSave,
};

vi.mock('../modules/search/unresolved-search.model.js', () => ({
  default: {
    findById: vi.fn(),
  },
}));

// We don't need the FAQ model in these tests — stub it out so
// the import in the controller doesn't try to register a real schema.
vi.mock('../modules/faq/faq.model.js', () => ({
  default: {},
}));

import UnresolvedSearch from '../modules/search/unresolved-search.model.js';
import { resolveUnresolved } from '../modules/search/unresolved-search.controller.js';

// ── Helpers ────────────────────────────────────────────────────────────────
function createReq(params: Record<string, string>, body: Record<string, unknown>): Request {
  return {
    params,
    body,
    user: { _id: 'admin_user_id_123456789012' },
  } as unknown as Request;
}

function createRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { json, status } as unknown as Response, json, status };
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('resolveUnresolved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock doc to clean state
    mockDoc.status = 'pending';
    mockDoc.resolution = null;
    mockDoc.resolvedBy = null;
    mockDoc.faqId = null;
  });

  it('persists faqId when resolution is faq_updated and faqId is provided', async () => {
    (UnresolvedSearch.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockDoc);

    const faqId = '60d21b4667d0d8992e610c85';
    const req = createReq({ id: mockDoc._id }, { resolution: 'faq_updated', faqId });
    const { res } = createRes();

    await resolveUnresolved(req, res);

    expect(mockDoc.faqId).toBe(faqId);
    expect(mockDoc.status).toBe('addressed');
    expect(mockDoc.resolution).toBe('faq_updated');
    expect(mockSave).toHaveBeenCalledOnce();
  });

  it('does not set faqId when faqId is not provided', async () => {
    (UnresolvedSearch.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockDoc);

    const req = createReq({ id: mockDoc._id }, { resolution: 'faq_updated' });
    const { res } = createRes();

    await resolveUnresolved(req, res);

    expect(mockDoc.faqId).toBeNull();
    expect(mockDoc.status).toBe('addressed');
    expect(mockDoc.resolution).toBe('faq_updated');
    expect(mockSave).toHaveBeenCalledOnce();
  });

  it('ignores faqId in body when resolution is dismissed', async () => {
    (UnresolvedSearch.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockDoc);

    const faqId = '60d21b4667d0d8992e610c85';
    const req = createReq({ id: mockDoc._id }, { resolution: 'dismissed', faqId });
    const { res } = createRes();

    await resolveUnresolved(req, res);

    expect(mockDoc.faqId).toBeNull();
    expect(mockDoc.status).toBe('addressed');
    expect(mockDoc.resolution).toBe('dismissed');
    expect(mockSave).toHaveBeenCalledOnce();
  });

  it('returns 404 when unresolved entry is not found', async () => {
    (UnresolvedSearch.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = createReq({ id: 'nonexistent_id_1234567890' }, { resolution: 'faq_updated' });
    const { res, status, json } = createRes();

    await resolveUnresolved(req, res);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ message: 'Not found' });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('returns 400 when resolution is missing', async () => {
    const req = createReq({ id: mockDoc._id }, {});
    const { res, status, json } = createRes();

    await resolveUnresolved(req, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ message: 'resolution is required' });
    expect(mockSave).not.toHaveBeenCalled();
  });
});
