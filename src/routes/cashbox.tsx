import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { formatMoney, getExpenses, getSales, saveExpenses, uid } from "@/lib/db";
import type { Expense, Sale } from "@/lib/types";

export const Route = createFileRoute("/cashbox")({
  head: () => ({
    meta: [
      { title: "الصندوق والمصاريف — زيروس" },
      { name: "description", content: "متابعة المبيعات والمصاريف والصافي يومياً وأسبوعياً وشهرياً" },
      { property: "og:title", content: "الصندوق والمصاريف — زيروس" },
      { property: "og:description", content: "متابعة المبيعات والمصاريف والصافي يومياً وأسبوعياً وشهرياً" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CashboxPage,
});

type Period = "day" | "week" | "month";
const CATEGORIES = ["إيجار", "كهرباء", "رواتب", "مولدة", "نقل", "صيانة", "أخرى"];

function inPeriod(iso: string, p: Period) {
  const d = new Date(iso), now = new Date();
  if (p === "day") return d.toDateString() === now.toDateString();
  if (p === "week") { const s = new Date(now); s.setDate(now.getDate() - 6); s.setHours(0, 0, 0, 0); return d >= s; }
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function CashboxPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("day");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [form, setForm] = useState({ title: "", category: CATEGORIES[0]!, amount: "" });

  useEffect(() => { if (ready && (!user || user.role !== "admin")) navigate({ to: user ? "/" : "/login" }); }, [ready, user, navigate]);
  useEffect(() => { setExpenses(getExpenses()); setSales(getSales()); }, []);

  const pSales = useMemo(() => sales.filter((s) => inPeriod(s.createdAt, period)), [sales, period]);
  const pExp = useMemo(() => expenses.filter((e) => inPeriod(e.createdAt, period)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [expenses, period]);
  const salesTotal = pSales.reduce((a, s) => a + s.total, 0);
  const expTotal = pExp.reduce((a, e) => a + e.amount, 0);

  const days = useMemo(() => {
    const map = new Map<string, { sales: number; exp: number }>();
    for (const s of pSales) { const k = s.createdAt.slice(0, 10); const v = map.get(k) ?? { sales: 0, exp: 0 }; v.sales += s.total; map.set(k, v); }
    for (const e of pExp) { const k = e.createdAt.slice(0, 10); const v = map.get(k) ?? { sales: 0, exp: 0 }; v.exp += e.amount; map.set(k, v); }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [pSales, pExp]);

  if (!ready || !user || user.role !== "admin") return null;

  const add = () => {
    const amount = Number(form.amount);
    if (!form.title.trim() || !(amount > 0)) { toast.error("اكتب وصف المصروف والمبلغ"); return; }
    const next = [...expenses, { id: uid(), title: form.title.trim(), category: form.category, amount, userName: user.name, createdAt: new Date().toISOString() }];
    saveExpenses(next); setExpenses(next); setForm({ ...form, title: "", amount: "" });
    toast.success("تمت إضافة المصروف");
  };
  const remove = (id: string) => {
    if (!window.confirm("حذف هذا المصروف؟")) return;
    const next = expenses.filter((e) => e.id !== id); saveExpenses(next); setExpenses(next);
  };

  const cards = [
    { label: "المبيعات", value: salesTotal, icon: TrendingUp, cls: "text-primary" },
    { label: "المصاريف", value: expTotal, icon: TrendingDown, cls: "text-destructive" },
    { label: "الصافي", value: salesTotal - expTotal, icon: Wallet, cls: salesTotal - expTotal >= 0 ? "text-primary" : "text-destructive" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">الصندوق والمصاريف</h1>
          <div className="flex gap-2">
            {([["day", "اليوم"], ["week", "آخر 7 أيام"], ["month", "هذا الشهر"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setPeriod(k)} className={`rounded-xl px-4 py-2 font-bold ${period === k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {cards.map(({ label, value, icon: Icon, cls }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground"><Icon className={`h-5 w-5 ${cls}`} />{label}</div>
              <div className={`mt-2 text-2xl font-bold ${cls}`}>{formatMoney(value)}</div>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-bold">إضافة مصروف</h2>
          <div className="flex flex-wrap gap-2">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="الوصف (مثال: فاتورة كهرباء)" className="h-12 flex-1 rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-12 rounded-xl border border-border bg-secondary px-4">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d]/g, "") })} placeholder="المبلغ" className="h-12 w-40 rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary" />
            <button onClick={add} className="flex items-center gap-2 rounded-xl bg-primary px-5 font-bold text-primary-foreground"><Plus className="h-4 w-4" />إضافة</button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-bold">حسب الأيام</h2>
          {days.length === 0 ? <p className="text-muted-foreground">لا توجد حركة في هذه الفترة</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-muted-foreground"><th className="py-2 text-right">اليوم</th><th className="text-right">المبيعات</th><th className="text-right">المصاريف</th><th className="text-right">الصافي</th></tr></thead>
              <tbody>{days.map(([d, v]) => (
                <tr key={d} className="border-b border-border/50"><td className="py-2">{new Date(d).toLocaleDateString("ar-IQ", { weekday: "long", day: "numeric", month: "numeric" })}</td><td>{formatMoney(v.sales)}</td><td className="text-destructive">{formatMoney(v.exp)}</td><td className="font-bold">{formatMoney(v.sales - v.exp)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-bold">المصاريف ({pExp.length})</h2>
          {pExp.length === 0 ? <p className="text-muted-foreground">لا توجد مصاريف</p> : (
            <div className="space-y-2">{pExp.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                <div><div className="font-bold">{e.title} <span className="text-xs text-muted-foreground">— {e.category}</span></div><div className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString("ar-IQ")} · {e.userName}</div></div>
                <div className="flex items-center gap-3"><span className="font-bold text-destructive">{formatMoney(e.amount)}</span><button onClick={() => remove(e.id)} aria-label="حذف" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>
              </div>
            ))}</div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
