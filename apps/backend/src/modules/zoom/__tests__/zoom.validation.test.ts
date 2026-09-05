import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';

// Mock auth middleware to let everything pass through
vi.mock('../../../middleware/auth.js', () => ({
  protect: (_req: unknown, _res: unknown, next: () => void) => next(),
  authorize:
    (..._roles: string[]) =>
    (_req: unknown, _res: unknown, next: () => void) =>
      next(),
}));

// Mock the controllers so we do not hit database or external services
vi.mock('../zoom-auth.controller.js', () => ({
  connectZoom: (_req: any, res: any) => res.json({ ok: true }),
  callbackZoom: (_req: any, res: any) => res.json({ ok: true }),
  disconnectZoom: (_req: any, res: any) => res.json({ ok: true }),
  zoomStatus: (_req: any, res: any) => res.json({ ok: true }),
  getZoomDiagnostics: (_req: any, res: any) => res.json({ ok: true }),
  adminBackfill: (_req: any, res: any) => res.json({ ok: true }),
}));

vi.mock('../zoom.controller.js', () => ({
  handleZoomChallenge: (_req: any, res: any) => res.json({ ok: true }),
  handleZoomWebhook: (_req: any, res: any) => res.json({ ok: true }),
  listMeetings: (_req: any, res: any) => res.json({ ok: true }),
  getMeeting: (_req: any, res: any) => res.json({ ok: true }),
  listInsights: (_req: any, res: any) => res.json({ ok: true }),
  updateInsight: (_req: any, res: any) => res.json({ ok: true }),
  getZoomHealthStatus: (_req: any, res: any) => res.json({ ok: true }),
  getZoomPublicStats: (_req: any, res: any) => res.json({ ok: true }),
  convertInsightToFAQ: (_req: any, res: any) => res.json({ ok: true }),
  uploadTranscript: (_req: any, res: any) => res.json({ ok: true }),
  getMeetingProgress: (_req: any, res: any) => res.json({ ok: true }),
  listDeadLetterMeetings: (_req: any, res: any) => res.json({ ok: true }),
  retryMeeting: (_req: any, res: any) => res.json({ ok: true }),
}));

vi.mock('../../program/program-zoom.controller.js', () => ({
  getProgramZoomConfigRoute: (_req: any, res: any) => res.json({ ok: true }),
  upsertProgramZoomConfig: (_req: any, res: any) => res.json({ ok: true }),
  disconnectProgramZoom: (_req: any, res: any) => res.json({ ok: true }),
}));

