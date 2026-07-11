import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  subWeeks, subMonths, subYears, subDays, addDays, eachDayOfInterval, eachMonthOfInterval,
  differenceInCalendarDays, isAfter,
} from "date-fns";
import { ChevronLeft, ChevronRight, Download, TrendingUp, TrendingDown, Receipt, Wallet, HandCoins } from "lucide-react";
import { OwnerLayout } from "@/components/owner/OwnerLayout";
import { supabase, type Sale, type Loan, type LoanPayment } from "@/integrations/supabase/client";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/owner/reports")({
  component: Reports,
});

type PeriodType = "week" | "month" | "year" | "custom";
const PAYMENT_LABEL: Record<Sale["payment_method"], string> = { cash: "Cash", mpesa: "M-Pesa", loan: "Loan" };
const PAYMENT_COLOR: Record<Sale["payment_method"], string> = { cash: "#4a7c2f", mpesa: "#3b7ea1", loan: "#c98a2c" };

function Reports() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [offset, setOffset] = useState(0); // periods back from the current one
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { start, end, prevStart, prevEnd, label } = useMemo(() => {
    const now = new Date();
    if (periodType === "week") {
      const s = startOfWeek(subWeeks(now, offset), { weekStartsOn: 1 });
      const e = endOfWeek(s, { weekStartsOn: 1 });
      return { start: s, end: e, prevStart: subWeeks(s, 1), prevEnd: subWeeks(e, 1), label: `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}` };
    }
    if (periodType === "year") {
      const s = startOfYear(subYears(now, offset));
      const e = endOfYear(s);
      return { start: s, end: e, prevStart: subYears(s, 1), prevEnd: subYears(e, 1), label: format(s, "yyyy") };
    }
    if (periodType === "custom") {
      const s = new Date(customFrom + "T00:00:00");
      const e = new Date(customTo + "T23:59:59");
      const days = Math.max(1, differenceInCalendarDays(e, s) + 1);
      return { start: s, end: e, prevStart: subDays(s, days), prevEnd: subDays(s, 1), label: `${format(s, "MMM d, yyyy")} – ${format(e, "MMM d, yyyy")}` };
    }
    // month
    const s = startOfMonth(subMonths(now, offset));
    const e = endOfMonth(s);
    return { start: s, end: e, prevStart: startOfMonth(subMonths(s, 1)), prevEnd: endOfMonth(subMonths(s, 1)), label: format(s, "MMMM yyyy") };
  }, [periodType, offset, customFrom, customTo]);

  const { data } = useQuery({
    queryKey: ["financial-reports"],
    queryFn: async () => {
      const [salesR, loansR, paymentsR] = await Promise.all([
        supabase.from("sales").select("id,total_amount,created_at,payment_method").order("created_at"),
        supabase.from("loans").select("*"),
        supabase.from("loan_payments").select("loan_id,amount"),
      ]);
      return {
        sales: (salesR.data ?? []) as Pick<Sale, "id" | "total_amount" | "created_at" | "payment_method">[],
        loans: (loansR.data ?? []) as Loan[],
        payments: (paymentsR.data ?? []) as Pick<LoanPayment, "loan_id" | "amount">[],
      };
    },
  });

  const sales = data?.sales ?? [];
  const inRange = (d: Date, a: Date, b: Date) => !isAfter(a, d) && !isAfter(d, b);
  const periodSales = sales.filter((s) => inRange(new Date(s.created_at), start, end));
  const prevPeriodSales = sales.filter((s) => inRange(new Date(s.created_at), prevStart, prevEnd));

  const revenue = periodSales.reduce((a, s) => a + Number(s.total_amount), 0);
  const prevRevenue = prevPeriodSales.reduce((a, s) => a + Number(s.total_amount), 0);
  const txCount = periodSales.length;
  const prevTxCount = prevPeriodSales.length;
  const avgSale = txCount > 0 ? revenue / txCount : 0;
  const prevAvgSale = prevTxCount > 0 ? prevRevenue / prevTxCount : 0;

  const outstandingCredit = useMemo(() => {
    if (!data) return 0;
    const paidByLoan = new Map<string, number>();
    for (const p of data.payments) paidByLoan.set(p.loan_id, (paidByLoan.get(p.loan_id) ?? 0) + Number(p.amount));
    return data.loans
      .filter((l) => l.status !== "paid")
      .reduce((a, l) => a + (Number(l.principal_amount) - (paidByLoan.get(l.id) ?? 0)), 0);
  }, [data]);

  const byMethod = (["cash", "mpesa", "loan"] as const).map((m) => ({
    name: PAYMENT_LABEL[m],
    method: m,
    value: periodSales.filter((s) => s.payment_method === m).reduce((a, s) => a + Number(s.total_amount), 0),
    fill: PAYMENT_COLOR[m],
  }));
  const methodTotal = byMethod.reduce((a, m) => a + m.value, 0) || 1;

  // Trend bucketing: daily for week/month/short custom, monthly for year/long custom
  const spanDays = differenceInCalendarDays(end, start) + 1;
  const bucketByMonth = periodType === "year" || spanDays > 62;
  const trend = useMemo(() => {
    if (bucketByMonth) {
      return eachMonthOfInterval({ start, end }).map((m) => {
        const mEnd = endOfMonth(m);
        const rev = periodSales.filter((s) => inRange(new Date(s.created_at), m, mEnd)).reduce((a, s) => a + Number(s.total_amount), 0);
        return { label: format(m, "MMM yyyy"), revenue: rev };
      });
    }
    return eachDayOfInterval({ start, end }).map((d) => {
      const dEnd = addDays(d, 1);
      const rev = periodSales.filter((s) => {
        const t = new Date(s.created_at);
        return t >= d && t < dEnd;
      }).reduce((a, s) => a + Number(s.total_amount), 0);
      return { label: format(d, spanDays > 31 ? "MMM d" : "EEE d"), revenue: rev };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodSales, bucketByMonth, start.getTime(), end.getTime()]);

  const exportCsv = () => {
    const header = ["Date", "Payment method", "Amount (KES)"];
    const rows = periodSales.map((s) => [format(new Date(s.created_at), "yyyy-MM-dd HH:mm"), PAYMENT_LABEL[s.payment_method], String(s.total_amount)]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `financial-report-${format(start, "yyyy-MM-dd")}-to-${format(end, "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const canGoForward = offset > 0;
  const canNavigate = periodType !== "custom";

  return (
    <OwnerLayout title="Financial Reports">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            {(["week", "month", "year", "custom"] as const).map((p) => (
              <button
                key={p}
                onClick={() => { setPeriodType(p); setOffset(0); }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition ${periodType === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {p === "week" ? "This Week" : p === "month" ? "This Month" : p === "year" ? "This Year" : "Custom"}
              </button>
            ))}
          </div>

          {canNavigate ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
              <button onClick={() => setOffset((o) => o + 1)} className="rounded p-1 hover:bg-accent" aria-label="Previous period">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[10rem] text-center text-sm font-medium">{label}</span>
              <button onClick={() => setOffset((o) => Math.max(0, o - 1))} disabled={!canGoForward} className="rounded p-1 hover:bg-accent disabled:opacity-30" aria-label="Next period">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              <span className="text-muted-foreground text-sm">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
            </div>
          )}
        </div>

        <button onClick={exportCsv} className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue" value={revenue} prev={prevRevenue} icon={Wallet} money />
        <Kpi label="Transactions" value={txCount} prev={prevTxCount} icon={Receipt} />
        <Kpi label="Average Sale" value={avgSale} prev={prevAvgSale} icon={TrendingUp} money />
        <div className="rounded-xl border border-amber-300/50 bg-amber-50 p-5 dark:border-amber-800/50 dark:bg-amber-950/20">
          <div className="flex items-center justify-between">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">Outstanding Credit</p>
            <HandCoins className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-amber-800 dark:text-amber-300">{formatKES(outstandingCredit)}</p>
          <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400/80">as of today, not period-limited</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title={`Revenue trend — ${label}`} className="lg:col-span-2">
          {trend.every((t) => t.revenue === 0) ? <Empty msg="No sales in this period." /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(trend.length / 8))} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <Tooltip content={<CT money />} />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} fill="url(#rg1)" animationDuration={800} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Revenue by payment method">
          {methodTotal <= 1 && byMethod.every((m) => m.value === 0) ? <Empty msg="No sales in this period." /> : (
            <div>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={byMethod} dataKey="value" innerRadius={52} outerRadius={80} paddingAngle={2} animationDuration={800}>
                    {byMethod.map((m, i) => <Cell key={i} fill={m.fill} />)}
                  </Pie>
                  <Tooltip content={<CT money />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1.5">
                {byMethod.map((m) => (
                  <div key={m.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: m.fill }} />
                      <span>{m.name}</span>
                    </div>
                    <div className="text-muted-foreground">{((m.value / methodTotal) * 100).toFixed(0)}% · {formatKES(m.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </OwnerLayout>
  );
}

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
          <span className="text-foreground">{p.name}:</span> {money || typeof p.value === "number" ? formatKES(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center text-center">
      <Receipt className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}

function Kpi({ label, value, prev, icon: Icon, money }: { label: string; value: number; prev?: number; icon: any; money?: boolean }) {
  const delta = prev !== undefined && prev > 0 ? ((value - prev) / prev) * 100 : null;
  const up = delta !== null && delta >= 0;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{money ? formatKES(value) : value.toLocaleString()}</p>
      {delta !== null && (
        <p className={`mt-1 inline-flex items-center gap-1 text-xs ${up ? "text-primary" : "text-destructive"}`}>
          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(delta).toFixed(0)}% vs previous period
        </p>
      )}
    </motion.div>
  );
}
