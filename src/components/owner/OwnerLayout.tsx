import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Package, Tags, Receipt, Settings, LogOut,
  Sprout, Moon, Sun, Menu, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";

const NAV = [
  { to: "/owner/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/owner/products", label: "Products", icon: Package },
  { to: "/owner/categories", label: "Categories", icon: Tags },
  { to: "/owner/sales-history", label: "Sales History", icon: Receipt },
  { to: "/owner/settings", label: "Settings", icon: Settings },
] as const;

export function OwnerLayout({ children, title }: { children: ReactNode; title: string }) {
  const { profile, loading, session, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/owner/login" });
    else if (profile && profile.role !== "owner") navigate({ to: "/seller/pos" });
  }, [session, profile, loading, navigate]);

  if (loading || !profile) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar — desktop */}
      <aside
        className={`hidden md:flex md:flex-col border-r border-border bg-sidebar transition-all duration-300 ${
          collapsed ? "md:w-16" : "md:w-60"
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-border px-4">
          <Sprout className="h-5 w-5 text-primary" />
          {!collapsed && <span className="font-semibold tracking-tight">AgriPOS</span>}
        </div>
        <nav className="flex-1 px-2 py-4">
          {NAV.map((n) => {
            const active = path === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  active
                    ? "bg-accent text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <n.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{n.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            <Menu className="h-4 w-4" />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <motion.aside
            initial={{ x: -260 }}
            animate={{ x: 0 }}
            className="absolute left-0 top-0 h-full w-64 bg-sidebar p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sprout className="h-5 w-5 text-primary" />
                <span className="font-semibold">AgriPOS</span>
              </div>
              <button onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setMobileOpen(false)}
                className="mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
              >
                <n.icon className="h-4 w-4" /> {n.label}
              </Link>
            ))}
          </motion.aside>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              className="rounded-full border border-border p-2 hover:bg-accent"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="hidden text-right md:block">
              <p className="text-sm font-medium">{profile.full_name ?? "Owner"}</p>
              <p className="text-xs text-muted-foreground">Owner</p>
            </div>
            <button
              onClick={async () => { await signOut(); navigate({ to: "/" }); }}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              <LogOut className="inline h-3.5 w-3.5" />
            </button>
          </div>
        </header>
        <motion.main
          key={path}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="flex-1 p-4 md:p-8 pb-24 md:pb-8"
        >
          {children}
        </motion.main>

        {/* Mobile bottom tabs */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-border bg-card md:hidden">
          {NAV.map((n) => {
            const active = path === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex flex-col items-center gap-1 py-2 text-[10px] ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <n.icon className="h-4 w-4" />
                <span>{n.label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
