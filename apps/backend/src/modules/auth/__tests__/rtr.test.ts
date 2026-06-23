import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { refresh } from '../auth.controller.js';
import RefreshToken from '../refresh-token.model.js';

// Mock the model
vi.mock('../refresh-token.model.js', () => {
  return {
    default: {
      findOne: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
});

// Helper for hashing
const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

describe('Refresh Token Rotation (RTR)', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let statusMock: any;
  let jsonMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test_jwt_secret_key';
    process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_key';

    jsonMock = vi.fn();
    statusMock = vi.fn(() => ({ json: jsonMock }));
    res = {
      status: statusMock,
      json: jsonMock,
    };
    req = {
      body: {},
      headers: {},
      ip: '127.0.0.1',
    };
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
  });

  it('should return 400 if no refreshToken is provided', async () => {
    req.body = {};
    await refresh(req as Request, res as Response);
    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ message: 'Refresh token is required.' });
  });

  it('should return 401 if refresh token verification fails (invalid token)', async () => {
    req.body = { refreshToken: 'invalid.token.here' };
    await refresh(req as Request, res as Response);
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ message: 'Invalid or expired refresh token.' });
  });

  it('should return 401 if refresh token is valid but not found in database', async () => {
    const secret = 'test_jwt_refresh_secret_key';
    const token = jwt.sign({ id: 'user123', jti: 'jti123' }, secret, { expiresIn: '1d' });
    req.body = { refreshToken: token };

    vi.mocked(RefreshToken.findOne).mockResolvedValue(null);

    await refresh(req as Request, res as Response);
    expect(RefreshToken.findOne).toHaveBeenCalledWith({ tokenHash: hashToken(token) });
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({ message: 'Invalid refresh token.' });
  });

  it('should rotate the token if it is valid and active', async () => {
    const userId = new mongoose.Types.ObjectId();
    const secret = 'test_jwt_refresh_secret_key';
    const token = jwt.sign({ id: userId.toString(), jti: 'jti123' }, secret, { expiresIn: '1d' });
    req.body = { refreshToken: token };

    const tokenRecordSave = vi.fn();
    const mockTokenRecord = {
      tokenHash: hashToken(token),
      userId,
      jti: 'jti123',
      revoked: false,
      save: tokenRecordSave,
    };

    vi.mocked(RefreshToken.findOne).mockResolvedValue(mockTokenRecord as any);
    vi.mocked(RefreshToken.create).mockResolvedValue({} as any);

    await refresh(req as Request, res as Response);

    // Verifies that it marked the old token as revoked
    expect(mockTokenRecord.revoked).toBe(true);
    expect(tokenRecordSave).toHaveBeenCalled();

    // Verifies a new refresh token record was created
    expect(RefreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        revoked: false,
      })
    );

    // Expects response with both new access token and refresh token
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.any(String),
        refreshToken: expect.any(String),
      })
    );
  });

  it('should detect a breach and revoke all tokens when a reused (already revoked) token is presented', async () => {
    const userId = new mongoose.Types.ObjectId();
    const secret = 'test_jwt_refresh_secret_key';
    const token = jwt.sign({ id: userId.toString(), jti: 'jti123' }, secret, { expiresIn: '1d' });
    req.body = { refreshToken: token };

    const mockTokenRecord = {
      tokenHash: hashToken(token),
      userId,
      jti: 'jti123',
      revoked: true,
    };

    vi.mocked(RefreshToken.findOne).mockResolvedValue(mockTokenRecord as any);

    await refresh(req as Request, res as Response);

    // Expects breach detection to delete all user tokens
    expect(RefreshToken.deleteMany).toHaveBeenCalledWith({ userId });
    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({ message: 'Session breach detected. Please log in again.' });
  });
});
