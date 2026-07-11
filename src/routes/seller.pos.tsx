import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, ShoppingCart, X, Check, Printer, Search, MessageCircle } from "lucide-react";
import { format, addDays } from "date-fns";
import { SellerLayout } from "@/components/seller/SellerLayout";
import { supabase, type Product, type Category, type Customer } from "@/integrations/supabase/client";
import { formatKES, productName } from "@/lib/format";
import { HoverTip } from "@/components/ui/tooltip";
import { useOnline } from "@/hooks/use-online";
import { enqueue, getQueue, dequeue } from "@/lib/offline-queue";
import { toast } from "sonner";

type PaymentMethod = "cash" | "mpesa" | "loan";
type PaymentDetails = {
  method: PaymentMethod;
  mpesaCode?: string;
  loanCustomerId?: string;
  newCustomer?: { full_name: string; phone: string; national_id?: string };
  dueDate?: string;
};

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
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<null | {
    items: CartLine[]; total: number; at: Date; customer: string; payment: PaymentDetails;
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
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").order("full_name");
      return (data ?? []) as Customer[];
    },
  });

  const visible = useMemo(
    () => products.filter((p) => {
      if (catFilter && p.category_id !== catFilter) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return [p.brand, p.grade, p.type, p.size].some((v) => (v ?? "").toLowerCase().includes(s));
    }),
    [products, catFilter, search]
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
            p_payment_method: sale.payment_method ?? "cash",
            p_mpesa_code: sale.mpesa_code ?? null,
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
    mutationFn: async (payment: PaymentDetails) => {
      const items = cart.map((l) => ({ product_id: l.product.id, quantity: l.qty }));

      if (!online) {
        // Loans need a live customer lookup, so the UI disables that option
        // while offline \u2014 only cash/mpesa ever reach this branch.
        enqueue({
          customer_name: customer,
          items,
          total,
          payment_method: payment.method === "loan" ? "cash" : payment.method,
          mpesa_code: payment.method === "mpesa" ? payment.mpesaCode : undefined,
        });
        return;
      }

      const { error } = await supabase.rpc("create_sale", {
        p_customer_name: customer,
        p_items: items,
        p_payment_method: payment.method,
        p_mpesa_code: payment.method === "mpesa" ? (payment.mpesaCode || null) : null,
        p_customer_id: payment.method === "loan" ? (payment.loanCustomerId ?? null) : null,
        p_new_customer: payment.method === "loan" && payment.newCustomer ? payment.newCustomer : null,
        p_due_date: payment.method === "loan" ? (payment.dueDate ?? null) : null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, payment) => {
      if (!online) {
        toast.warning("No internet \u2014 sale saved locally and will sync when you\u2019re back online.");
      }
      setConfirmed({ items: cart, total, at: new Date(), customer, payment });
      setCart([]); setCustomer(""); setCartOpen(false);
      qc.invalidateQueries({ queryKey: ["seller-products"] });
      qc.invalidateQueries({ queryKey: ["my-sales"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: any) => {
      const msg = (e.message ?? "").toLowerCase();
      if (msg.includes("stock") || msg.includes("quantity") || msg.includes("exceed") || msg.includes("insufficient")) {
        toast.error("Not enough stock available. Please refresh and try again.");
      } else {
        toast.error(e.message);
      }
    },
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
          {/* search */}
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by brand, grade, size…"
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
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
                  <p className="text-sm font-medium leading-tight">{productName(p)}</p>
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
            confirm={(payment) => confirm.mutate(payment)} busy={confirm.isPending}
            online={online} customers={customers}
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
                  confirm={(payment) => confirm.mutate(payment)} busy={confirm.isPending}
                  online={online} customers={customers}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Receipt */}
        <AnimatePresence>
          {confirmed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-sm rounded-2xl bg-card p-6">
                <HoverTip label="Close">
                  <button onClick={() => setConfirmed(null)} aria-label="Close" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </HoverTip>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", duration: 0.6 }} className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-7 w-7" />
                </motion.div>
                <h2 className="text-center text-lg font-semibold">Sale confirmed</h2>
                <p className="mt-1 text-center text-xs text-muted-foreground">{format(confirmed.at, "MMM d, yyyy · HH:mm")}</p>
                {confirmed.customer && <p className="mt-1 text-center text-sm">Customer: {confirmed.customer}</p>}
                <p className="mt-1 text-center text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${confirmed.payment.method === "loan" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-primary/15 text-primary"}`}>
                    {confirmed.payment.method === "mpesa" ? "M-Pesa" : confirmed.payment.method === "loan" ? "Loan" : "Cash"}
                  </span>
                </p>
                {confirmed.payment.method === "loan" && confirmed.payment.dueDate && (
                  <p className="mt-1 text-center text-xs text-muted-foreground">Due {format(new Date(confirmed.payment.dueDate), "MMM d, yyyy")}</p>
                )}
                <div className="my-4 border-y border-border py-3 text-sm">
                  {confirmed.items.map((l) => (
                    <div key={l.product.id} className="flex justify-between py-1">
                      <span>{productName(l.product)} × {l.qty}</span>
                      <span className="tabular-nums">{formatKES(l.product.price * l.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatKES(confirmed.total)}</span></div>
                <div className="mt-5 space-y-2">
                  <div className="flex gap-2">
                    <button onClick={() => window.print()} className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-border py-2 text-sm hover:bg-accent">
                      <Printer className="h-4 w-4" /> Print
                    </button>
                    <button onClick={() => {
                      const lines = confirmed.items.map((l) => `${productName(l.product)} ×${l.qty}  ${formatKES(l.product.price * l.qty)}`).join("\n");
                      const msg = `*AgriPOS Receipt*\n${confirmed.customer ? `Customer: ${confirmed.customer}\n` : ""}${format(confirmed.at, "MMM d, yyyy HH:mm")}\n\n${lines}\n\n*Total: ${formatKES(confirmed.total)}*`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                    }} className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-border py-2 text-sm hover:bg-accent">
                      <MessageCircle className="h-4 w-4" /> WhatsApp
                    </button>
                  </div>
                  <button onClick={() => setConfirmed(null)} className="w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-[#3a4f22]">New sale</button>
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
  cart, customer, setCustomer, total, updateQty, removeItem, confirm, busy, online, customers,
}: {
  cart: CartLine[]; customer: string; setCustomer: (s: string) => void;
  total: number; updateQty: (id: string, d: number) => void;
  removeItem: (id: string) => void; confirm: (payment: PaymentDetails) => void; busy: boolean;
  online: boolean; customers: Customer[];
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [mpesaCode, setMpesaCode] = useState("");
  const [loanMode, setLoanMode] = useState<"existing" | "new">("existing");
  const [loanCustomerId, setLoanCustomerId] = useState<string | null>(null);
  const [loanSearch, setLoanSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newNationalId, setNewNationalId] = useState("");
  const [dueDate, setDueDate] = useState(() => format(addDays(new Date(), 30), "yyyy-MM-dd"));

  // Reset the payment form once the cart empties out (after a successful sale).
  useEffect(() => {
    if (cart.length !== 0) return;
    setMethod("cash"); setMpesaCode(""); setLoanMode("existing"); setLoanCustomerId(null);
    setLoanSearch(""); setNewName(""); setNewPhone(""); setNewNationalId("");
    setDueDate(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  }, [cart.length]);

  const filteredCustomers = customers.filter((c) => {
    if (!loanSearch) return true;
    const s = loanSearch.toLowerCase();
    return c.full_name.toLowerCase().includes(s) || (c.phone ?? "").includes(loanSearch);
  });

  const canSubmit = method !== "loan" || (
    !!dueDate && (loanMode === "existing" ? !!loanCustomerId : (newName.trim().length > 0 && newPhone.trim().length > 0))
  );

  const onConfirm = () => {
    confirm({
      method,
      mpesaCode: method === "mpesa" ? (mpesaCode.trim() || undefined) : undefined,
      loanCustomerId: method === "loan" && loanMode === "existing" ? (loanCustomerId ?? undefined) : undefined,
      newCustomer: method === "loan" && loanMode === "new"
        ? { full_name: newName.trim(), phone: newPhone.trim(), national_id: newNationalId.trim() || undefined }
        : undefined,
      dueDate: method === "loan" ? dueDate : undefined,
    });
  };

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
                <p className="truncate text-sm font-medium">{productName(l.product)}</p>
                <p className="text-xs text-muted-foreground">{formatKES(l.product.price)} ea</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => updateQty(l.product.id, -1)} className="rounded-md border border-border p-1"><Minus className="h-3 w-3" /></button>
                <span className="w-6 text-center text-sm font-medium">{l.qty}</span>
                <button onClick={() => updateQty(l.product.id, 1)} className="rounded-md border border-border p-1"><Plus className="h-3 w-3" /></button>
              </div>
              <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatKES(l.product.price * l.qty)}</span>
              <HoverTip label="Remove item">
                <button onClick={() => removeItem(l.product.id)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
              </HoverTip>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Customer (optional)</label>
        <input value={customer} onChange={(e) => setCustomer(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Payment method</label>
        <div className="grid grid-cols-3 gap-2">
          {(["cash", "mpesa", "loan"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={m === "loan" && !online}
              onClick={() => setMethod(m)}
              className={`rounded-md border px-2 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                method === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"
              } ${m === "loan" && !online ? "cursor-not-allowed opacity-40" : ""}`}
            >
              {m === "mpesa" ? "M-Pesa" : m === "loan" ? "Loan" : "Cash"}
            </button>
          ))}
        </div>
        {method === "loan" && !online && (
          <p className="mt-1.5 text-[11px] text-amber-600">Loans need an internet connection.</p>
        )}
      </div>

      {method === "mpesa" && (
        <div className="mt-3">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">M-Pesa code (optional)</label>
          <input value={mpesaCode} onChange={(e) => setMpesaCode(e.target.value)} placeholder="e.g. QJ7X1ABCD2" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
      )}

      {method === "loan" && (
        <div className="mt-3 space-y-3 rounded-lg border border-dashed border-border p-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => setLoanMode("existing")}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${loanMode === "existing" ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"}`}>
              Existing client
            </button>
            <button type="button" onClick={() => setLoanMode("new")}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${loanMode === "new" ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"}`}>
              New client
            </button>
          </div>

          {loanMode === "existing" ? (
            <div>
              <input
                value={loanSearch}
                onChange={(e) => { setLoanSearch(e.target.value); setLoanCustomerId(null); }}
                placeholder="Search client by name or phone…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {filteredCustomers.length === 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">No clients found — switch to "New client".</p>
                )}
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setLoanCustomerId(c.id)}
                    className={`w-full rounded-md border px-2.5 py-1.5 text-left text-xs ${loanCustomerId === c.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}
                  >
                    <span className="font-medium">{c.full_name}</span>
                    {c.phone && <span className="text-muted-foreground"> · {c.phone}</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Client full name" required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone number (for follow-up)" required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              <input value={newNationalId} onChange={(e) => setNewNationalId(e.target.value)} placeholder="National ID (optional)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-2xl font-bold tracking-tight">{formatKES(total)}</span>
      </div>

      <button
        onClick={onConfirm}
        disabled={cart.length === 0 || busy || !canSubmit}
        className="mt-4 w-full rounded-md bg-primary py-3.5 text-sm font-bold text-primary-foreground transition active:scale-[0.97] hover:bg-[#3a4f22] disabled:opacity-50"
      >
        {busy ? "Processing…" : "Confirm Sale"}
      </button>
    </div>
  );
}
