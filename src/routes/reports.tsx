import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { getSales, formatMoney } from "@/lib/db";
import type { Sale } from "@/lib/types";
import { Printer } from "lucide-react";
import { native } from "@/lib/native";
import { buildReceiptHtml } from "@/lib/receipt";
import { getSettings } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "التقارير — نظام البقالة" },
      { name: "description", content: "تقارير المبيعات اليومية والأسبوعية والشهرية" },
      { property: "og:title", content: "التقارير — نظام البقالة" },
      { property: "og:description", content: "تقارير المبيعات اليومية والأسبوعية والشهرية" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

type Period = "day" | "week" | "month";

function inPeriod(s: Sale, period: Period): boolean {
  const d = new Date(s.createdAt);
  const now = new Date();
  if (period === "day") return d.toDateString() === now.toDateString();
  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function ReportsPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("day");
  const [sales, setSales] = useState<Sale[]>([]);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [user, ready, navigate]);

  const [terminal, setTerminal] = useState<string>("all");
  useEffect(() => {
    const load = () => setSales(getSales().slice().reverse());
    load();
    window.addEventListener("grocery-pos:data-synced", load);
    return () => window.removeEventListener("grocery-pos:data-synced", load);
  }, []);
  const terminals = useMemo(() => [...new Set(sales.map((s) => s.terminal).filter((t): t is string => !!t))].sort(), [sales]);

  const filtered = useMemo(() => sales.filter((s) => inPeriod(s, period) && (terminal === "all" || s.terminal === terminal)), [sales, period, terminal]);
  const total = filtered.reduce((t, s) => t + s.total, 0);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; total: number }>();
    for (const s of filtered)
      for (const i of s.items) {
        const cur = map.get(i.productId) ?? { name: i.name, qty: 0, total: 0 };
        cur.qty += i.qty;
        cur.total += i.total;
        map.set(i.productId, cur);
      }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [filtered]);

  if (!ready || !user) return null;

  const tabs: { key: Period; label: string }[] = [
    { key: "day", label: "اليوم" },
    { key: "week", label: "هذا الأسبوع" },
    { key: "month", label: "هذا الشهر" },
  ];

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold">تقارير المبيعات</h1>

        <div className="mb-6 flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setPeriod(t.key)}
              className={`rounded-xl px-6 py-3 font-bold transition ${
                period === t.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {t.label}
            </button>
          ))}
          {terminals.length > 0 && (
            <select value={terminal} onChange={(e) => setTerminal(e.target.value)} className="rounded-xl border border-border bg-card px-4 font-bold">
              <option value="all">كل الكاشيرات</option>
              {terminals.map((t) => <option key={t} value={t}>كاشير {t}</option>)}
            </select>
          )}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-sm text-muted-foreground">إجمالي المبيعات</div>
            <div className="mt-1 text-2xl font-bold text-primary">{formatMoney(total)}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-sm text-muted-foreground">عدد الفواتير</div>
            <div className="mt-1 text-2xl font-bold">{filtered.length}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-sm text-muted-foreground">متوسط الفاتورة</div>
            <div className="mt-1 text-2xl font-bold">
              {filtered.length ? formatMoney(Math.round(total / filtered.length)) : "—"}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <h2 className="border-b border-border p-4 font-bold">الفواتير</h2>
            <table className="w-full text-sm">
              <thead className="bg-secondary text-muted-foreground">
                <tr>
                  <th className="p-3 text-right font-semibold">رقم</th>
                  <th className="p-3 text-right font-semibold">الوقت</th>
                  <th className="p-3 text-right font-semibold">الكاشير</th>
                  <th className="p-3 text-right font-semibold">المواد</th>
                  <th className="p-3 text-right font-semibold">الإجمالي</th><th className="p-3">طباعة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="p-3 font-bold">#{s.number}</td>
                    <td className="p-3">{new Date(s.createdAt).toLocaleString("en-GB")}</td>
                    <td className="p-3">{s.userName}</td>
                    <td className="p-3 text-muted-foreground">
                      {s.items.map((i) => i.name).join("، ")}
                    </td>
                    <td className="p-3 font-bold text-primary">{formatMoney(s.total)}</td><td className="p-3 text-center"><button title="إعادة طباعة" onClick={async () => { const n = native(); if (!n) { toast.info("الطباعة متاحة في نسخة Windows"); return; } const settings = getSettings(); const result = await n.printReceipt(buildReceiptHtml(s), settings.printerName, settings.printCopies); if (result.ok) toast.success("تم إرسال الفاتورة للطابعة"); else toast.error("تعذرت الطباعة"); }} className="rounded-lg p-2 hover:bg-accent"><Printer className="h-4 w-4"/></button></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      لا توجد مبيعات في هذه الفترة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <h2 className="border-b border-border p-4 font-bold">أكثر المنتجات مبيعاً</h2>
            <table className="w-full text-sm">
              <thead className="bg-secondary text-muted-foreground">
                <tr>
                  <th className="p-3 text-right font-semibold">المنتج</th>
                  <th className="p-3 text-right font-semibold">الكمية</th>
                  <th className="p-3 text-right font-semibold">المبيعات</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.name} className="border-t border-border">
                    <td className="p-3 font-bold">{p.name}</td>
                    <td className="p-3">{p.qty}</td>
                    <td className="p-3 font-bold text-primary">{formatMoney(p.total)}</td>
                  </tr>
                ))}
                {topProducts.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-muted-foreground">
                      لا توجد بيانات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
