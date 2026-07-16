import { Router } from 'express';
import { prisma } from '../services/db.js';
import { getRankTier } from './userRoutes.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'yakshas_lair_secret_key_2026';

// Helper to extract user ID from cookie if present (optional auth for leaderboard)
function getOptionalUserId(req: any): string | null {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return decoded.id;
  } catch {
    return null;
  }
}

// GET /api/leaderboard (public, supports optional anonymity masking)
router.get('/', async (req, res) => {
  const showNames = req.query.showNames === 'true';
  const currentUserId = getOptionalUserId(req);

  try {
    const users = await prisma.user.findMany({
      orderBy: { spurtiPoints: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        spurtiPoints: true,
        streak: true,
        badges: true,
      },
    });

    const leaderboard = users.map((user, idx) => {
      const rank = getRankTier(user.spurtiPoints);
      let displayName = '';

      if (showNames || user.id === currentUserId) {
        displayName = user.name;
      } else {
        // Mask name based on initials and rank, e.g. "Scholar #4" or "Sage A."
        const initials = user.name.split(' ').map(n => n[0]).join('');
        displayName = `${rank} (${initials || 'Anon'}) #${idx + 1}`;
      }

      return {
        id: user.id,
        name: displayName,
        spurtiPoints: user.spurtiPoints,
        streak: user.streak,
        rank,
        badges: JSON.parse(user.badges),
        isCurrentUser: user.id === currentUserId,
      };
    });

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Server error loading leaderboard.' });
  }
});

export default router;