import zoomRoutes from '../zoom.routes.js';
import programZoomRoutes from '../../program/program-zoom.routes.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());

  // Register routers
  app.use('/zoom', zoomRoutes);
  app.use('/admin/programs', programZoomRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  if (addr && typeof addr === 'object') {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  } else {
    throw new Error('Could not get test server address');
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Zoom Routes ObjectId Validation Integration Tests', () => {
  const validId = '64f0a1b2c3d4e5f6a7b8c9d0';
  const invalidId = 'invalid-id-123';

  // 1. GET /zoom/meetings/:id
  it('GET /zoom/meetings/:id returns 200 for valid ObjectId and 400 for invalid ObjectId', async () => {
    const resValid = await fetch(`${baseUrl}/zoom/meetings/${validId}`);
    expect(resValid.status).toBe(200);

    const resInvalid = await fetch(`${baseUrl}/zoom/meetings/${invalidId}`);
    expect(resInvalid.status).toBe(400);
    const body = (await resInvalid.json()) as { message?: string };
    expect(body.message).toContain('Invalid id');
  });

  // 2. GET /zoom/meetings/:id/progress
  it('GET /zoom/meetings/:id/progress returns 200 for valid ObjectId and 400 for invalid ObjectId', async () => {
    const resValid = await fetch(`${baseUrl}/zoom/meetings/${validId}/progress`);
    expect(resValid.status).toBe(200);

    const resInvalid = await fetch(`${baseUrl}/zoom/meetings/${invalidId}/progress`);
    expect(resInvalid.status).toBe(400);
    const body = (await resInvalid.json()) as { message?: string };
    expect(body.message).toContain('Invalid id');
  });

  // 3. POST /zoom/meetings/:id/retry
  it('POST /zoom/meetings/:id/retry returns 200 for valid ObjectId and 400 for invalid ObjectId', async () => {
    const resValid = await fetch(`${baseUrl}/zoom/meetings/${validId}/retry`, { method: 'POST' });
    expect(resValid.status).toBe(200);

    const resInvalid = await fetch(`${baseUrl}/zoom/meetings/${invalidId}/retry`, {
      method: 'POST',
    });
    expect(resInvalid.status).toBe(400);
    const body = (await resInvalid.json()) as { message?: string };
    expect(body.message).toContain('Invalid id');
  });

  // 4. GET /zoom/insights?meetingId=...
  it('GET /zoom/insights returns 200 when query parameter meetingId is valid or omitted, and 400 when invalid', async () => {
    const resOmitted = await fetch(`${baseUrl}/zoom/insights`);
    expect(resOmitted.status).toBe(200);

    const resValid = await fetch(`${baseUrl}/zoom/insights?meetingId=${validId}`);
    expect(resValid.status).toBe(200);

    const resInvalid = await fetch(`${baseUrl}/zoom/insights?meetingId=${invalidId}`);
    expect(resInvalid.status).toBe(400);
    const body = (await resInvalid.json()) as { message?: string };
    expect(body.message).toContain('Invalid meetingId');
  });

  // 5. PUT /zoom/insights/:id
  it('PUT /zoom/insights/:id returns 200 for valid ObjectId and 400 for invalid ObjectId', async () => {
    const resValid = await fetch(`${baseUrl}/zoom/insights/${validId}`, { method: 'PUT' });
    expect(resValid.status).toBe(200);

    const resInvalid = await fetch(`${baseUrl}/zoom/insights/${invalidId}`, { method: 'PUT' });
    expect(resInvalid.status).toBe(400);
    const body = (await resInvalid.json()) as { message?: string };
    expect(body.message).toContain('Invalid id');
  });

  // 6. POST /zoom/insights/:id/convert-to-faq
  it('POST /zoom/insights/:id/convert-to-faq returns 200 for valid ObjectId and 400 for invalid ObjectId', async () => {
    const resValid = await fetch(`${baseUrl}/zoom/insights/${validId}/convert-to-faq`, {
      method: 'POST',
    });
    expect(resValid.status).toBe(200);

    const resInvalid = await fetch(`${baseUrl}/zoom/insights/${invalidId}/convert-to-faq`, {
      method: 'POST',
    });
    expect(resInvalid.status).toBe(400);
    const body = (await resInvalid.json()) as { message?: string };
    expect(body.message).toContain('Invalid id');
  });

  // 7. GET /admin/programs/:id/zoom
  it('GET /admin/programs/:id/zoom returns 200 for valid ObjectId and 400 for invalid ObjectId', async () => {
    const resValid = await fetch(`${baseUrl}/admin/programs/${validId}/zoom`);
    expect(resValid.status).toBe(200);

    const resInvalid = await fetch(`${baseUrl}/admin/programs/${invalidId}/zoom`);
    expect(resInvalid.status).toBe(400);
    const body = (await resInvalid.json()) as { message?: string };
    expect(body.message).toContain('Invalid id');
  });

  // 8. PUT /admin/programs/:id/zoom
  it('PUT /admin/programs/:id/zoom returns 200 for valid ObjectId and 400 for invalid ObjectId', async () => {
    const resValid = await fetch(`${baseUrl}/admin/programs/${validId}/zoom`, { method: 'PUT' });
    expect(resValid.status).toBe(200);

    const resInvalid = await fetch(`${baseUrl}/admin/programs/${invalidId}/zoom`, {
      method: 'PUT',
    });
    expect(resInvalid.status).toBe(400);
    const body = (await resInvalid.json()) as { message?: string };
    expect(body.message).toContain('Invalid id');
  });

  // 9. POST /admin/programs/:id/zoom/disconnect
  it('POST /admin/programs/:id/zoom/disconnect returns 200 for valid ObjectId and 400 for invalid ObjectId', async () => {
    const resValid = await fetch(`${baseUrl}/admin/programs/${validId}/zoom/disconnect`, {
      method: 'POST',
    });
    expect(resValid.status).toBe(200);

    const resInvalid = await fetch(`${baseUrl}/admin/programs/${invalidId}/zoom/disconnect`, {
      method: 'POST',
    });
    expect(resInvalid.status).toBe(400);
    const body = (await resInvalid.json()) as { message?: string };
    expect(body.message).toContain('Invalid id');
  });
});
