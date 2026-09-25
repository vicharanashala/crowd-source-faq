/**
 * login-staff-gate.test — 2026-09-25 incident follow-up.
 *
 * CSFAQ's own /login must now reject correct-password logins for
 * non-staff accounts (students must come exclusively through the
 * Samagama SSO bridge), while never blocking admin/moderator/
 * ai_moderator staff.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Request, Response } from 'express';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('no db');
  await db.collection('yaksha_faq_users').deleteMany({});
  await db.collection('refreshtokens').deleteMany({});
});

const { default: User } = await import('../user.model.js');
const { login } = await import('../auth.controller.js');

function mockRes() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq(email: string, password: string): Request {
  return {
    body: { email, password },
    headers: {},
  } as unknown as Request;
}

const PASSWORD = 'correct-horse-battery-staple-1!';

describe('login — staff-only gate', () => {
  it('blocks a correct-password login for a plain student account (role: user)', async () => {
    await User.create({ name: 'Student', email: 'student@example.com', password: PASSWORD, role: 'user' });
    const req = mockReq('student@example.com', PASSWORD);
    const res = mockRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/samagama/i) })
    );
  });

  it('allows a correct-password login for an admin', async () => {
    await User.create({ name: 'Admin', email: 'admin@example.com', password: PASSWORD, role: 'admin' });
    const req = mockReq('admin@example.com', PASSWORD);
    const res = mockRes();
    await login(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.any(String) })
    );
  });

  it('allows a correct-password login for a moderator', async () => {
    await User.create({ name: 'Mod', email: 'mod@example.com', password: PASSWORD, role: 'moderator' });
    const req = mockReq('mod@example.com', PASSWORD);
    const res = mockRes();
    await login(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.any(String) })
    );
  });

  it('allows a correct-password login for an ai_moderator', async () => {
    await User.create({ name: 'Bot Mod', email: 'aimod@example.com', password: PASSWORD, role: 'ai_moderator' });
    const req = mockReq('aimod@example.com', PASSWORD);
    const res = mockRes();
    await login(req, res);
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.any(String) })
    );
  });

  it('still returns generic invalid-credentials for a wrong password on a student account (does not leak role)', async () => {
    await User.create({ name: 'Student', email: 'student2@example.com', password: PASSWORD, role: 'user' });
    const req = mockReq('student2@example.com', 'totally-wrong-password');
    const res = mockRes();
    await login(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid email or password.' })
    );
  });
});
