import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import type { Request } from 'express';
import { handleZoomWebhook } from '../controllers/zoomController.js';

// We need to inspect verifyZoomSignature indirectly or import/test it.
// Since verifyZoomSignature is a private helper inside zoomController.ts, 
// we can test it by calling handleZoomWebhook(req, res) or we can mock 
// the response and request objects.
// Let's create mock request/response objects to test handleZoomWebhook logic.

const SECRET = 'test_webhook_secret_token';

describe('Zoom Webhook Signature Verification', () => {
  let originalEnv: string | undefined;

  beforeAll(() => {
    originalEnv = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
    process.env.ZOOM_WEBHOOK_SECRET_TOKEN = SECRET;
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.ZOOM_WEBHOOK_SECRET_TOKEN = originalEnv;
    process.env.NODE_ENV = 'test';
  });

  it('rejects webhook with missing signature header', async () => {
    let statusVal = 0;
    let jsonVal: any = null;

    const req = {
      headers: {},
      body: { event: 'recording.completed' }
    } as unknown as Request;

    const res = {
      status: (s: number) => {
        statusVal = s;
        return {
          json: (j: any) => {
            jsonVal = j;
          }
        };
      }
    } as any;

    await handleZoomWebhook(req, res);

    expect(statusVal).toBe(403);
    expect(jsonVal).toEqual({ message: 'Invalid signature' });
  });

  it('rejects webhook with short/invalid signature length without throwing/crashing (DoS protection)', async () => {
    let statusVal = 0;
    let jsonVal: any = null;

    // Send a very short invalid signature. In previous version, this would crash
    // timingSafeEqual because of input length mismatch.
    const req = {
      headers: {
        'x-zm-signature': 'too-short'
      },
      body: { event: 'recording.completed' }
    } as unknown as Request;

    const res = {
      status: (s: number) => {
        statusVal = s;
        return {
          json: (j: any) => {
            jsonVal = j;
          }
        };
      }
    } as any;

    // This should resolve normally without throwing any timingSafeEqual RangeError
    await expect(handleZoomWebhook(req, res)).resolves.not.toThrow();

    expect(statusVal).toBe(403);
    expect(jsonVal).toEqual({ message: 'Invalid signature' });
  });

  it('accepts webhook signature computed from raw body buffer', async () => {
    let statusVal = 0;
    let jsonVal: any = null;

    const bodyObj = { event: 'recording.completed', payload: { object: { id: '12345' } } };
    const rawBodyBuffer = Buffer.from(JSON.stringify(bodyObj), 'utf8');
    
    // Compute valid signature
    const expectedHash = crypto.createHmac('sha256', SECRET).update(rawBodyBuffer).digest('hex');
    const signature = `v0=${expectedHash}`;

    const req = {
      headers: {
        'x-zm-signature': signature
      },
      body: bodyObj,
      rawBody: rawBodyBuffer
    } as unknown as Request;

    const res = {
      status: (s: number) => {
        statusVal = s;
        return {
          json: (j: any) => {
            jsonVal = j;
          }
        };
      }
    } as any;

    await handleZoomWebhook(req, res);

    expect(statusVal).toBe(200);
    expect(jsonVal).toEqual({ received: true });
  });

  it('accepts webhook signature computed from JSON.stringify fallback when rawBody is missing', async () => {
    let statusVal = 0;
    let jsonVal: any = null;

    const bodyObj = { event: 'recording.completed', payload: { object: { id: '67890' } } };
    const serialized = JSON.stringify(bodyObj);
    
    // Compute valid signature
    const expectedHash = crypto.createHmac('sha256', SECRET).update(serialized).digest('hex');
    const signature = `v0=${expectedHash}`;

    const req = {
      headers: {
        'x-zm-signature': signature
      },
      body: bodyObj
      // rawBody is intentionally left undefined to test fallback path
    } as unknown as Request;

    const res = {
      status: (s: number) => {
        statusVal = s;
        return {
          json: (j: any) => {
            jsonVal = j;
          }
        };
      }
    } as any;

    await handleZoomWebhook(req, res);

    expect(statusVal).toBe(200);
    expect(jsonVal).toEqual({ received: true });
  });
});
