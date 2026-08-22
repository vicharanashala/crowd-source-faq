import { Router } from 'express';
import { EmbedController } from './embed.controller.js';
import rateLimit from 'express-rate-limit';

const router = Router();
const embedController = new EmbedController();

// Rate limiting for embed API (public endpoints)
const embedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  }
});

// Public embed endpoints (no authentication required)
router.get('/faqs', embedLimiter, embedController.getFaqs.bind(embedController));
router.get('/config', embedLimiter, embedController.getConfig.bind(embedController));

export default router;