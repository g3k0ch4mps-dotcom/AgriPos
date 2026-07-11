import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Package } from "lucide-react";
import { OwnerLayout } from "@/components/owner/OwnerLayout";
import { supabase, type Category } from "@/integrations/supabase/client";
import { formatKES } from "@/lib/format";
import { HoverTip } from "@/components/ui/tooltip";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/categories")({
  component: Categories,
});

function Categories() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const [catR, prodR, itemsR] = await Promise.all([
        supabase.from("categories").select("*").order("name"),
        supabase.from("products").select("id,category_id"),
        supabase.from("sale_items").select("product_id,subtotal"),
      ]);
      const cats = (catR.data ?? []) as Category[];
      const products = (prodR.data ?? []) as { id: string; category_id: string | null }[];
      const saleItems = (itemsR.data ?? []) as { product_id: string; subtotal: number }[];

      const prodCount = new Map<string, number>();
      const catRevenue = new Map<string, number>();

      for (const p of products) {
        if (!p.category_id) continue;
        prodCount.set(p.category_id, (prodCount.get(p.category_id) ?? 0) + 1);
      }

      for (const si of saleItems) {
        const p = products.find((x) => x.id === si.product_id);
        if (!p?.category_id) continue;
        catRevenue.set(p.category_id, (catRevenue.get(p.category_id) ?? 0) + Number(si.subtotal));
      }

      return cats.map((c) => ({
        ...c,
        product_count: prodCount.get(c.id) ?? 0,
        revenue: catRevenue.get(c.id) ?? 0,
      }));
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("categories").insert({ name });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); setName(""); toast.success("Added"); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <OwnerLayout title="Categories">
      <div className="max-w-xl">
        <form onSubmit={(e) => { e.preventDefault(); if (name) add.mutate(); }} className="mb-6 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <button type="submit" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-[#3a4f22] active:scale-[0.97]">
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {data.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No categories yet.</div>}
          {data.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0">
              <div className="flex items-center gap-3">
                <span className="font-medium">{c.name}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Package className="h-3 w-3" /> {c.product_count}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">{formatKES(c.revenue)}</span>
                <HoverTip label="Delete category">
                  <button onClick={() => del.mutate(c.id)} className="rounded p-1.5 text-destructive hover:bg-accent"><Trash2 className="h-4 w-4" /></button>
                </HoverTip>
              </div>
            </div>
          ))}
        </div>
      </div>
    </OwnerLayout>
  );
}
