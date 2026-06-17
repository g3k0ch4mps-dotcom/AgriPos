import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Download, ChevronDown } from "lucide-react";
import { OwnerLayout } from "@/components/owner/OwnerLayout";
import { supabase, type Sale, type SaleItem, type Profile, type Product } from "@/integrations/supabase/client";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/owner/sales-history")({
  component: SalesHistory,
});

function SalesHistory() {
  const [from, setFrom] = useState(format(new Date(Date.now() - 30 * 86400000), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sellerId, setSellerId] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["sales-history", from, to],
    queryFn: async () => {
      const fromIso = new Date(from + "T00:00:00").toISOString();
      const toIso = new Date(to + "T23:59:59").toISOString();
      const [sales, items, profiles, products] = await Promise.all([
        supabase.from("sales").select("*").gte("created_at", fromIso).lte("created_at", toIso).order("created_at", { ascending: false }),
        supabase.from("sale_items").select("*"),
        supabase.from("profiles").select("id,full_name,role,created_at"),
        supabase.from("products").select("id,brand,size"),
      ]);
      return {
        sales: (sales.data ?? []) as Sale[],
        items: (items.data ?? []) as SaleItem[],
        profiles: (profiles.data ?? []) as Profile[],
        products: (products.data ?? []) as Product[],
      };
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.sales.filter((s) => {
      if (sellerId && s.seller_id !== sellerId) return false;
      if (search && !(s.customer_name ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, sellerId, search]);

  const total = filtered.reduce((a, s) => a + Number(s.total_amount), 0);

  const exportCsv = () => {
    if (!data) return;
    const rows = [["Date", "Customer", "Seller", "Items", "Total KES"]];
    for (const s of filtered) {
      const seller = data.profiles.find((p) => p.id === s.seller_id)?.full_name ?? "—";
      const its = data.items.filter((i) => i.sale_id === s.id);
      rows.push([format(new Date(s.created_at), "yyyy-MM-dd HH:mm"), s.customer_name ?? "", seller, String(its.length), String(s.total_amount)]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sales-${from}-to-${to}.csv`;
    a.click();
  };

  return (
    <OwnerLayout title="Sales History">
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">All sellers</option>
          {data?.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 6)}</option>)}
        </select>
        <input placeholder="Search customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <button onClick={exportCsv} className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-accent/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">{filtered.length} transactions</span>
        <span className="font-semibold">{formatKES(total)}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No sales for the selected filters.</div>
        ) : filtered.map((s) => {
          const seller = data?.profiles.find((p) => p.id === s.seller_id)?.full_name ?? "—";
          const its = data?.items.filter((i) => i.sale_id === s.id) ?? [];
          const open = expanded === s.id;
          return (
            <div key={s.id} className="border-b border-border last:border-0">
              <button onClick={() => setExpanded(open ? null : s.id)} className="grid w-full grid-cols-[1fr_1fr_1fr_auto_auto] items-center gap-4 px-4 py-3 text-left text-sm hover:bg-accent/20">
                <span className="text-muted-foreground">{format(new Date(s.created_at), "MMM d, HH:mm")}</span>
                <span>{s.customer_name ?? "—"}</span>
                <span className="text-muted-foreground">{seller}</span>
                <span className="text-xs">{its.length} items</span>
                <span className="flex items-center gap-1 font-semibold tabular-nums">{formatKES(s.total_amount)} <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} /></span>
              </button>
              {open && (
                <div className="border-t border-border bg-accent/20 px-4 py-3 text-sm">
                  {its.map((i) => {
                    const p = data?.products.find((pp) => pp.id === i.product_id);
                    return (
                      <div key={i.id} className="flex justify-between border-b border-border/60 py-1.5 last:border-0">
                        <span>{p ? `${p.brand}${p.size ? ` ${p.size}` : ""}` : "—"} × {i.quantity}</span>
                        <span className="tabular-nums">{formatKES(i.subtotal)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </OwnerLayout>
  );
}
