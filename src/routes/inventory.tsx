import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/lib/auth";
import { adjustStock, formatMoney, getProducts, getStockMovements } from "@/lib/db";
import type { Product, StockMovement } from "@/lib/types";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [
    { title: "المخزون والجرد — نظام البقالة" }, { name: "description", content: "متابعة المخزون وحركات الأصناف والجرد" },
    { property: "og:title", content: "المخزون والجرد — نظام البقالة" }, { property: "og:description", content: "متابعة المخزون وحركات الأصناف والجرد" },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: InventoryPage,
});

const LABELS: Record<StockMovement["type"], string> = { purchase: "شراء", sale: "بيع", return: "مرتجع", adjustment: "تسوية", damage: "تلف", "purchase-cancel": "إلغاء شراء" };

function InventoryPage() {
  const { user, ready } = useAuth(); const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]); const [movements, setMovements] = useState<StockMovement[]>([]); const [editing, setEditing] = useState<Product | null>(null); const [qty, setQty] = useState(0); const [reason, setReason] = useState("جرد فعلي"); const [search, setSearch] = useState("");
  const load = () => { setProducts(getProducts()); setMovements(getStockMovements().slice().reverse()); };
  useEffect(() => { if (ready && (!user || user.role !== "admin")) navigate({ to: user ? "/" : "/login" }); }, [ready, user, navigate]); useEffect(load, []);
  const shown = useMemo(() => products.filter((p) => p.name.includes(search) || p.barcode?.includes(search)), [products, search]);
  const low = products.filter((p) => p.stock <= (p.minStock ?? 5)); const value = products.reduce((sum, p) => sum + p.stock * (p.costPrice ?? 0), 0);
  if (!ready || !user || user.role !== "admin") return null;
  return <AppLayout><div className="space-y-5 p-6"><h1 className="text-2xl font-bold">المخزون والجرد</h1>
    <div className="grid gap-4 md:grid-cols-3"><Summary icon={Boxes} label="عدد المنتجات" value={String(products.length)}/><Summary icon={AlertTriangle} label="منخفضة أو نافدة" value={String(low.length)}/><Summary icon={ClipboardCheck} label="قيمة المخزون" value={formatMoney(value)}/></div>
    {low.length > 0 && <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm"><b>تنبيه المخزون:</b> {low.map((p) => p.name).join("، ")}</div>}
    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن منتج أو باركود" className="h-12 w-full rounded-lg border border-border bg-card px-4"/>
    <div className="overflow-auto rounded-lg border border-border bg-card"><table className="w-full text-sm"><thead className="bg-secondary"><tr><th className="p-3 text-right">المنتج</th><th className="p-3 text-right">المتوفر</th><th className="p-3 text-right">حد التنبيه</th><th className="p-3 text-right">سعر الشراء</th><th className="p-3">إجراء</th></tr></thead><tbody>{shown.map((p) => <tr key={p.id} className="border-t border-border"><td className="p-3 font-bold">{p.name}</td><td className={`p-3 font-bold ${p.stock <= (p.minStock ?? 5) ? "text-destructive" : "text-primary"}`}>{p.stock} {p.unit === "kg" ? "كغم" : "قطعة"}</td><td className="p-3">{p.minStock ?? 5}</td><td className="p-3">{formatMoney(p.costPrice ?? 0)}</td><td className="p-3 text-center"><button onClick={() => { setEditing(p); setQty(p.stock); }} className="rounded-lg bg-secondary px-4 py-2 font-bold">جرد</button></td></tr>)}</tbody></table></div>
    <section className="rounded-lg border border-border bg-card"><h2 className="border-b border-border p-4 font-bold">آخر حركات المخزون</h2><div className="max-h-80 overflow-auto"><table className="w-full text-sm"><tbody>{movements.slice(0, 50).map((m) => <tr key={m.id} className="border-b border-border"><td className="p-3 font-bold">{m.productName}</td><td className="p-3">{LABELS[m.type]}</td><td className={`p-3 ${m.qty < 0 ? "text-destructive" : "text-primary"}`}>{m.qty > 0 ? "+" : ""}{m.qty}</td><td className="p-3 text-muted-foreground">الرصيد {m.balanceAfter}</td><td className="p-3 text-muted-foreground">{new Date(m.createdAt).toLocaleString("en-GB")}</td></tr>)}</tbody></table></div></section>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"><div className="w-full max-w-sm rounded-lg bg-card p-6"><h2 className="text-xl font-bold">جرد: {editing.name}</h2><label className="mt-4 block text-sm">الكمية الفعلية</label><input type="number" step={editing.unit === "kg" ? ".001" : "1"} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="mt-1 h-12 w-full rounded-lg border border-border bg-secondary px-4"/><label className="mt-3 block text-sm">السبب</label><select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-12 w-full rounded-lg border border-border bg-secondary px-4"><option>جرد فعلي</option><option>تلف</option><option>تصحيح إدخال</option><option>مرتجع</option></select><div className="mt-5 flex gap-2"><button onClick={() => { adjustStock(editing.id, Math.max(0, qty), reason, user.name); setEditing(null); load(); toast.success("تم تحديث المخزون"); }} className="h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground">اعتماد</button><button onClick={() => setEditing(null)} className="h-12 flex-1 rounded-lg bg-secondary font-bold">إلغاء</button></div></div></div>}
  </div></AppLayout>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) { return <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5"><Icon className="h-8 w-8 text-primary"/><div><div className="text-sm text-muted-foreground">{label}</div><div className="text-2xl font-bold">{value}</div></div></div>; }