import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ShoppingCart, ListOrdered, LogOut, Sprout, WifiOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOnline } from "@/hooks/use-online";
import { getQueue } from "@/lib/offline-queue";

export function SellerLayout({ children }: { children: ReactNode }) {
  const { profile, loading, session, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const online = useOnline();
  const pending = getQueue().length;

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/seller/login" });
    else if (profile && profile.role !== "seller" && profile.role !== "owner") navigate({ to: "/" });
  }, [session, profile, loading, navigate]);

  if (loading || !profile) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2">
          <Sprout className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">AgriPOS</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{profile.full_name ?? "Seller"}</span>
          <button
            onClick={async () => { await signOut(); navigate({ to: "/" }); }}
            className="rounded-md border border-border p-1.5 hover:bg-accent"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {!online && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            No internet connection. Sales will be saved locally and synced when you reconnect.
            {pending > 0 && ` (${pending} pending)`}
          </span>
        </div>
      )}

      <motion.main
        key={path}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex-1 pb-20"
      >
        {children}
      </motion.main>

      <nav className="fixed bottom-0 left-0 right-0 grid grid-cols-2 border-t border-border bg-card">
        {[
          { to: "/seller/pos", label: "New Sale", icon: ShoppingCart },
          { to: "/seller/my-sales", label: "My Sales", icon: ListOrdered },
        ].map((t) => {
          const active = path === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex flex-col items-center gap-1 py-3 text-xs font-medium ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <t.icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
