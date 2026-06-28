import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      toast.success("Welcome back.");
      setTimeout(() => navigate("/"), 500);
    } catch (err: any) {
      toast.error(err.message || "Invalid email or password");
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-brand-paper" data-testid="login-page">
      <div className="hidden lg:block relative">
        <img
          src="https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?crop=entropy&cs=srgb&fm=jpg&w=1400&q=80"
          alt=""
          className="absolute inset-0 w-full h-full object-cover grayscale"
        />
        <div className="absolute inset-0 bg-brand-ink/30" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-brand-paper">
          <p className="label-eyebrow text-brand-paper/70 mb-4">CrowdSource FAQ — Vol. 01</p>
          <p className="font-serif text-4xl italic leading-tight max-w-md">
            "Ask once. Answer once. Find it forever."
          </p>
          <p className="text-xs uppercase tracking-widest text-brand-paper/60 mt-6">— The Editorial Board</p>
        </div>
        <div className="absolute top-8 left-8">
          <Link to="/" className="flex items-center gap-2 text-brand-paper" data-testid="auth-brand-link">
            <div className="w-7 h-7 bg-brand-paper flex items-center justify-center">
              <span className="font-serif text-brand-ink text-lg italic leading-none">C</span>
            </div>
            <span className="font-serif text-xl">CrowdSource</span>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-7 h-7 bg-brand-ink flex items-center justify-center">
              <span className="font-serif text-brand-paper text-lg italic leading-none">C</span>
            </div>
            <span className="font-serif text-xl">CrowdSource</span>
          </Link>

          <p className="label-eyebrow mb-4">Sign in</p>
          <h1 className="font-serif text-5xl md:text-6xl text-brand-ink leading-none tracking-tight mb-2">Welcome<br />back.</h1>
          <p className="text-brand-body mt-4 mb-10">Continue your contribution to the knowledge base.</p>

          <form onSubmit={submit} className="space-y-5" data-testid="login-form">
            <div>
              <label className="label-eyebrow block mb-2">Email</label>
              <div className="flex items-center border border-brand-line bg-white focus-within:border-brand-ink">
                <Mail size={15} className="ml-4 text-brand-mute" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="flex-1 px-3 py-3.5 outline-none text-base bg-transparent" data-testid="login-email-input" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label-eyebrow">Password</label>
                <Link to="#" className="text-xs uppercase tracking-widest text-brand-blue hover:text-brand-ink" data-testid="forgot-password-link">Forgot?</Link>
              </div>
              <div className="flex items-center border border-brand-line bg-white focus-within:border-brand-ink">
                <Lock size={15} className="ml-4 text-brand-mute" />
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="flex-1 px-3 py-3.5 outline-none text-base bg-transparent" data-testid="login-password-input" />
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm text-brand-body">
              <input type="checkbox" className="w-4 h-4 accent-brand-ink" /> Keep me signed in
            </label>
            <button type="submit" className="w-full bg-brand-ink text-brand-paper py-4 text-sm tracking-widest uppercase font-medium hover:bg-brand-blue transition-colors flex items-center justify-center gap-2" data-testid="login-submit-btn">
              Sign in <ArrowRight size={14} />
            </button>
          </form>

          <div className="my-8 flex items-center gap-4">
            <div className="flex-1 h-px bg-brand-line" />
            <span className="text-[10px] uppercase tracking-widest text-brand-mute">Or</span>
            <div className="flex-1 h-px bg-brand-line" />
          </div>

          <button className="w-full border border-brand-line py-3.5 text-sm hover:border-brand-ink flex items-center justify-center gap-3" data-testid="google-login-btn">
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>

          <p className="text-sm text-brand-body text-center mt-10">
            New to the platform? <Link to="/signup" className="text-brand-ink underline hover:text-brand-blue" data-testid="signup-link">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
