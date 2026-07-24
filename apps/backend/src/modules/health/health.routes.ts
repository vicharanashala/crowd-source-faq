import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getHealth, getBuildInfo } from './health.controller.js';

const router = Router();

// Public health endpoint — no auth, used by systemd health checks,
// CI/CD deploy scripts, the Discord bot's /status command, and any
// other client that wants a quick snapshot. 30 req/min per IP is
// plenty for legitimate status pings and prevents a runaway loop
// from hammering the DB.
const healthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many health requests. Please slow down.' },
});

router.get('/', healthLimiter, getHealth);
// v1.85 — public build-provenance endpoint. Same rate-limit
// bucket as the run-rate health check so a deploy-validation
// loop can't bypass it by spreading requests across /health
// and /health/build.
router.get('/build', healthLimiter, getBuildInfo);

export default router;
