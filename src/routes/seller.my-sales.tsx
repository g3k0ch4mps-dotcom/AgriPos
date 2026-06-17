import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, startOfDay } from "date-fns";
import { ChevronDown } from "lucide-react";
import { SellerLayout } from "@/components/seller/SellerLayout";
import { useAuth } from "@/hooks/use-auth";
import { supabase, type Sale, type SaleItem, type Product } from "@/integrations/supabase/client";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/seller/my-sales")({
  component: MySales,
});

function MySales() {
  const { profile } = useAuth();
  const [open, setOpen] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["my-sales", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const fromIso = startOfDay(new Date()).toISOString();
      const [sales, items, products] = await Promise.all([
        supabase.from("sales").select("*").eq("seller_id", profile!.id).gte("created_at", fromIso).order("created_at", { ascending: false }),
        supabase.from("sale_items").select("*"),
        supabase.from("products").select("id,brand,size"),
      ]);
      return {
        sales: (sales.data ?? []) as Sale[],
        items: (items.data ?? []) as SaleItem[],
        products: (products.data ?? []) as Product[],
      };
    },
  });

  const total = data?.sales.reduce((a, s) => a + Number(s.total_amount), 0) ?? 0;

  return (
    <SellerLayout>
      <div className="p-4">
        <div className="mb-4 rounded-xl border border-border bg-card p-5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Today's total</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{formatKES(total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data?.sales.length ?? 0} transactions</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {(!data || data.sales.length === 0) && (
            <div className="p-10 text-center text-sm text-muted-foreground">No sales yet today.</div>
          )}
          {data?.sales.map((s) => {
            const its = data.items.filter((i) => i.sale_id === s.id);
            const isOpen = open === s.id;
            return (
              <div key={s.id} className="border-b border-border last:border-0">
                <button onClick={() => setOpen(isOpen ? null : s.id)} className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-accent/20">
                  <span className="text-muted-foreground">{format(new Date(s.created_at), "HH:mm")}</span>
                  <span className="truncate">{s.customer_name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{its.length}</span>
                  <span className="font-semibold tabular-nums flex items-center gap-1">{formatKES(s.total_amount)} <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} /></span>
                </button>
                {isOpen && (
                  <div className="border-t border-border bg-accent/20 px-4 py-2 text-sm">
                    {its.map((i) => {
                      const p = data.products.find((pp) => pp.id === i.product_id);
                      return (
                        <div key={i.id} className="flex justify-between py-1">
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
      </div>
    </SellerLayout>
  );
}
