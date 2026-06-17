import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Pencil, Trash2, X, PackagePlus } from "lucide-react";
import { OwnerLayout } from "@/components/owner/OwnerLayout";
import { supabase, type Product, type Category } from "@/integrations/supabase/client";
import { formatKES } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/products")({
  component: Products,
});

type Draft = Partial<Product> & { category_id?: string | null };

function Products() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState<Product | null>(null);
  const [restock, setRestock] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState(0);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").order("created_at", { ascending: false });
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

  const upsert = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        category_id: d.category_id ?? null,
        brand: d.brand ?? "",
        grade: d.grade ?? null,
        type: d.type ?? null,
        size: d.size ?? null,
        price: Number(d.price ?? 0),
        stock_quantity: Number(d.stock_quantity ?? 0),
        low_stock_threshold: Number(d.low_stock_threshold ?? 10),
        is_active: d.is_active ?? true,
      };
      if (d.id) {
        const { error } = await supabase.from("products").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Product saved");
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (p: Product) => {
      const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deactivated");
      setConfirmDel(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const restockMutation = useMutation({
    mutationFn: async ({ id, currentQty, qty }: { id: string; currentQty: number; qty: number }) => {
      const { error } = await supabase.from("products").update({ stock_quantity: currentQty + qty, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Stock updated");
      setRestock(null);
      setRestockQty(0);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = products.filter((p) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return [p.brand, p.grade, p.type, p.size].some((v) => (v ?? "").toLowerCase().includes(s));
  });

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "—";

  return (
    <OwnerLayout title="Products">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by brand, grade, size…"
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => setEditing({ is_active: true, low_stock_threshold: 10 })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-[#3a4f22] active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      {/* desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-accent/30 text-left text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Brand</th>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">No products yet.</td></tr>
            )}
            {filtered.map((p) => {
              const out = p.stock_quantity === 0;
              const low = p.stock_quantity <= p.low_stock_threshold;
              return (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/20">
                  <td className="px-4 py-3 text-muted-foreground">{catName(p.category_id)}</td>
                  <td className="px-4 py-3 font-medium">{p.brand}</td>
                  <td className="px-4 py-3">{p.grade ?? "—"}</td>
                  <td className="px-4 py-3">{p.type ?? "—"}</td>
                  <td className="px-4 py-3">{p.size ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatKES(p.price)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`tabular-nums ${out ? "text-destructive" : low ? "text-amber-600" : ""}`}>{p.stock_quantity}</span>
                    {out ? <span className="ml-2 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-destructive">Out</span>
                      : low ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700 animate-slow-pulse dark:bg-amber-900/40 dark:text-amber-300">Low</span>
                      : <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">OK</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive.mutate(p)} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${p.is_active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {p.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setRestock(p); setRestockQty(0); }} className="rounded p-1.5 hover:bg-accent text-emerald-600"><PackagePlus className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setEditing(p)} className="rounded p-1.5 hover:bg-accent"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setConfirmDel(p)} className="rounded p-1.5 hover:bg-accent text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className="space-y-2 md:hidden">
        {filtered.map((p) => {
          const out = p.stock_quantity === 0;
          const low = p.stock_quantity <= p.low_stock_threshold;
          return (
            <div key={p.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{p.brand} {p.size && <span className="text-muted-foreground">· {p.size}</span>}</p>
                  <p className="text-xs text-muted-foreground">{catName(p.category_id)} · {p.grade ?? "—"}</p>
                </div>
                <p className="font-semibold">{formatKES(p.price)}</p>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className={out ? "text-destructive" : low ? "text-amber-600" : "text-muted-foreground"}>{p.stock_quantity} in stock</span>
                <div className="flex gap-2">
                  <button onClick={() => { setRestock(p); setRestockQty(0); }} className="rounded border border-border px-2 py-1 text-emerald-600">Restock</button>
                  <button onClick={() => setEditing(p)} className="rounded border border-border px-2 py-1">Edit</button>
                  <button onClick={() => setConfirmDel(p)} className="rounded border border-border px-2 py-1 text-destructive">Deactivate</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Slide-over edit panel */}
      <AnimatePresence>
        {editing && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40" onClick={() => setEditing(null)} />
            <motion.aside
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.3 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-6"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{editing.id ? "Edit product" : "Add product"}</h2>
                <button onClick={() => setEditing(null)}><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); upsert.mutate(editing); }} className="space-y-4">
                <Field label="Category">
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editing.category_id ?? ""} onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })} required>
                    <option value="">Select…</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Brand"><Input value={editing.brand ?? ""} onChange={(v) => setEditing({ ...editing, brand: v })} required /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Grade"><Input value={editing.grade ?? ""} onChange={(v) => setEditing({ ...editing, grade: v })} /></Field>
                  <Field label="Type"><Input value={editing.type ?? ""} onChange={(v) => setEditing({ ...editing, type: v })} /></Field>
                </div>
                <Field label="Size"><Input value={editing.size ?? ""} onChange={(v) => setEditing({ ...editing, size: v })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Price (KES)"><Input type="number" value={String(editing.price ?? "")} onChange={(v) => setEditing({ ...editing, price: Number(v) })} required /></Field>
                  <Field label="Stock"><Input type="number" value={String(editing.stock_quantity ?? "")} onChange={(v) => setEditing({ ...editing, stock_quantity: Number(v) })} required /></Field>
                </div>
                <Field label="Low stock threshold"><Input type="number" value={String(editing.low_stock_threshold ?? 10)} onChange={(v) => setEditing({ ...editing, low_stock_threshold: Number(v) })} /></Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="h-4 w-4" />
                  Active
                </label>
                <button type="submit" disabled={upsert.isPending} className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-[#3a4f22] active:scale-[0.97]">
                  {upsert.isPending ? "Saving…" : "Save"}
                </button>
              </form>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* delete confirm */}
      <AnimatePresence>
        {confirmDel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDel(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="w-full max-w-sm rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold">Deactivate product?</h3>
              <p className="mt-2 text-sm text-muted-foreground">"{confirmDel.brand}" will be hidden from POS but sales history is preserved.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setConfirmDel(null)} className="rounded-md border border-border px-3 py-2 text-sm">Cancel</button>
                <button onClick={() => del.mutate(confirmDel.id)} className="rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground">Deactivate</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* restock modal */}
      <AnimatePresence>
        {restock && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRestock(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="w-full max-w-sm rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold">Restock — {restock.brand}</h3>
              <p className="mt-1 text-sm text-muted-foreground">Current stock: {restock.stock_quantity}</p>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Quantity to add</label>
                  <input type="number" min={1} value={restockQty || ""} onChange={(e) => setRestockQty(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                {restockQty > 0 && (
                  <p className="text-sm">New total: <span className="font-semibold">{restock.stock_quantity + restockQty}</span></p>
                )}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setRestock(null)} className="rounded-md border border-border px-3 py-2 text-sm">Cancel</button>
                <button onClick={() => restockMutation.mutate({ id: restock.id, currentQty: restock.stock_quantity, qty: restockQty })}
                  disabled={restockQty < 1 || restockMutation.isPending}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {restockMutation.isPending ? "Adding…" : "Add Stock"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
function Input({ value, onChange, type = "text", required }: { value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <input type={type} value={value} required={required} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
  );
}
