import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { getSummary } from '../controllers/analyticsController.js';
import FAQ from '../models/FAQ.js';
import SearchLog from '../models/SearchLog.js';

function createResponse() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { response: { status, json } as unknown as Response, status, json };
}

describe('analyticsController - batchId query parameter validation & NoSQL Injection protection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an invalid batchId string with 400', async () => {
    const req = {
      user: { role: 'admin' },
      query: { batchId: 'invalid-id-123' }
    } as unknown as Request;

    const { response, status, json } = createResponse();

    await getSummary(req, response);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Invalid batchId')
      })
    );
  });

  it('rejects an array-valued batchId query parameter with 400', async () => {
    const req = {
      user: { role: 'admin' },
      query: { batchId: ['60b9f000000000000000008a', '60b9f000000000000000008b'] }
    } as unknown as Request;

    const { response, status, json } = createResponse();

    await getSummary(req, response);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('parameter must be a single string')
      })
    );
  });

  it('rejects an object-valued NoSQL injection batchId query parameter with 400', async () => {
    const req = {
      user: { role: 'admin' },
      query: { batchId: { $ne: null } }
    } as unknown as Request;

    const { response, status, json } = createResponse();

    await getSummary(req, response);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('parameter must be a single string')
      })
    );
  });

  it('accepts a valid 24-character hexadecimal ObjectId and proceeds to query', async () => {
    const validObjectId = '507f1f77bcf86cd799439011';
    const req = {
      user: { role: 'admin' },
      query: { batchId: validObjectId }
    } as unknown as Request;

    const { response, status, json } = createResponse();

    vi.spyOn(FAQ, 'countDocuments').mockResolvedValue(0);
    vi.spyOn(SearchLog, 'countDocuments').mockResolvedValue(0);
    vi.spyOn(SearchLog, 'aggregate').mockResolvedValue([]);

    await getSummary(req, response);

    expect(status).not.toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalFaqs: 0,
        approvedFaqs: 0,
        uniqueUsers: 0
      })
    );
  });
});
