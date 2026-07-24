/**
 * auth-bridge.routes.ts — samagama.in SSO bridge endpoint.
 *
 *   POST /api/auth/bridge/exchange
 *     Called by samagama.in's backend at login time. HMAC-signed body.
 *     Returns our 7d JWT pair + the local user record.
 *
 * No auth required — the bridge IS the auth. HMAC signature + 60s
 * timestamp window are the authentication.
 */
import { Router } from 'express';
import { exchangeBridgeToken } from './auth-bridge.controller.js';

const router = Router();

router.post('/exchange', exchangeBridgeToken);

export default router;