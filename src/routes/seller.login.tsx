import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sprout, Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { HoverTip } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { generateHiddenEmail } from "@/lib/api/admin-users";

export const Route = createFileRoute("/seller/login")({
  component: SellerLogin,
});

function SellerLogin() {
  const navigate = useNavigate();
  const { session, profile, loading } = useAuth();
  const [selectedSeller, setSelectedSeller] = useState<Profile | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !session || !profile) return;
    if (profile.role === "owner") navigate({ to: "/owner/dashboard" });
    else navigate({ to: "/seller/pos" });
  }, [session, profile, loading, navigate]);

  const { data: sellers = [], isLoading: isLoadingSellers } = useQuery({
    queryKey: ["sellers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "seller")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeller?.full_name) return;
    
    setBusy(true);
    try {
      const email = generateHiddenEmail(selectedSeller.full_name);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm"
      >
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <Sprout className="h-4 w-4" /> AgriPOS
        </Link>
        <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          Seller Portal
        </span>

        <AnimatePresence mode="wait">
          {!selectedSeller ? (
            <motion.div 
              key="step-1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="mt-4"
            >
              <h1 className="mb-6 text-2xl font-semibold tracking-tight">Who's signing in?</h1>
              
              {isLoadingSellers ? (
                <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : sellers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                  No sellers found. Ask the owner to add you.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {sellers.map(seller => (
                    <button
                      key={seller.id}
                      onClick={() => setSelectedSeller(seller)}
                      className="flex flex-col items-center justify-center rounded-xl border border-border bg-background p-4 transition-all hover:bg-accent hover:border-primary/50"
                    >
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                        {seller.full_name?.substring(0, 2).toUpperCase() || "??"}
                      </div>
                      <span className="text-sm font-medium text-center line-clamp-1 w-full">{seller.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="mt-4"
            >
              <button 
                onClick={() => { setSelectedSeller(null); setPassword(""); setShowPassword(false); }}
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Back to sellers
              </button>
              
              <div className="mb-6 flex items-center gap-4 rounded-lg bg-accent/50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-semibold text-primary">
                  {selectedSeller.full_name?.substring(0, 2).toUpperCase() || "??"}
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Welcome back,</div>
                  <div className="font-semibold">{selectedSeller.full_name}</div>
                </div>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium uppercase tracking-wider text-muted-foreground">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2.5 pr-10 text-lg tracking-widest outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#283618]"
                      required
                    />
                    <HoverTip label={showPassword ? "Hide password" : "Show password"}>
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </HoverTip>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy || !password}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-[0.9375rem] font-semibold text-primary-foreground transition-all duration-200 hover:bg-[#3a4f22] hover:scale-[0.98] disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sign in
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 border-t border-border pt-4 text-center text-sm text-muted-foreground">
          <Link to="/owner/login" className="hover:text-foreground">Owner login →</Link>
        </div>
      </motion.div>
    </div>
  );
}
