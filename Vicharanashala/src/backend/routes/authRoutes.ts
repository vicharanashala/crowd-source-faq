import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../services/db.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'yakshas_lair_secret_key_2026';

// Helper to get formatted date
function getTodayString(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

// Helper to get yesterday formatted date
function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, studentId, college } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ error: 'Name, email, and password are required.' });
    return;
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: 'An account with this email already exists.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const todayStr = getTodayString();

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        studentId: studentId || null,
        college: college || null,
        role: 'USER',
        spurtiPoints: 20, // 20 welcome points
        streak: 1,
        lastLoginDate: todayStr,
        badges: JSON.stringify(['First Question']), // Give them a starter badge or empty
      },
    });

    // Create activity logs and notification
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'Account Registration',
        xpEarned: 20,
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        message: 'Welcome to Yaksha AI! Enjoy +20 Spurti Points (SP).',
      },
    });

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      message: 'Account registered successfully.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        spurtiPoints: user.spurtiPoints,
        streak: user.streak,
        badges: JSON.parse(user.badges),
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    // Daily streak & XP updates
    const todayStr = getTodayString();
    const yesterdayStr = getYesterdayString();
    let updatedPoints = user.spurtiPoints;
    let updatedStreak = user.streak;
    let bonusAwarded = false;

    if (user.lastLoginDate !== todayStr) {
      if (user.lastLoginDate === yesterdayStr) {
        updatedStreak += 1;
      } else {
        updatedStreak = 1;
      }
      updatedPoints += 20; // +20 SP for daily streak
      bonusAwarded = true;
    }

    // Update user login details
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginDate: todayStr,
        streak: updatedStreak,
        spurtiPoints: updatedPoints,
      },
    });

    if (bonusAwarded) {
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: `Daily Login Streak (${updatedStreak} days)`,
          xpEarned: 20,
        },
      });

      await prisma.notification.create({
        data: {
          userId: user.id,
          message: `Daily streak continued! Current streak: ${updatedStreak} days. Earned +20 SP.`,
        },
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: updatedUser.id, email: updatedUser.email, role: updatedUser.role, name: updatedUser.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Logged in successfully.',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        spurtiPoints: updatedUser.spurtiPoints,
        streak: updatedUser.streak,
        badges: JSON.parse(updatedUser.badges),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        spurtiPoints: true,
        streak: true,
        badges: true,
        college: true,
        studentId: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({
      user: {
        ...user,
        badges: JSON.parse(user.badges),
      },
    });
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ error: 'Server error fetching user.' });
  }
});

export default router;
