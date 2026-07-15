/**
 * tee.routes.ts — Sign My Tee endpoint routing (v2).
 *
 * URLs:
 *   GET    /csfaq/api/tee/me
 *   POST   /csfaq/api/tee/me
 *   GET    /csfaq/api/tee/me/eligibility
 *   GET    /csfaq/api/tee/me/signed-by-me
 *   GET    /csfaq/api/tee/share/:shareId
 *   POST   /csfaq/api/tee/share/:shareId/sign
 *   PATCH  /csfaq/api/tee/share/:shareId/sign/:sigId   (owner only — move/resize)
 *   DELETE /csfaq/api/tee/share/:shareId/sign/:sigId   (owner only)
 */
import express from 'express';
import multer from 'multer';
import { protect } from '../../middleware/auth.js';
import { protectOptional } from '../../middleware/protectOptional.js';
import {
  getMyTee,
  upsertMyTee,
  getMyEligibility,
  getSignedByMe,
  getSharedTee,
  addSignatureToTee,
  updateSignaturePosition,
  removeSignature,
} from './tee.controller.js';

const router = express.Router();
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

// ── My tee (authenticated) ───────────────────────────────────────────────────
router.get('/me', protect, getMyTee);
router.post('/me', protect, upsertMyTee);
router.get('/me/eligibility', protect, getMyEligibility);
router.get('/me/signed-by-me', protect, getSignedByMe);

// ── Public share ─────────────────────────────────────────────────────────────
router.get('/share/:shareId', protectOptional, getSharedTee);
router.post('/share/:shareId/sign', protectOptional, uploadMemory.single('signature'), addSignatureToTee);
router.patch('/share/:shareId/sign/:sigId', protect, updateSignaturePosition);
router.delete('/share/:shareId/sign/:sigId', protect, removeSignature);

export default router;

