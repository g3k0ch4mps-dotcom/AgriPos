import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Package, BarChart3, Cloud, ChevronDown, Moon, Sun, Sprout } from "lucide-react";
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

function Landing() {
  const [idx, setIdx] = useState(0);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % HERO_IMAGES.length), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HERO */}
      <section className="relative h-screen w-full overflow-hidden">
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
        <div className="absolute inset-0 bg-black/55" />

        {/* top bar */}
        <div className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
          <div className="flex items-center gap-2 text-white">
            <Sprout className="h-6 w-6" />
            <span className="text-lg font-semibold tracking-tight">AgriPOS</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="rounded-full border border-white/30 p-2 text-white transition hover:bg-white/10"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="relative z-10 mx-auto flex h-[calc(100vh-80px)] max-w-4xl flex-col items-center justify-center px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-full bg-primary/90 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-primary-foreground"
          >
            Agricultural Point of Sale
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-white md:text-6xl lg:text-[3.5rem]"
          >
            Every sale tracked.
            <br />
            Every stock counted.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-6 max-w-xl text-base text-white/85 md:text-lg"
          >
            AgriPOS gives farm supply shops a simple, powerful way to manage products,
            track inventory, and grow with confidence.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <Link
              to="/owner/login"
              className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition active:scale-[0.97] hover:bg-[#3a4f22]"
            >
              Owner Login
            </Link>
            <Link
              to="/seller/login"
              className="rounded-md border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition active:scale-[0.97] hover:bg-white/20"
            >
              Seller Login
            </Link>
          </motion.div>

          {/* slider dots */}
          <div className="mt-10 flex gap-1.5">
            {HERO_IMAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-1.5 bg-white/50"}`}
                aria-label={`slide ${i + 1}`}
              />
            ))}
          </div>
        </div>

        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-white/80"
        >
          <ChevronDown className="h-6 w-6" />
        </motion.div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          className="grid gap-6 md:grid-cols-3"
        >
          {[
            { icon: Package, stat: "Real-time", label: "Stock tracking across every product" },
            { icon: BarChart3, stat: "Daily & monthly", label: "Sales reports that tell the story" },
            { icon: Cloud, stat: "Multi-device", label: "Cloud-synced from till to office" },
          ].map((f, i) => (
            <motion.div
              key={i}
              variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.4 }}
              className="rounded-xl border border-border bg-card p-8 transition hover:-translate-y-0.5"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-semibold tracking-tight">{f.stat}</p>
              <p className="mt-2 text-sm text-muted-foreground">{f.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-border bg-accent/30">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="mb-12 max-w-xl">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-primary">
              How it works
            </span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              From shelf to receipt in three simple steps.
            </h2>
          </div>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              "Owner adds products with category, brand, grade, size, price, and stock.",
              "Seller logs in and processes customer sales in seconds.",
              "Owner reviews live dashboard — sales, stock levels, trends.",
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className="text-5xl font-bold text-primary/30">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <p className="mt-4 text-base leading-relaxed text-foreground">{step}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 md:flex-row">
          <div className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-primary" />
            <span className="font-semibold tracking-tight">AgriPOS</span>
            <span className="ml-3 text-sm text-muted-foreground">
              Built for agricultural supply businesses
            </span>
          </div>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="rounded-full border border-border p-2 text-foreground transition hover:bg-accent"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </footer>
    </div>
  );
}
