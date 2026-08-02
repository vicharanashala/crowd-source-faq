import { Router } from 'express';
import { translateTextHandler, batchTranslateHandler } from './translate.controller.js';

const router = Router();

// POST /csfaq/api/translate — Single text translation
router.post('/', translateTextHandler);

// POST /csfaq/api/translate/batch — Batch text translation
router.post('/batch', batchTranslateHandler);

export default router;
