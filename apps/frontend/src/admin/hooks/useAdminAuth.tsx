import { useContext } from 'react';
import { AuthContext, type User, type AuthContextValue } from '../../hooks/useAuth';

export interface AdminAuthValue extends AuthContextValue {
  isAdmin: boolean;
}

export const useAdminAuth = (): AdminAuthValue => {
  const ctx = useContext(AuthContext) as AuthContextValue;
  if (!ctx) throw new Error('useAdminAuth must be used within AuthProvider');

  const user = ctx.user as User | null;
  const isAdmin = !!(user && ['admin', 'moderator'].includes(user.role || ''));

  return {
    ...ctx,
    isAdmin,
  };
};