import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { format, isBefore, startOfDay } from "date-fns";
import { Download, ChevronDown, MessageCircle, Phone, AlertTriangle } from "lucide-react";
import { OwnerLayout } from "@/components/owner/OwnerLayout";
import { supabase, type Sale, type SaleItem, type Profile, type Product, type Loan, type Customer, type LoanPayment } from "@/integrations/supabase/client";
import { formatKES, productName } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/sales-history")({
  component: SalesHistory,
});

const PAYMENT_LABEL: Record<Sale["payment_method"], string> = { cash: "Cash", mpesa: "M-Pesa", loan: "Loan" };
const PAYMENT_BADGE: Record<Sale["payment_method"], string> = {
  cash: "bg-primary/15 text-primary",
  mpesa: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  loan: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

function SalesHistory() {
  const [tab, setTab] = useState<"sales" | "credit">("sales");

  return (
    <OwnerLayout title="Sales History">
      <div className="mb-5 inline-flex rounded-lg border border-border bg-card p-1">
        <button
          onClick={() => setTab("sales")}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === "sales" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Sales History
        </button>
        <button
          onClick={() => setTab("credit")}
          className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === "credit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Credit / Loans
        </button>
      </div>

      {tab === "sales" ? <SalesTab /> : <CreditTab />}
    </OwnerLayout>
  );
}

function SalesTab() {
  const [from, setFrom] = useState(format(new Date(Date.now() - 30 * 86400000), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sellerId, setSellerId] = useState("");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<"" | Sale["payment_method"]>("");

  const { data } = useQuery({
    queryKey: ["sales-history", from, to],
    queryFn: async () => {
      const fromIso = new Date(from + "T00:00:00").toISOString();
      const toIso = new Date(to + "T23:59:59").toISOString();

      const [salesR, profilesR, productsR] = await Promise.all([
        supabase.from("sales").select("*")
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,full_name,role,phone,created_at"),
        supabase.from("products").select("id,brand,grade,type,size"),
      ]);

      const sales = (salesR.data ?? []) as Sale[];
      const saleIds = sales.map((s) => s.id);

      const itemsR = saleIds.length > 0
        ? await supabase.from("sale_items").select("*").in("sale_id", saleIds)
        : { data: [] };

      return {
        sales,
        items: (itemsR.data ?? []) as SaleItem[],
        profiles: (profilesR.data ?? []) as Profile[],
        products: (productsR.data ?? []) as Product[],
      };
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.sales.filter((s) => {
      if (sellerId && s.seller_id !== sellerId) return false;
      if (method && s.payment_method !== method) return false;
      if (search && !(s.customer_name ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, sellerId, method, search]);

  const total = filtered.reduce((a, s) => a + Number(s.total_amount), 0);
  const byMethod = useMemo(() => {
    const totals: Record<Sale["payment_method"], number> = { cash: 0, mpesa: 0, loan: 0 };
    for (const s of filtered) totals[s.payment_method] += Number(s.total_amount);
    return totals;
  }, [filtered]);

  const exportCsv = () => {
    if (!data) return;
    const header = ["Date", "Customer", "Seller", "Payment method", "Product", "Size", "Quantity", "Subtotal (KES)", "Sale Total (KES)"];
    const rows: string[][] = [header];
    for (const s of filtered) {
      const seller = data.profiles.find((p) => p.id === s.seller_id)?.full_name ?? "—";
      const its = data.items.filter((i) => i.sale_id === s.id);
      if (its.length === 0) {
        rows.push([format(new Date(s.created_at), "yyyy-MM-dd HH:mm"), s.customer_name ?? "", seller, PAYMENT_LABEL[s.payment_method], "—", "—", "0", "0", String(s.total_amount)]);
      } else {
        for (const i of its) {
          const p = data.products.find((pp) => pp.id === i.product_id);
          rows.push([format(new Date(s.created_at), "yyyy-MM-dd HH:mm"), s.customer_name ?? "", seller, PAYMENT_LABEL[s.payment_method], p ? productName(p) : "—", p?.size ?? "—", String(i.quantity), String(i.subtotal), String(s.total_amount)]);
        }
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sales-${from}-to-${to}.csv`;
    a.click();
  };

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">All sellers</option>
          {data?.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 6)}</option>)}
        </select>
        <select value={method} onChange={(e) => setMethod(e.target.value as any)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">All payment methods</option>
          <option value="cash">Cash</option>
          <option value="mpesa">M-Pesa</option>
          <option value="loan">Loan</option>
        </select>
        <input placeholder="Search customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
        <button onClick={exportCsv} className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-accent/30 px-4 py-3 text-sm">
          <p className="text-muted-foreground">{filtered.length} transactions</p>
          <p className="text-lg font-bold">{formatKES(total)}</p>
        </div>
        {(["cash", "mpesa", "loan"] as const).map((m) => (
          <div key={m} className="rounded-lg border border-border px-4 py-3 text-sm">
            <p className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PAYMENT_BADGE[m]}`}>{PAYMENT_LABEL[m]}</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{formatKES(byMethod[m])}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No sales for the selected filters.</div>
        ) : filtered.map((s) => {
          const seller = data?.profiles.find((p) => p.id === s.seller_id)?.full_name ?? "—";
          const its = data?.items.filter((i) => i.sale_id === s.id) ?? [];
          return (
            <div key={s.id} className="border-b border-border last:border-0">
              <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-muted-foreground">{format(new Date(s.created_at), "MMM d, HH:mm")}</span>
                  <span>{s.customer_name ?? "—"}</span>
                  <span className="text-muted-foreground">{seller}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PAYMENT_BADGE[s.payment_method]}`}>{PAYMENT_LABEL[s.payment_method]}</span>
                </div>
                <span className="font-semibold tabular-nums">{formatKES(s.total_amount)}</span>
              </div>
              <div className="border-t border-border bg-accent/20 px-4 py-3 text-sm">
                {its.map((i) => {
                  const p = data?.products.find((pp) => pp.id === i.product_id);
                  return (
                    <div key={i.id} className="flex justify-between border-b border-border/60 py-1.5 last:border-0">
                      <span>{p ? `${productName(p)}${p.size ? ` ${p.size}` : ""}` : "—"} × {i.quantity}</span>
                      <span className="tabular-nums">{formatKES(i.subtotal)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

type LoanRow = {
  loan: Loan;
  customer: Customer | undefined;
  sale: Sale | undefined;
  items: SaleItem[];
  payments: LoanPayment[];
  paid: number;
  balance: number;
  overdue: boolean;
};

function CreditTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"" | "outstanding" | "partial" | "paid" | "overdue">("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["credit-loans"],
    queryFn: async () => {
      const [loansR, customersR, paymentsR] = await Promise.all([
        supabase.from("loans").select("*").order("due_date"),
        supabase.from("customers").select("*"),
        supabase.from("loan_payments").select("*").order("paid_at", { ascending: false }),
      ]);
      const loans = (loansR.data ?? []) as Loan[];
      const saleIds = loans.map((l) => l.sale_id);

      const [salesR, itemsR, sellersR] = await Promise.all([
        saleIds.length > 0 ? supabase.from("sales").select("*").in("id", saleIds) : Promise.resolve({ data: [] }),
        saleIds.length > 0 ? supabase.from("sale_items").select("*").in("sale_id", saleIds) : Promise.resolve({ data: [] }),
        supabase.from("profiles").select("id,full_name"),
      ]);

      const sales = (salesR.data ?? []) as Sale[];
      const items = (itemsR.data ?? []) as SaleItem[];
      const productIds = Array.from(new Set(items.map((i) => i.product_id)));
      const productsR = productIds.length > 0
        ? await supabase.from("products").select("id,brand,grade,type,size").in("id", productIds)
        : { data: [] };

      return {
        loans,
        customers: (customersR.data ?? []) as Customer[],
        payments: (paymentsR.data ?? []) as LoanPayment[],
        sales,
        items,
        products: (productsR.data ?? []) as Product[],
        sellers: (sellersR.data ?? []) as Profile[],
      };
    },
  });

  const rows: LoanRow[] = useMemo(() => {
    if (!data) return [];
    const today = startOfDay(new Date());
    return data.loans.map((loan) => {
      const customer = data.customers.find((c) => c.id === loan.customer_id);
      const sale = data.sales.find((s) => s.id === loan.sale_id);
      const items = data.items.filter((i) => sale && i.sale_id === sale.id);
      const payments = data.payments.filter((p) => p.loan_id === loan.id);
      const paid = payments.reduce((a, p) => a + Number(p.amount), 0);
      const balance = Number(loan.principal_amount) - paid;
      const overdue = loan.status !== "paid" && isBefore(new Date(loan.due_date), today);
      return { loan, customer, sale, items, payments, paid, balance, overdue };
    });
  }, [data]);

  const filtered = rows.filter((r) => {
    if (status === "overdue" && !r.overdue) return false;
    if (status && status !== "overdue" && r.loan.status !== status) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(r.customer?.full_name.toLowerCase().includes(s) || (r.customer?.phone ?? "").includes(search))) return false;
    }
    return true;
  }).sort((a, b) => a.loan.due_date.localeCompare(b.loan.due_date));

  const totalOutstanding = rows.filter((r) => r.loan.status !== "paid").reduce((a, r) => a + r.balance, 0);
  const overdueRows = rows.filter((r) => r.overdue);
  const overdueTotal = overdueRows.reduce((a, r) => a + r.balance, 0);
  const paidCount = rows.filter((r) => r.loan.status === "paid").length;

  const recordPayment = useMutation({
    mutationFn: async ({ loanId, amount, method, mpesaCode }: { loanId: string; amount: number; method: "cash" | "mpesa"; mpesaCode: string }) => {
      const { error } = await supabase.rpc("record_loan_payment", {
        p_loan_id: loanId,
        p_amount: amount,
        p_payment_method: method,
        p_mpesa_code: method === "mpesa" ? (mpesaCode || null) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["credit-loans"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-accent/30 px-4 py-3 text-sm">
          <p className="text-muted-foreground">Total outstanding</p>
          <p className="text-lg font-bold tabular-nums">{formatKES(totalOutstanding)}</p>
        </div>
        <div className={`rounded-lg border px-4 py-3 text-sm ${overdueRows.length > 0 ? "border-destructive/40 bg-destructive/10" : "border-border"}`}>
          <p className={overdueRows.length > 0 ? "text-destructive" : "text-muted-foreground"}>Overdue ({overdueRows.length})</p>
          <p className="text-lg font-bold tabular-nums">{formatKES(overdueTotal)}</p>
        </div>
        <div className="rounded-lg border border-border px-4 py-3 text-sm">
          <p className="text-muted-foreground">Fully paid</p>
          <p className="text-lg font-bold tabular-nums">{paidCount}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">All statuses</option>
          <option value="outstanding">Outstanding</option>
          <option value="partial">Partially paid</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
        </select>
        <input placeholder="Search client by name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No loans match these filters.</div>
        ) : filtered.map((r) => {
          const isOpen = expanded === r.loan.id;
          const seller = data?.sellers.find((p) => p.id === r.sale?.seller_id)?.full_name;
          const waPhone = (r.customer?.phone ?? "").replace(/\D/g, "").replace(/^0/, "254");
          return (
            <div key={r.loan.id} className="border-b border-border last:border-0">
              <button onClick={() => setExpanded(isOpen ? null : r.loan.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-accent/20">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.customer?.full_name ?? "Unknown client"}</span>
                    {r.customer?.phone && <span className="text-xs text-muted-foreground">{r.customer.phone}</span>}
                    {r.overdue && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Overdue
                      </span>
                    )}
                    {!r.overdue && r.loan.status !== "paid" && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${r.loan.status === "partial" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-accent text-muted-foreground"}`}>
                        {r.loan.status === "partial" ? "Partial" : "Outstanding"}
                      </span>
                    )}
                    {r.loan.status === "paid" && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">Paid</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.items.map((i) => {
                      const p = data?.products.find((pp) => pp.id === i.product_id);
                      return `${p ? productName(p) : "item"} ×${i.quantity}`;
                    }).join(", ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-semibold tabular-nums ${r.balance > 0 ? "" : "text-muted-foreground"}`}>{formatKES(r.balance)} due</p>
                  <p className={`text-xs ${r.overdue ? "text-destructive" : "text-muted-foreground"}`}>Due {format(new Date(r.loan.due_date), "MMM d, yyyy")}</p>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-border bg-accent/10 px-4 py-4 text-sm">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Products taken</p>
                      <div className="space-y-1">
                        {r.items.map((i) => {
                          const p = data?.products.find((pp) => pp.id === i.product_id);
                          return (
                            <div key={i.id} className="flex justify-between text-xs">
                              <span>{p ? `${productName(p)}${p.size ? ` ${p.size}` : ""}` : "—"} × {i.quantity}</span>
                              <span className="tabular-nums">{formatKES(i.subtotal)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Sold by {seller ?? "—"} on {r.sale ? format(new Date(r.sale.created_at), "MMM d, yyyy") : "—"}
                      </p>
                      {r.customer?.national_id && <p className="text-xs text-muted-foreground">ID: {r.customer.national_id}</p>}
                      {r.customer?.address && <p className="text-xs text-muted-foreground">{r.customer.address}</p>}
                      {r.customer?.phone && (
                        <div className="mt-2 flex gap-2">
                          <a href={`tel:${r.customer.phone}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
                            <Phone className="h-3 w-3" /> Call
                          </a>
                          <a
                            href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Hi ${r.customer.full_name}, this is a reminder that you have ${formatKES(r.balance)} outstanding, due ${format(new Date(r.loan.due_date), "MMM d, yyyy")}. Thank you!`)}`}
                            target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                          >
                            <MessageCircle className="h-3 w-3" /> Remind via WhatsApp
                          </a>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment history</p>
                      {r.payments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
                      ) : (
                        <div className="space-y-1">
                          {r.payments.map((p) => (
                            <div key={p.id} className="flex justify-between text-xs">
                              <span>{format(new Date(p.paid_at), "MMM d, yyyy")} · {PAYMENT_LABEL[p.payment_method]}{p.mpesa_code ? ` (${p.mpesa_code})` : ""}</span>
                              <span className="tabular-nums">{formatKES(p.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex justify-between border-t border-border pt-1.5 text-xs font-semibold">
                        <span>Principal {formatKES(r.loan.principal_amount)} — Paid {formatKES(r.paid)}</span>
                      </div>

                      {r.loan.status !== "paid" && (
                        <RecordPaymentForm
                          balance={r.balance}
                          busy={recordPayment.isPending}
                          onSubmit={(amount, method, mpesaCode) => recordPayment.mutate({ loanId: r.loan.id, amount, method, mpesaCode })}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function RecordPaymentForm({ balance, busy, onSubmit }: { balance: number; busy: boolean; onSubmit: (amount: number, method: "cash" | "mpesa", mpesaCode: string) => void }) {
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<"cash" | "mpesa">("cash");
  const [mpesaCode, setMpesaCode] = useState("");

  return (
    <div className="mt-3 rounded-lg border border-dashed border-border p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Record a payment</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <select value={method} onChange={(e) => setMethod(e.target.value as "cash" | "mpesa")} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
          <option value="cash">Cash</option>
          <option value="mpesa">M-Pesa</option>
        </select>
        {method === "mpesa" && (
          <input placeholder="M-Pesa code (optional)" value={mpesaCode} onChange={(e) => setMpesaCode(e.target.value)} className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
        )}
        <button
          onClick={() => onSubmit(Number(amount), method, mpesaCode)}
          disabled={busy || Number(amount) <= 0}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-[#3a4f22] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save payment"}
        </button>
      </div>
    </div>
  );
}
