import React, { useState, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const isExpired = new URLSearchParams(window.location.search).get('expired') === 'true';

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.email || !form.password) {
      setError('Please enter your email and password.');
      return;
    }

    // Preserve intended destination for redirect after login
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || '/';

    setLoading(true);
    try {
      await login(form.email.trim(), form.password);
      navigate(redirect, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg grid-bg flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl border-2 border-accent/20 bg-accent-light flex items-center justify-center mb-4 shadow-subtle">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <text x="4" y="18" fontSize="18" fontWeight="700" fill="#4f7cff" fontFamily="DM Serif Display, serif">?</text>
            </svg>
          </div>
          <h1 className="text-xl font-serif text-ink">Yaksha FAQ Portal</h1>
          <p className="text-xs text-ink-soft mt-1.5">Intern FAQs — solved from your team's Zoom sessions</p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-card p-6">
          <h2 className="text-sm font-semibold text-ink mb-5">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {isExpired && !error && (
              <p className="text-xs text-warning bg-warning-light border border-warning/15 rounded-xl px-3 py-2">
                Your session has expired. Please sign in again.
              </p>
            )}

            <Input
              id="login-email"
              name="email"
              type="email"
              label="Email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              disabled={loading}
            />

            <Input
              id="login-password"
              name="password"
              type="password"
              label="Password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              disabled={loading}
            />

            {error && (
              <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full mt-1">
              Sign in
            </Button>
          </form>

          <p className="text-center text-xs text-ink-soft mt-5">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-accent hover:text-accent-hover font-medium transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}