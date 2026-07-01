// ── User Roles ───────────────────────────────────────────────────
export const UserRole = {
  USER: 'user',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ── Admin Levels ─────────────────────────────────────────────────
export const AdminLevel = {
  MODERATOR: 'moderator',
  ADMIN: 'admin',
} as const;

export type AdminLevel = (typeof AdminLevel)[keyof typeof AdminLevel];
