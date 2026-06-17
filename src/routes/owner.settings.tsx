import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { OwnerLayout } from "@/components/owner/OwnerLayout";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/settings")({
  component: Settings,
});

function Settings() {
  const { theme, toggle } = useTheme();
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [password, setPassword] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerPwd, setSellerPwd] = useState("");

  const saveProfile = async () => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", profile.id);
    if (error) return toast.error(error.message);
    if (password) {
      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) return toast.error(pwErr.message);
      setPassword("");
    }
    await refreshProfile();
    toast.success("Saved");
  };

  const createSeller = async () => {
    const session = (await supabase.auth.getSession()).data.session;
    const { error } = await supabase.auth.signUp({
      email: sellerEmail,
      password: sellerPwd,
      options: { data: { full_name: sellerName } },
    });
    if (error) return toast.error(error.message);
    if (session) {
      await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    }
    toast.success("Seller invited. They can now sign in at /seller/login.");
    setSellerEmail(""); setSellerName(""); setSellerPwd("");
  };

  const pwdStrength = (p: string): { label: string; color: string; pct: number } => {
    if (!p) return { label: "", color: "", pct: 0 };
    if (p.length < 6) return { label: "Weak", color: "bg-red-500", pct: 25 };
    if (p.length < 10) return { label: "Fair", color: "bg-amber-500", pct: 50 };
    if (/(?=.*[A-Z])(?=.*\d)/.test(p)) return { label: "Strong", color: "bg-emerald-500", pct: 100 };
    return { label: "Good", color: "bg-blue-500", pct: 75 };
  };
  const strength = pwdStrength(sellerPwd);

  return (
    <OwnerLayout title="Settings">
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Profile</h2>
          <div className="space-y-3">
            <Field label="Full name"><input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="New password (optional)"><input type="password" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <button onClick={saveProfile} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-[#3a4f22]">Save</button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Add seller</h2>
          <div className="space-y-3">
            <Field label="Seller full name"><input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={sellerName} onChange={(e) => setSellerName(e.target.value)} /></Field>
            <Field label="Email"><input type="email" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} /></Field>
            <Field label="Temporary password"><input type="password" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={sellerPwd} onChange={(e) => setSellerPwd(e.target.value)} /></Field>
            {strength.label && (
              <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full transition-all ${strength.color}`} style={{ width: `${strength.pct}%` }} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{strength.label}</p>
              </div>
            )}
            <button onClick={createSeller} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-[#3a4f22]">Create seller</button>
            <p className="text-xs text-muted-foreground">They will need to confirm via email if confirmations are enabled in Supabase Auth.</p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Appearance</h2>
          <button onClick={toggle} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Switch to light" : "Switch to dark"}
          </button>
        </section>
      </div>
    </OwnerLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
