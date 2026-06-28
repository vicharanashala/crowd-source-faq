import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Mail, Lock, User, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function Signup() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "" });
  const { register } = useAuth();
  const navigate = useNavigate();

  const roles = ["Engineer", "Product / Design", "People Ops", "Finance / Legal", "Support", "Other"];

  const submit = async (e) => {
    e.preventDefault();
    if (step === 1) return setStep(2);
    try {
      await register(form.name, form.email, form.password);
      toast.success("Welcome to the community.");
      setTimeout(() => navigate("/"), 500);
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-brand-paper" data-testid="signup-page">
      <div className="flex items-center justify-center p-6 md:p-12 order-2 lg:order-1">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-7 h-7 bg-brand-ink flex items-center justify-center">
              <span className="font-serif text-brand-paper italic leading-none text-lg">C</span>
            </div>
            <span className="font-serif text-xl">CrowdSource</span>
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <span className="label-eyebrow">Join the community</span>
            <div className="flex gap-1">
              <span className={`w-8 h-0.5 ${step >= 1 ? 'bg-brand-ink' : 'bg-brand-line'}`} />
              <span className={`w-8 h-0.5 ${step >= 2 ? 'bg-brand-ink' : 'bg-brand-line'}`} />
            </div>
          </div>

          <h1 className="font-serif text-5xl md:text-6xl text-brand-ink leading-none tracking-tight">
            {step === 1 ? <>Begin your <em className="italic text-brand-vermilion">contribution.</em></> : <>One last <em className="italic text-brand-vermilion">detail.</em></>}
          </h1>
          <p className="text-brand-body mt-4 mb-10">
            {step === 1 ? 'It takes 45 seconds. No credit card. No surveys.' : 'Tell us your role so we can tune your home feed.'}
          </p>

          <form onSubmit={submit} className="space-y-5" data-testid="signup-form">
            {step === 1 && (
              <>
                <Field icon={User} label="Full name" testid="signup-name-input" type="text" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Ada Lovelace" required />
                <Field icon={Mail} label="Work email" testid="signup-email-input" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="ada@company.com" required />
                <Field icon={Lock} label="Password" testid="signup-password-input" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="At least 12 characters" required />
                <label className="flex items-start gap-3 text-xs text-brand-body">
                  <input type="checkbox" required className="w-4 h-4 mt-0.5 accent-brand-ink" />
                  I agree to the community standards and the editorial guidelines.
                </label>
              </>
            )}

            {step === 2 && (
              <>
                <p className="label-eyebrow mb-2">Your primary role</p>
                <div className="grid grid-cols-2 gap-2" data-testid="signup-roles">
                  {roles.map((r) => (
                    <button type="button" key={r} onClick={() => setForm({ ...form, role: r })} className={`border px-4 py-3 text-sm text-left transition-colors ${form.role === r ? 'border-brand-ink bg-brand-ink text-brand-paper' : 'border-brand-line hover:border-brand-ink'}`} data-testid={`role-${r.toLowerCase().replace(/[^a-z]/g, '-')}`}>
                      <div className="flex items-center justify-between">
                        <span>{r}</span>
                        {form.role === r && <Check size={14} />}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <button type="submit" className="w-full bg-brand-ink text-brand-paper py-4 text-sm tracking-widest uppercase font-medium hover:bg-brand-blue transition-colors flex items-center justify-center gap-2" data-testid="signup-submit-btn">
              {step === 1 ? 'Continue' : 'Create my account'} <ArrowRight size={14} />
            </button>

            {step === 2 && (
              <button type="button" onClick={() => setStep(1)} className="w-full text-xs uppercase tracking-widest text-brand-body hover:text-brand-ink py-2" data-testid="signup-back-btn">← Back</button>
            )}
          </form>

          <p className="text-sm text-brand-body text-center mt-10">
            Already part of the community? <Link to="/login" className="text-brand-ink underline hover:text-brand-blue" data-testid="login-link">Sign in</Link>
          </p>
        </div>
      </div>

      <div className="hidden lg:block relative order-1 lg:order-2 bg-brand-ink">
        <img src="https://images.unsplash.com/photo-1483366774565-c783b9f70e2c?crop=entropy&cs=srgb&fm=jpg&w=1400&q=80" alt="" className="absolute inset-0 w-full h-full object-cover grayscale opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-tr from-brand-ink/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-brand-paper">
          <p className="label-eyebrow text-brand-paper/70 mb-4">2,310 members</p>
          <p className="font-serif text-4xl italic leading-tight max-w-md">
            "The community pays you back the moment you stop being the bottleneck."
          </p>
          <p className="text-xs uppercase tracking-widest text-brand-paper/60 mt-6">— A previous contributor</p>
        </div>
      </div>
    </div>
  );
}

const Field = ({ icon: Icon, label, testid, type, value, onChange, placeholder, required }) => (
  <div>
    <label className="label-eyebrow block mb-2">{label}</label>
    <div className="flex items-center border border-brand-line bg-white focus-within:border-brand-ink">
      <Icon size={15} className="ml-4 text-brand-mute" />
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 px-3 py-3.5 outline-none text-base bg-transparent" data-testid={testid} />
    </div>
  </div>
);
