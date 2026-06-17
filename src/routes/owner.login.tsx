import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sprout, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/login")({
  component: OwnerLogin,
});

function OwnerLogin() {
  return <LoginScreen role="owner" />;
}

export function LoginScreen({ role }: { role: "owner" | "seller" }) {
  const navigate = useNavigate();
  const { session, profile, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !session || !profile) return;
    if (profile.role === "owner") navigate({ to: "/owner/dashboard" });
    else navigate({ to: "/seller/pos" });
  }, [session, profile, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName || email },
            emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
          },
        });
        if (error) throw error;
        toast.success("Account created. Signing you in…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const labelColor = role === "owner" ? "Owner" : "Seller";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm"
      >
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <Sprout className="h-4 w-4" /> AgriPOS
        </Link>
        <span className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          {labelColor} Portal
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {mode === "signin" ? `Sign in as ${labelColor.toLowerCase()}` : `Create ${labelColor.toLowerCase()} account`}
        </h1>
        {role === "owner" && (
          <p className="mt-2 text-sm text-muted-foreground">
            First account becomes the owner automatically.
          </p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium uppercase tracking-wider text-muted-foreground">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#283618]"
                required
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium uppercase tracking-wider text-muted-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#283618]"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium uppercase tracking-wider text-muted-foreground">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
               className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#283618]"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-[0.9375rem] font-semibold text-primary-foreground transition-all duration-200 hover:bg-[#3a4f22] hover:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#283618] disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {role === "owner" && (
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full rounded-md px-4 py-2.5 text-center text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-[rgba(40,54,24,0.08)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#283618] dark:hover:bg-[rgba(74,124,47,0.12)]"
          >
            {mode === "signin" ? "Need to create the first owner account?" : "Already have an account? Sign in"}
          </button>
        )}

        <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
          {role === "owner" ? (
            <Link to="/seller/login" className="hover:text-foreground">Sign in as seller →</Link>
          ) : (
            <Link to="/owner/login" className="hover:text-foreground">Sign in as owner →</Link>
          )}
        </div>
      </motion.div>
    </div>
  );
}
