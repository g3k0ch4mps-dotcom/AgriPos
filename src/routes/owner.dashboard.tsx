import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { format, subDays, startOfDay, startOfMonth, endOfMonth, subMonths, getHours } from "date-fns";
import { TrendingUp, TrendingDown, Package, ShoppingBag, DollarSign, Boxes, Users } from "lucide-react";
import { OwnerLayout } from "@/components/owner/OwnerLayout";
import { supabase } from "@/integrations/supabase/client";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/owner/dashboard")({
  component: Dashboard,
});

type SaleRow = { id: string; total_amount: number; created_at: string; seller_id: string | null };
type SaleItemRow = { quantity: number; subtotal: number; product_id: string; sale_id: string };
type ProductRow = {
  id: string; brand: string; size: string | null; stock_quantity: number;
  low_stock_threshold: number; price: number; category_id: string | null; is_active: boolean;
};
type CategoryRow = { id: string; name: string };

function Dashboard() {
  const [range, setRange] = useState(30);
  const since = subDays(new Date(), 60).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [salesR, itemsR, prodR, catR, profR] = await Promise.all([
        supabase.from("sales").select("id,total_amount,created_at,seller_id").gte("created_at", since).order("created_at"),
        supabase.from("sale_items").select("quantity,subtotal,product_id,sale_id"),
        supabase.from("products").select("id,brand,size,stock_quantity,low_stock_threshold,price,category_id,is_active"),
        supabase.from("categories").select("id,name"),
        supabase.from("profiles").select("id,full_name"),
      ]);
      return {
        sales: (salesR.data ?? []) as SaleRow[],
        items: (itemsR.data ?? []) as SaleItemRow[],
        products: (prodR.data ?? []) as ProductRow[],
        categories: (catR.data ?? []) as CategoryRow[],
        profiles: (profR.data ?? []) as { id: string; full_name: string }[],
      };
    },
  });

  if (isLoading || !data) {
    return (
      <OwnerLayout title="Dashboard">
        <div className="text-sm text-muted-foreground">Loading dashboard…</div>
      </OwnerLayout>
    );
  }

  const { sales, items, products, categories, profiles } = data;
  const todayStart = startOfDay(new Date());
  const yesterdayStart = startOfDay(subDays(new Date(), 1));
  const monthStart = startOfMonth(new Date());
  const lastMonthStart = startOfMonth(subMonths(new Date(), 1));
  const lastMonthEnd = endOfMonth(subMonths(new Date(), 1));

  const todaySales = sales.filter((s) => new Date(s.created_at) >= todayStart);
  const yestSales = sales.filter((s) => {
    const d = new Date(s.created_at);
    return d >= yesterdayStart && d < todayStart;
  });
  const monthSales = sales.filter((s) => new Date(s.created_at) >= monthStart);
  const todayRev = todaySales.reduce((a, s) => a + Number(s.total_amount), 0);
  const yestRev = yestSales.reduce((a, s) => a + Number(s.total_amount), 0);
  const monthRev = monthSales.reduce((a, s) => a + Number(s.total_amount), 0);
  const activeProducts = products.filter((p) => p.is_active).length;

  // Revenue trend
  const trend: { date: string; revenue: number; tx: number }[] = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = startOfDay(subDays(new Date(), i));
    const dayStr = format(d, "MMM d");
    const dayEnd = new Date(d); dayEnd.setDate(dayEnd.getDate() + 1);
    const ds = sales.filter((s) => new Date(s.created_at) >= d && new Date(s.created_at) < dayEnd);
    trend.push({ date: dayStr, revenue: ds.reduce((a, s) => a + Number(s.total_amount), 0), tx: ds.length });
  }

  // Sales by category
  const catTotals = new Map<string, number>();
  for (const it of items) {
    const p = products.find((pr) => pr.id === it.product_id);
    if (!p?.category_id) continue;
    catTotals.set(p.category_id, (catTotals.get(p.category_id) ?? 0) + Number(it.subtotal));
  }
  const catData = categories.map((c, i) => ({
    name: c.name, value: catTotals.get(c.id) ?? 0, fill: CHART_COLORS[i % CHART_COLORS.length],
  })).filter((c) => c.value > 0);
  const catTotal = catData.reduce((a, c) => a + c.value, 0) || 1;

  // Top products
  const prodTotals = new Map<string, number>();
  for (const it of items) prodTotals.set(it.product_id, (prodTotals.get(it.product_id) ?? 0) + Number(it.subtotal));
  const topProducts = Array.from(prodTotals.entries())
    .map(([pid, rev]) => {
      const p = products.find((x) => x.id === pid);
      return { name: p ? `${p.brand}${p.size ? ` ${p.size}` : ""}` : "—", revenue: rev };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // Seller performance
  const sellerRev = new Map<string, number>();
  const sellerTx = new Map<string, number>();
  for (const s of sales) {
    if (!s.seller_id) continue;
    sellerRev.set(s.seller_id, (sellerRev.get(s.seller_id) ?? 0) + Number(s.total_amount));
    sellerTx.set(s.seller_id, (sellerTx.get(s.seller_id) ?? 0) + 1);
  }
  const sellerData = Array.from(sellerRev.entries())
    .map(([sid, rev]) => ({
      name: profiles.find((p) => p.id === sid)?.full_name ?? sid.slice(0, 8),
      revenue: rev,
      tx: sellerTx.get(sid) ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Hourly today
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}h`, value: 0 }));
  for (const s of todaySales) hourly[getHours(new Date(s.created_at))].value += Number(s.total_amount);

  // Month vs last month, day by day
  const daysInMonth = endOfMonth(new Date()).getDate();
  const compare: { day: number; thisMonth: number; lastMonth: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const t = sales.filter((s) => {
      const dt = new Date(s.created_at);
      return dt >= monthStart && dt.getDate() === d;
    }).reduce((a, s) => a + Number(s.total_amount), 0);
    const l = sales.filter((s) => {
      const dt = new Date(s.created_at);
      return dt >= lastMonthStart && dt <= lastMonthEnd && dt.getDate() === d;
    }).reduce((a, s) => a + Number(s.total_amount), 0);
    compare.push({ day: d, thisMonth: t, lastMonth: l });
  }

  return (
    <OwnerLayout title="Dashboard">
      <div className="space-y-6">
        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Today's Revenue" value={todayRev} prev={yestRev} icon={DollarSign} money />
          <Kpi label="Today's Sales" value={todaySales.length} prev={yestSales.length} icon={ShoppingBag} />
          <Kpi label="This Month" value={monthRev} icon={TrendingUp} money />
          <Kpi label="Active Products" value={activeProducts} icon={Package} />
        </div>

        {/* Range toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Range</span>
          <div className="flex gap-1 rounded-lg border border-border bg-card p-0.5">
            {[7, 30, 60].map((d) => (
              <button key={d} onClick={() => setRange(d)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${range === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Charts row 1 */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={`Revenue trend — last ${range} days`} className="lg:col-span-2">
            {trend.every((t) => t.revenue === 0) ? <Empty msg="No sales yet — start selling to see your trend." /> : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CT />} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} fill="url(#g1)" animationDuration={1200} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="Sales by category">
            {catData.length === 0 ? <Empty msg="No category sales yet." /> : (
              <div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={catData} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2} animationDuration={1200}>
                      {catData.map((c, i) => <Cell key={i} fill={c.fill} />)}
                    </Pie>
                    <Tooltip content={<CT money />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1.5">
                  {catData.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.fill }} />
                        <span>{c.name}</span>
                      </div>
                      <div className="text-muted-foreground">
                        {((c.value / catTotal) * 100).toFixed(0)}% · {formatKES(c.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Charts row 2 */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Top products by revenue">
            {topProducts.length === 0 ? <Empty msg="No product sales yet." /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topProducts} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={100} />
                  <Tooltip content={<CT money />} />
                  <Bar dataKey="revenue" fill="var(--color-primary)" radius={[0, 4, 4, 0]} animationDuration={1200} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title="Hourly sales today">
            {hourly.every((h) => h.value === 0) ? <Empty msg="No sales today yet." /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval={2} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CT money />} />
                  <Bar dataKey="value" fill="var(--color-primary)" radius={[3, 3, 0, 0]} animationDuration={1200} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Seller performance */}
        {sellerData.length > 0 && (
          <Card title="Seller performance">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sellerData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={120} />
                <Tooltip content={<CT money />} />
                <Bar dataKey="revenue" fill="var(--color-primary)" radius={[0, 4, 4, 0]} animationDuration={1200} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Month comparison */}
        <Card title="This month vs last month">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={compare}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
              <Tooltip content={<CT money />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="thisMonth" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} animationDuration={1200} name="This month" />
              <Line type="monotone" dataKey="lastMonth" stroke="var(--color-muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} animationDuration={1200} name="Last month" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Stock health */}
        <Card title="Stock health">
          {products.length === 0 ? <Empty msg="No products yet — add products to track stock." /> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.filter((p) => p.is_active).sort((a, b) => a.stock_quantity - b.stock_quantity).map((p) => {
                const pct = Math.min(100, Math.round((p.stock_quantity / Math.max(p.low_stock_threshold * 3, 1)) * 100));
                const low = p.stock_quantity <= p.low_stock_threshold;
                const out = p.stock_quantity === 0;
                const color = out ? "bg-destructive" : pct < 33 ? "bg-destructive" : pct < 66 ? "bg-amber-500" : "bg-primary";
                return (
                  <div key={p.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.brand}</p>
                        <p className="text-xs text-muted-foreground">{p.size ?? "—"}</p>
                      </div>
                      {low && !out && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 animate-slow-pulse dark:bg-amber-900/40 dark:text-amber-300">Low</span>}
                      {out && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">Out</span>}
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.max(pct, out ? 0 : 4)}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{p.stock_quantity} in stock</p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </OwnerLayout>
  );
}

const CHART_COLORS = ["#283618", "#4a7c2f", "#82a96b", "#b6c7a0", "#d4b572", "#7a5c2e"];

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className={`rounded-xl border border-border bg-card p-5 ${className}`}
    >
      <h3 className="mb-4 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
      {children}
    </motion.div>
  );
}

function CT({ active, payload, label, money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border-l-2 border-primary bg-card px-3 py-2 text-xs shadow-sm">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-muted-foreground">
          <span className="text-foreground">{p.name}:</span>{" "}
          {money || typeof p.value === "number" ? formatKES(p.value) : p.value}
          {p.payload?.tx !== undefined && ` · ${p.payload.tx} tx`}
        </p>
      ))}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center text-center">
      <Boxes className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}

function Kpi({
  label, value, prev, icon: Icon, money,
}: { label: string; value: number; prev?: number; icon: any; money?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => (money ? formatKES(Math.round(v)) : Math.round(v).toLocaleString()));
  useEffect(() => {
    if (inView) animate(mv, value, { duration: 1.0, ease: "easeOut" });
  }, [inView, value, mv]);

  const delta = prev !== undefined && prev > 0 ? ((value - prev) / prev) * 100 : null;
  const up = delta !== null && delta >= 0;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <motion.p className="mt-3 text-2xl font-semibold tracking-tight">{display}</motion.p>
      {delta !== null && (
        <p className={`mt-1 inline-flex items-center gap-1 text-xs ${up ? "text-primary" : "text-destructive"}`}>
          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(delta).toFixed(0)}% vs yesterday
        </p>
      )}
    </motion.div>
  );
}
