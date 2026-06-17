import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Package, BarChart3, Cloud, ChevronDown, Moon, Sun, Sprout, Menu, X } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/")({
  component: Landing,
});

const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600&q=80",
  "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=1600&q=80",
  "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=1600&q=80",
  "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=1600&q=80",
];

const TRUST_ITEMS = [
  "Real-time stock sync",
  "Works offline",
  "Built for Kenyan agri-businesses",
  "KES currency native",
];

const FEATURES = [
  { icon: Package, stat: "Real-time", label: "Stock tracking across every product" },
  { icon: BarChart3, stat: "Daily & monthly", label: "Sales reports that tell the story" },
  { icon: Cloud, stat: "Multi-device", label: "Cloud-synced from till to office" },
];

const STEPS = [
  "Owner adds products with category, brand, grade, size, price, and stock.",
  "Seller logs in and processes customer sales in seconds.",
  "Owner reviews live dashboard \u2014 sales, stock levels, trends.",
];

function Landing() {
  const [idx, setIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % HERO_IMAGES.length), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* ── HERO ── */}
      <section
        aria-label="Farm imagery slideshow"
        role="region"
        className="relative w-full overflow-hidden"
        style={{ minHeight: "100svh" }}
      >
        <AnimatePresence mode="sync">
          <motion.div
            key={idx}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, ease: "easeInOut" }}
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${HERO_IMAGES[idx]}')` }}
          />
        </AnimatePresence>
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.82) 100%)" }}
        />

        {/* Navbar */}
        <div className="relative z-20">
          <div
            className="mx-auto flex max-w-7xl items-center justify-between px-6 md:px-12"
            style={{ height: "60px" }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                className="inline-flex items-center justify-center rounded-md text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:hidden"
                style={{ width: "44px", height: "44px" }}
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div className="flex items-center gap-2 text-white">
                <Sprout className="h-6 w-6" />
                <span className="text-lg font-semibold tracking-tight">AgriPOS</span>
              </div>
            </div>
            <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
              <a
                href="#features"
                className="text-sm font-medium text-white/80 transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Features
              </a>
              <a
                href="#how-it-works"
                className="text-sm font-medium text-white/80 transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                How it works
              </a>
              <Link
                to="/owner/login"
                className="text-sm font-medium text-white/80 transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Owner Login
              </Link>
              <Link
                to="/seller/login"
                className="text-sm font-medium text-white/80 transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Seller Login
              </Link>
            </nav>
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="inline-flex items-center justify-center rounded-md text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{ width: "44px", height: "44px" }}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          {/* Mobile menu */}
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-t border-white/10 md:hidden"
            >
              <nav aria-label="Main navigation" className="divide-y divide-border bg-card px-6">
                {["Features", "How it works"].map((label) => (
                  <a
                    key={label}
                    href={`#${label.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#283618]"
                    style={{ height: "48px" }}
                  >
                    {label}
                  </a>
                ))}
                <div className="space-y-3 px-0 py-4">
                  <Link
                    to="/owner/login"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-[#3a4f22] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#283618]"
                    style={{ minHeight: "48px" }}
                  >
                    Owner Login
                  </Link>
                  <Link
                    to="/seller/login"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center justify-center rounded-md border-2 border-primary px-4 py-3 text-sm font-semibold text-primary transition-all duration-200 hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#283618]"
                    style={{ minHeight: "48px" }}
                  >
                    Seller Login
                  </Link>
                </div>
              </nav>
            </motion.div>
          )}
        </div>

        {/* Hero content */}
        <div
          className="relative z-10 mx-auto flex max-w-5xl flex-col items-center justify-center px-6 text-center"
          style={{ minHeight: "calc(100svh - 60px)" }}
        >
          {/* Eyebrow pill */}
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0 }}
            className="rounded-full px-3.5 py-1.5 font-semibold uppercase text-white"
            style={{ background: "rgba(40,54,24,0.85)", padding: "6px 14px", lineHeight: "1.5", fontSize: "0.6875rem", letterSpacing: "0.14em", fontWeight: 600 }}
          >
            Agricultural POS System
          </motion.span>

          {/* H1 */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="font-extrabold text-white"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              lineHeight: 1.15,
              maxWidth: "720px",
              margin: "20px auto 0",
              letterSpacing: "-0.02em",
              textShadow: "0 2px 20px rgba(0,0,0,0.4)",
            }}
          >
            Run your agri-supply shop
            <br />
            without the chaos.
          </motion.h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="font-normal text-white/85"
            style={{
              fontSize: "clamp(1rem, 2vw, 1.25rem)",
              lineHeight: 1.5,
              maxWidth: "560px",
              margin: "16px auto 0",
            }}
          >
            AgriPOS keeps your stock accurate, your sales logged, and your team on the same page \u2014 from any device.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4 sm:w-auto"
            style={{ marginTop: "40px" }}
          >
            <Link
              to="/owner/login"
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-md border-2 border-white/90 bg-[#283618] px-8 text-base font-semibold text-white transition-all duration-200 hover:bg-[#3a4f22] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{
                padding: "14px 32px",
                minHeight: "56px",
                boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
                fontSize: "1rem",
              }}
            >
              Owner Login
            </Link>

            <div className="flex w-full items-center gap-3 sm:hidden">
              <div className="h-px flex-1 bg-white/30" />
              <span className="text-sm font-medium uppercase tracking-wider text-white/60">or</span>
              <div className="h-px flex-1 bg-white/30" />
            </div>

            <Link
              to="/seller/login"
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-md border-2 border-white bg-transparent px-8 text-base font-semibold text-white transition-all duration-200 hover:bg-white hover:text-[#283618] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{
                padding: "14px 32px",
                minHeight: "56px",
                fontSize: "1rem",
              }}
            >
              Seller Login
            </Link>
          </motion.div>

          {/* Slider dots */}
          <div
            className="flex items-center justify-center gap-1.5"
            style={{ marginTop: "clamp(24px, 4vw, 40px)" }}
          >
            {HERO_IMAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === idx ? "true" : undefined}
                className="rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                style={{
                  height: "6px",
                  width: i === idx ? "24px" : "6px",
                  background: i === idx ? "#fff" : "rgba(255,255,255,0.5)",
                  border: "none",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        {/* Chevron */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-white/80"
        >
          <ChevronDown className="h-6 w-6" />
        </motion.div>
      </section>

      {/* ── TRUST BAR ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="w-full"
        style={{ background: "#283618" }}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 py-4 md:flex-nowrap">
          {TRUST_ITEMS.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm font-medium text-white" style={{ fontSize: "0.875rem" }}>
                ✓ {item}
              </span>
              {i < TRUST_ITEMS.length - 1 && (
                <span
                  className="hidden text-white/30 md:inline"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  |
                </span>
              )}
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── FEATURES ── */}
      <section
        id="features"
        className="border-t border-border"
        style={{
          paddingTop: "clamp(64px, 8vw, 120px)",
          paddingBottom: "clamp(64px, 8vw, 120px)",
        }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div style={{ marginBottom: "48px", textAlign: "center" }}>
            <span style={{
              display: "inline-block",
              fontSize: "0.6875rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "var(--color-primary)",
              marginBottom: "8px"
            }}>
              Why AgriPOS
            </span>
            <h2 style={{
              fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              marginTop: "8px"
            }}>
              Built for the way agri-shops actually work.
            </h2>
          </div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6"
          >
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.4 }}
                className="rounded-xl border border-border bg-card transition hover:-translate-y-0.5"
                style={{ padding: "clamp(24px, 3vw, 32px)" }}
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <p className="text-2xl font-semibold tracking-tight" style={{ lineHeight: 1.15 }}>
                  {f.stat}
                </p>
                <p
                  className="mt-2"
                  style={{
                    fontSize: "0.875rem",
                    lineHeight: 1.7,
                    color: "var(--color-muted-foreground)",
                  }}
                >
                  {f.label}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section
        id="how-it-works"
        className="border-t border-border bg-accent/30"
        style={{
          paddingTop: "clamp(64px, 8vw, 120px)",
          paddingBottom: "clamp(64px, 8vw, 120px)",
        }}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div style={{ marginBottom: "48px" }}>
            <span
              className="              inline-block text-sm font-semibold uppercase tracking-[0.18em] text-primary"
              style={{ marginBottom: "8px" }}
            >
              How it works
            </span>
            <h2
              className="text-3xl font-semibold tracking-tight md:text-4xl"
              style={{ lineHeight: 1.15, marginTop: "8px" }}
            >
              From shelf to receipt in three simple steps.
            </h2>
          </div>
          <div className="grid gap-10 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative"
                style={{
                  marginBottom: i < STEPS.length - 1 ? "clamp(32px, 4vw, 48px)" : 0,
                }}
              >
                <span
                  className="absolute select-none text-[4rem] font-extrabold opacity-[0.12]"
                  style={{
                    color: theme === "dark" ? "#4a7c2f" : "#283618",
                    top: "-1em",
                    left: "-0.15em",
                    lineHeight: 1,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="relative text-base" style={{ lineHeight: 1.7, paddingTop: "3rem" }}>
                  {step}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        className="border-t border-border"
        style={{
          paddingTop: "clamp(64px, 8vw, 120px)",
          paddingBottom: "clamp(64px, 8vw, 120px)",
        }}
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <div className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">AgriPOS</span>
            <span className="ml-3 text-sm text-muted-foreground" style={{ fontSize: "0.875rem" }}>
              Built for agricultural supply businesses
            </span>
          </div>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="inline-flex items-center justify-center rounded-md border border-border text-foreground transition-colors duration-200 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#283618]"
            style={{ width: "44px", height: "44px" }}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </footer>
    </div>
  );
}
