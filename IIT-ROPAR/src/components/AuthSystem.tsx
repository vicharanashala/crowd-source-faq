import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Lock, Mail, User, GraduationCap, ArrowRight, ShieldCheck, Key, AlertCircle, Sparkles, Eye, EyeOff, Building
} from "lucide-react";

interface AuthSystemProps {
  onAuthSuccess: (user: any) => void;
  onClose: () => void;
}

export default function AuthSystem({ onAuthSuccess, onClose }: AuthSystemProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [college, setCollege] = useState("IIT Ropar");
  const [otpCode, setOtpCode] = useState("");
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null);

  // Toggle helpers
  const handleToggleMode = () => {
    setIsSignUp(!isSignUp);
    setError(null);
    setInfoMessage(null);
    setPassword("");
    setConfirmPassword("");
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!name || !email || !studentId || !college || !password || !confirmPassword) {
      setError("Please fill in all registration fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }

    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, studentId, college }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "failed to register user.");
      }

      setSimulatedOtp(data.otp);
      setIsVerifying(true);
      setInfoMessage("Registration complete! A 4-digit verification code has been dispatched to your email address.");
    } catch (err: any) {
      setError(err.message || "An unexpected registration error has occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!otpCode) {
      setError("Verification OTP is required.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otpCode }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "failed to verify OTP code.");
      }

      setInfoMessage("Email address verified! You can now log in using your password.");
      setIsVerifying(false);
      setIsSignUp(false);
      setPassword("");
    } catch (err: any) {
      setError(err.message || "Invalid OTP code submission.");
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!email || !password) {
      setError("Email and password fields are required.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        // If unverified, route them directly back to OTP entry
        if (data.isNotVerified) {
          setSimulatedOtp(data.otp);
          setIsVerifying(true);
          setError("Your email is unverified. Please enter the OTP code dispatched after signup.");
          return;
        }
        throw new Error(data.error || "Invalid username or password credentials.");
      }

      localStorage.setItem("vicha_token", data.token);
      onAuthSuccess(data.user);
    } catch (err: any) {
      setError(err.message || "Authentication failed. Clear caches or verify credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    if (!email) {
      setError("Your registered email is required.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No account is associated with this email.");
      }

      setInfoMessage(`Reset successfully executed! Simulated temporary password: ${data.tempPassword}`);
      setIsForgotPassword(false);
    } catch (err: any) {
      setError(err.message || "Forgot password routine failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 backdrop-blur-xl bg-[#000000]/70">
      {/* Premium Ambient grid effect */}
      <div className="absolute inset-0 grid-bg-dark opacity-30 pointer-events-none" />
      <div className="absolute top-[20%] left-[25%] w-[300px] h-[300px] rounded-full bg-purple-600/10 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[25%] w-[300px] h-[300px] rounded-full bg-blue-600/10 blur-[80px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0F0F12]/95 p-6 sm:p-8 shadow-[0_12px_45px_rgba(139,92,206,0.15)] relative"
      >
        {/* Close trigger */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white font-mono text-sm cursor-pointer"
        >
          [Esc] Close
        </button>

        {/* Institution Brand */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="font-display text-white text-xl font-bold tracking-tight">
            Vicharanshala Hub
          </h2>
          <p className="font-mono text-[9px] tracking-wider text-purple-400 uppercase font-medium mt-0.5">
            IIT Ropar Summer Research
          </p>
        </div>

        {/* Toast / Status Alerts */}
        <AnimatePresence mode="popLayout">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 flex items-start space-x-2 rounded-lg border border-red-500/25 bg-red-400/5 p-3 text-xs text-red-400"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          {infoMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 flex items-start space-x-2 rounded-lg border border-emerald-500/25 bg-emerald-400/5 p-3 text-xs text-emerald-400"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Verification Sub-screen */}
        {isVerifying ? (
          <form onSubmit={handleVerifySubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider">
                Simulated verification console
              </label>
              <p className="text-[11px] text-slate-400 mb-3">
                Since this is running in a secure test container, we have simulated the Nodemailer dispatch.
              </p>
              {simulatedOtp && (
                <div className="bg-purple-950/20 border border-purple-500/30 rounded-lg p-3 text-center mb-4">
                  <span className="text-[10px] font-mono text-purple-400 uppercase font-bold block">
                    Your Simulated Verification OTP Code
                  </span>
                  <span className="text-2xl font-mono tracking-[0.5em] text-white font-extrabold select-all">
                    {simulatedOtp}
                  </span>
                  <p className="text-[10px] text-slate-500 mt-1">
                    (or use universal code <strong className="font-mono text-slate-400">1234</strong>)
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="otp-input" className="text-xs font-semibold text-slate-300">
                Enter 4-Digit OTP Code
              </label>
              <div className="relative">
                <Key className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                <input
                  id="otp-input"
                  type="text"
                  maxLength={4}
                  placeholder="e.g. 1234"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-center text-lg font-mono tracking-[0.3em] text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 hover:opacity-90 font-semibold text-white text-xs tracking-wider uppercase cursor-pointer"
            >
              {loading ? "Verifying Token..." : "Verify OTP Code"}
            </button>

            <div className="text-center mt-3">
              <button
                type="button"
                onClick={() => setIsVerifying(false)}
                className="text-xs text-purple-400 hover:underline cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        ) : isForgotPassword ? (
          /* Forgot Password subscreen */
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="forgot-email" className="text-xs font-semibold text-slate-300">
                Registered Email
              </label>
              <div className="relative">
                <Mail className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                <input
                  id="forgot-email"
                  type="email"
                  placeholder="name@university.ac.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center py-2.5 rounded-xl bg-purple-600 font-semibold hover:bg-purple-500 text-white text-xs tracking-wider uppercase cursor-pointer"
            >
              {loading ? "Triggering Sim Email..." : "Send Verification Temp Password"}
            </button>

            <div className="text-center mt-3">
              <button
                type="button"
                onClick={() => setIsForgotPassword(false)}
                className="text-xs text-purple-400 hover:underline cursor-pointer"
              >
                Back to Login
              </button>
            </div>
          </form>
        ) : isSignUp ? (
          /* signup page */
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <h3 className="text-slate-300 text-xs font-bold font-mono border-b border-white/5 pb-1 mb-2">
              AUTHENTIC CREATION ENGINE
            </h3>

            <div className="space-y-1">
              <label htmlFor="reg-name" className="text-[10px] font-bold text-slate-400 uppercase font-mono">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-500" />
                <input
                  id="reg-name"
                  type="text"
                  placeholder="e.g. Antra Mishra"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-3 text-xs text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="reg-email" className="text-[10px] font-bold text-slate-400 uppercase font-mono">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-500" />
                <input
                  id="reg-email"
                  type="email"
                  placeholder="e.g. details@iitr.ac.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-3 text-xs text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor="reg-student-id" className="text-[10px] font-bold text-slate-400 uppercase font-mono">
                  Student ID
                </label>
                <div className="relative">
                  <GraduationCap className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-500" />
                  <input
                    id="reg-student-id"
                    type="text"
                    placeholder="2026CSBXXXX"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-3 text-xs text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="reg-college" className="text-[10px] font-bold text-slate-400 uppercase font-mono">
                  College/Uni
                </label>
                <div className="relative">
                  <Building className="absolute top-2.5 left-3 h-3.5 w-3.5 text-slate-500" />
                  <input
                    id="reg-college"
                    type="text"
                    placeholder="IIT Ropar"
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-3 text-xs text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor="reg-password" className="text-[10px] font-bold text-slate-400 uppercase font-mono">
                  Password
                </label>
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-3 text-xs text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="reg-password-confirm" className="text-[10px] font-bold text-slate-400 uppercase font-mono">
                  Confirm Code
                </label>
                <input
                  id="reg-password-confirm"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-3 text-xs text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[10px] text-slate-400 hover:text-white"
              >
                {showPassword ? "Hide Passwords" : "Show Passwords"}
              </button>
              <div className="font-mono text-[9px] text-slate-500">
                (Note: admin suffix triggers Admin role)
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 hover:opacity-95 font-semibold text-white text-xs uppercase tracking-wider cursor-pointer mt-2"
            >
              <span>{loading ? "Creating Account..." : "Execute Register"}</span>
              <ArrowRight className="h-3 w-3" />
            </button>

            <div className="text-center text-[11px] text-slate-400 mt-3 pt-2 border-t border-white/5">
              Already have an verified account?{" "}
              <button
                type="button"
                onClick={handleToggleMode}
                className="text-purple-400 font-semibold hover:underline cursor-pointer"
              >
                Sign In
              </button>
            </div>
          </form>
        ) : (
          /* Sign In */
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-xs font-semibold text-slate-300">
                Registered Email
              </label>
              <div className="relative">
                <Mail className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                <input
                  id="login-email"
                  type="email"
                  placeholder="e.g. student@iitr.ac.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#16161C] py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="text-xs font-semibold text-slate-300">
                  Password Key
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(true)}
                  className="text-[10px] text-purple-400 hover:underline"
                >
                  Forgot Code?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute top-3 left-3 h-4 w-4 text-slate-500" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#16161C] py-2.5 pl-10 pr-10 text-xs text-white placeholder-slate-600 focus:border-purple-500/50 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute top-3.5 right-3 text-slate-500 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-1.5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 hover:opacity-95 text-white font-semibold text-xs uppercase tracking-wider cursor-pointer mt-1"
            >
              <span>{loading ? "Authenticating Intern..." : "Sign In Workspace"}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            {/* Quick Test Logins */}
            <div className="bg-white/5 border border-white/5 rounded-lg p-2.5 text-slate-400 text-[10px] mt-4">
              <span className="font-mono text-slate-300 font-bold block mb-1">
                ⚡ QUICK TEST DEMO CREDENTIALS:
              </span>
              <div className="flex justify-between mt-1">
                <span>
                  <strong>Student:</strong> student@iitr.ac.in
                </span>
                <span className="font-mono bg-white/10 px-1 rounded text-white select-all">password</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>
                  <strong>Admin:</strong> admin@iitr.ac.in
                </span>
                <span className="font-mono bg-white/10 px-1 rounded text-white select-all">password</span>
              </div>
            </div>

            <div className="text-center text-[11px] text-slate-400 mt-4 pt-3 border-t border-white/5">
              Need a Summer Cohort account?{" "}
              <button
                type="button"
                onClick={handleToggleMode}
                className="text-purple-400 font-semibold hover:underline cursor-pointer"
              >
                Sign Up Now
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
