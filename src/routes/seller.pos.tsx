import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, ShoppingCart, X, Check, Printer } from "lucide-react";
import { format } from "date-fns";
import { SellerLayout } from "@/components/seller/SellerLayout";
import { supabase, type Product, type Category } from "@/integrations/supabase/client";
import { formatKES } from "@/lib/format";
import { useOnline } from "@/hooks/use-online";
import { enqueue, getQueue, dequeue } from "@/lib/offline-queue";
import { toast } from "sonner";

export const Route = createFileRoute("/seller/pos")({
  component: POS,
});

type CartLine = { product: Product; qty: number };

function POS() {
  const qc = useQueryClient();
  const online = useOnline();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("");
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<null | {
    items: CartLine[]; total: number; at: Date; customer: string;
  }>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["seller-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("is_active", true).order("brand");
      return (data ?? []) as Product[];
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").order("name");
      return (data ?? []) as Category[];
    },
  });

  const visible = useMemo(
    () => products.filter((p) => !catFilter || p.category_id === catFilter),
    [products, catFilter]
  );

  const total = cart.reduce((a, l) => a + l.product.price * l.qty, 0);

  const addToCart = (p: Product) => {
    if (p.stock_quantity === 0) return;
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i === -1) return [...c, { product: p, qty: 1 }];
      const copy = [...c];
      if (copy[i].qty >= p.stock_quantity) { toast.error("No more stock"); return copy; }
      copy[i] = { ...copy[i], qty: copy[i].qty + 1 };
      return copy;
    });
    setCartOpen(true);
  };

  const updateQty = (pid: string, d: number) => {
    setCart((c) => c.flatMap((l) => {
      if (l.product.id !== pid) return [l];
      const next = l.qty + d;
      if (next <= 0) return [];
      if (next > l.product.stock_quantity) { toast.error("No more stock"); return [l]; }
      return [{ ...l, qty: next }];
    }));
  };

  useEffect(() => {
    if (!online) return;
    const queue = getQueue();
    if (queue.length === 0) return;

    (async () => {
      let synced = 0;
      for (const sale of queue) {
        try {
          const { error } = await supabase.rpc("create_sale", {
            p_customer_name: sale.customer_name,
            p_items: sale.items,
          });
          if (!error) {
            dequeue(sale.id);
            synced++;
          }
        } catch {}
      }
      if (synced > 0) {
        toast.success(`${synced} offline sale${synced > 1 ? "s" : ""} synced successfully.`);
        qc.invalidateQueries({ queryKey: ["seller-products"] });
        qc.invalidateQueries({ queryKey: ["my-sales"] });
      }
    })();
  }, [online]);

  const confirm = useMutation({
    mutationFn: async () => {
      const items = cart.map((l) => ({ product_id: l.product.id, quantity: l.qty }));

      if (!online) {
        enqueue({ customer_name: customer, items, total });
        return;
      }

      const { error } = await supabase.rpc("create_sale", { p_customer_name: customer, p_items: items });
      if (error) throw error;
    },
    onSuccess: () => {
      if (!online) {
        toast.warning("No internet \u2014 sale saved locally and will sync when you\u2019re back online.");
      }
      setConfirmed({ items: cart, total, at: new Date(), customer });
      setCart([]); setCustomer(""); setCartOpen(false);
      qc.invalidateQueries({ queryKey: ["seller-products"] });
      qc.invalidateQueries({ queryKey: ["my-sales"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const catColor = (id: string | null) => {
    const i = categories.findIndex((c) => c.id === id);
    return ["#283618", "#4a7c2f", "#82a96b", "#d4b572", "#7a5c2e", "#3a6a1f"][i % 6] ?? "#283618";
  };

  return (
    <SellerLayout>
      <div className="flex flex-col lg:flex-row">
        {/* product area */}
        <div className="flex-1 p-4 lg:p-6">
          {/* category tabs */}
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
            <Tab active={!catFilter} onClick={() => setCatFilter(null)}>All</Tab>
            {categories.map((c) => (
              <Tab key={c.id} active={catFilter === c.id} onClick={() => setCatFilter(c.id)}>{c.name}</Tab>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
            {visible.length === 0 && <div className="col-span-full py-12 text-center text-sm text-muted-foreground">No products in this category.</div>}
            {visible.map((p) => {
              const out = p.stock_quantity === 0;
              return (
                <button
                  key={p.id}
                  disabled={out}
                  onClick={() => addToCart(p)}
                  className={`flex flex-col rounded-xl border border-border bg-card p-3 text-left transition active:scale-[0.97] ${out ? "opacity-40" : "hover:border-primary/40 hover:-translate-y-0.5"}`}
                >
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: catColor(p.category_id) }} />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{categories.find((c) => c.id === p.category_id)?.name ?? "—"}</span>
                  </div>
                  <p className="text-sm font-medium leading-tight">{p.brand}</p>
                  <p className="text-xs text-muted-foreground">{p.grade ?? ""}</p>
                  {p.size && <span className="mt-1 inline-block w-fit rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-primary">{p.size}</span>}
                  <p className="mt-2 text-lg font-bold tracking-tight">{formatKES(p.price)}</p>
                  <p className="mt-auto pt-1 text-right text-[10px] text-muted-foreground">{p.stock_quantity} left</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* cart — desktop column */}
        <aside className="hidden w-80 shrink-0 border-l border-border bg-card p-5 lg:block">
          <CartPanel
            cart={cart} customer={customer} setCustomer={setCustomer}
            total={total} updateQty={updateQty}
            removeItem={(id) => setCart((c) => c.filter((l) => l.product.id !== id))}
            confirm={() => confirm.mutate()} busy={confirm.isPending}
          />
        </aside>

        {/* Mobile cart toggle */}
        {cart.length > 0 && !cartOpen && (
          <button
            onClick={() => setCartOpen(true)}
            className="fixed bottom-20 left-4 right-4 z-30 flex items-center justify-between rounded-xl bg-primary px-5 py-3.5 text-primary-foreground shadow-lg lg:hidden"
          >
            <span className="flex items-center gap-2 font-semibold"><ShoppingCart className="h-5 w-5" /> {cart.length} items</span>
            <span className="font-bold">{formatKES(total)}</span>
          </button>
        )}

        {/* Mobile cart sheet */}
        <AnimatePresence>
          {cartOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setCartOpen(false)} />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "tween", duration: 0.3 }}
                className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-card p-5 lg:hidden">
                <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-muted" />
                <CartPanel
                  cart={cart} customer={customer} setCustomer={setCustomer}
                  total={total} updateQty={updateQty}
                  removeItem={(id) => setCart((c) => c.filter((l) => l.product.id !== id))}
                  confirm={() => confirm.mutate()} busy={confirm.isPending}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Receipt */}
        <AnimatePresence>
          {confirmed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-sm rounded-2xl bg-card p-6">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", duration: 0.6 }} className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-7 w-7" />
                </motion.div>
                <h2 className="text-center text-lg font-semibold">Sale confirmed</h2>
                <p className="mt-1 text-center text-xs text-muted-foreground">{format(confirmed.at, "MMM d, yyyy · HH:mm")}</p>
                {confirmed.customer && <p className="mt-1 text-center text-sm">Customer: {confirmed.customer}</p>}
                <div className="my-4 border-y border-border py-3 text-sm">
                  {confirmed.items.map((l) => (
                    <div key={l.product.id} className="flex justify-between py-1">
                      <span>{l.product.brand} × {l.qty}</span>
                      <span className="tabular-nums">{formatKES(l.product.price * l.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatKES(confirmed.total)}</span></div>
                <div className="mt-5 flex gap-2">
                  <button onClick={() => window.print()} className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-border py-2 text-sm hover:bg-accent">
                    <Printer className="h-4 w-4" /> Print
                  </button>
                  <button onClick={() => setConfirmed(null)} className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-[#3a4f22]">New sale</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SellerLayout>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
        active ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function CartPanel({
  cart, customer, setCustomer, total, updateQty, removeItem, confirm, busy,
}: {
  cart: CartLine[]; customer: string; setCustomer: (s: string) => void;
  total: number; updateQty: (id: string, d: number) => void;
  removeItem: (id: string) => void; confirm: () => void; busy: boolean;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Current sale</h2>
      {cart.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Tap products to add them here.
        </div>
      ) : (
        <div className="space-y-2">
          {cart.map((l) => (
            <div key={l.product.id} className="flex items-center gap-2 rounded-lg border border-border bg-background p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.product.brand}</p>
                <p className="text-xs text-muted-foreground">{formatKES(l.product.price)} ea</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => updateQty(l.product.id, -1)} className="rounded-md border border-border p-1"><Minus className="h-3 w-3" /></button>
                <span className="w-6 text-center text-sm font-medium">{l.qty}</span>
                <button onClick={() => updateQty(l.product.id, 1)} className="rounded-md border border-border p-1"><Plus className="h-3 w-3" /></button>
              </div>
              <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatKES(l.product.price * l.qty)}</span>
              <button onClick={() => removeItem(l.product.id)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Customer (optional)</label>
        <input value={customer} onChange={(e) => setCustomer(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-2xl font-bold tracking-tight">{formatKES(total)}</span>
      </div>

      <button
        onClick={confirm}
        disabled={cart.length === 0 || busy}
        className="mt-4 w-full rounded-md bg-primary py-3.5 text-sm font-bold text-primary-foreground transition active:scale-[0.97] hover:bg-[#3a4f22] disabled:opacity-50"
      >
        {busy ? "Processing…" : "Confirm Sale"}
      </button>
    </div>
  );
}
