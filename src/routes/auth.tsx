import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Container } from "@/components/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Vidyā" },
      { name: "description", content: "Sign in or create an account to vote, ask, and follow queries on Vidyā." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) nav({ to: "/dashboard" });
    });
  }, [nav]);

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav({ to: "/dashboard" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Container className="py-6">
        <Link to="/" className="font-display text-xl text-primary">Vidyā</Link>
      </Container>
      <Container className="flex-1 flex items-center justify-center py-12">
        <div className="w-full max-w-md paper-card rounded-2xl p-8">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-gold" />
            {mode === "signin" ? "Welcome back" : "Join Vidyā"}
          </div>
          <h1 className="font-display text-3xl text-primary mt-2">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>

          <Button variant="outline" onClick={google} className="w-full mt-6" type="button">
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="currentColor" d="M21.35 11.1H12v3.2h5.35c-.25 1.4-1.7 4.1-5.35 4.1-3.22 0-5.85-2.66-5.85-5.94S8.78 6.52 12 6.52c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 3.94 14.55 3 12 3 6.98 3 3 6.98 3 12s3.98 9 9 9c5.19 0 8.65-3.65 8.65-8.79 0-.59-.06-1.05-.15-1.51z"/></svg>
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px bg-border flex-1" /> or with email <div className="h-px bg-border flex-1" />
          </div>

          <form onSubmit={withEmail} className="space-y-3">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aarohi" className="mt-1" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
            </div>
            <Button variant="ornate" type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="w-full text-center text-sm text-muted-foreground mt-4 hover:text-primary"
          >
            {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </Container>
    </div>
  );
}
