import React, { useState, type FormEvent, type ChangeEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.name?.trim() || !form.email || !form.password) {
      setError('Please fill out all fields.');
      return;
    }

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // Preserve intended destination for redirect after registration
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || '/';

    setLoading(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      navigate(redirect, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Registration failed. Please try again.');
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
          <p className="text-xs text-ink-soft mt-1.5">Join to search doubts from your team's Zoom sessions</p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-card p-6">
          <h2 className="text-sm font-semibold text-ink mb-5">Sign up</h2>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              id="register-name"
              name="name"
              type="text"
              label="Full Name"
              autoComplete="name"
              value={form.name}
              onChange={handleChange}
              placeholder="John Doe"
              disabled={loading}
            />

            <Input
              id="register-email"
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
              id="register-password"
              name="password"
              type="password"
              label="Password"
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              disabled={loading}
            />
            <p className="text-[10px] text-ink-faint -mt-2">Minimum 6 characters</p>

            <Input
              id="register-confirm"
              name="confirmPassword"
              type="password"
              label="Confirm Password"
              autoComplete="new-password"
              value={form.confirmPassword}
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
              Create account
            </Button>
          </form>

          <p className="text-center text-xs text-ink-soft mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:text-accent-hover font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}