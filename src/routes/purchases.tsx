import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Ban, Eye, Plus, Printer, ReceiptText, Truck, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/lib/auth";
import { cancelPurchase, formatMoney, getProducts, getPurchases, getSettings, getSupplierPayments, getSuppliers, postPurchase, saveSupplierPayments, saveSuppliers, uid } from "@/lib/db";
import { native } from "@/lib/native";
import { PurchaseEditor } from "@/components/PurchaseEditor";
import type { Product, Purchase, Supplier, SupplierPayment } from "@/lib/types";

export const Route = createFileRoute("/purchases")({
  head: () => ({ meta: [
    { title: "المشتريات والمجهّزون — نظام البقالة" }, { name: "description", content: "إدارة فواتير الشراء وحسابات المجهّزين" },
    { property: "og:title", content: "المشتريات والمجهّزون — نظام البقالة" }, { property: "og:description", content: "إدارة فواتير الشراء وحسابات المجهّزين" },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: PurchasesPage,
});

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);

function purchaseHtml(purchase: Purchase) {
  const settings = getSettings();
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>@page{size:${settings.paperWidth}mm auto;margin:2mm}body{font-family:Cairo,Arial,sans-serif;width:${settings.paperWidth - 4}mm;margin:0;color:#111}h2,p{text-align:center;margin:4px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:4px 1px;text-align:right;border-bottom:1px dashed #555}.line{display:flex;justify-content:space-between;margin-top:6px;font-weight:bold}</style></head><body><h2>${escapeHtml(settings.storeName)}</h2><p>فاتورة شراء: ${escapeHtml(purchase.number)}</p><p>${escapeHtml(purchase.supplierName)} — ${new Date(purchase.createdAt).toLocaleString("en-GB")}</p><table><thead><tr><th>المادة</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>${purchase.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.qty}</td><td>${item.cost.toLocaleString("en-GB")}</td><td>${item.total.toLocaleString("en-GB")}</td></tr>`).join("")}</tbody></table><div class="line"><span>الإجمالي</span><span>${formatMoney(purchase.total)}</span></div><div class="line"><span>المدفوع</span><span>${formatMoney(purchase.paid)}</span></div><div class="line"><span>المتبقي</span><span>${formatMoney(purchase.balance)}</span></div></body></html>`;
}

function PurchasesPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"invoices" | "suppliers">("invoices");
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [products] = useState<Product[]>(getProducts());
  const [creating, setCreating] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentNote, setPaymentNote] = useState("");
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", address: "" });
  const [search, setSearch] = useState("");

  const load = () => { setPurchases(getPurchases().slice().reverse()); setSuppliers(getSuppliers()); setPayments(getSupplierPayments().slice().reverse()); };
  useEffect(() => { if (ready && (!user || user.role !== "admin")) navigate({ to: user ? "/" : "/login" }); }, [ready, user, navigate]);
  useEffect(load, []);

  const shownPurchases = purchases.filter((purchase) => purchase.number.includes(search) || purchase.supplierName.includes(search));
  const balances = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id,
    purchases.filter((purchase) => purchase.supplierId === supplier.id && purchase.status === "posted").reduce((sum, purchase) => sum + purchase.balance, 0)
    - payments.filter((payment) => payment.supplierId === supplier.id).reduce((sum, payment) => sum + payment.amount, 0),
  ])), [suppliers, purchases, payments]);

  if (!ready || !user || user.role !== "admin") return null;

  const printPurchase = async (purchase: Purchase) => {
    const bridge = native();
    if (!bridge) { toast.info("طباعة المشتريات متاحة في نسخة Windows"); return; }
    const settings = getSettings();
    const result = await bridge.printReceipt(purchaseHtml(purchase), settings.printerName, settings.printCopies);
    if (result.ok) toast.success("تم إرسال فاتورة الشراء للطابعة"); else toast.error("تعذرت الطباعة");
  };
  const addPayment = () => {
    if (!paymentSupplier || paymentAmount <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    const payment: SupplierPayment = { id: uid(), supplierId: paymentSupplier.id, amount: paymentAmount, createdAt: new Date().toISOString() };
    if (paymentNote.trim()) payment.note = paymentNote.trim();
    saveSupplierPayments([...getSupplierPayments(), payment]);
    setPaymentSupplier(null); setPaymentAmount(0); setPaymentNote(""); load(); toast.success("تم تسجيل الدفعة");
  };

  return <AppLayout><div className="space-y-5 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">المشتريات والمجهّزون</h1><p className="text-sm text-muted-foreground">الفواتير والديون وتحديث المخزون</p></div><button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground"><Plus className="h-5 w-5"/>فاتورة شراء</button></div>
    <div className="flex gap-2"><button onClick={() => setTab("invoices")} className={`rounded-lg px-5 py-3 font-bold ${tab === "invoices" ? "bg-primary text-primary-foreground" : "bg-card"}`}><ReceiptText className="ml-2 inline h-4 w-4"/>الفواتير</button><button onClick={() => setTab("suppliers")} className={`rounded-lg px-5 py-3 font-bold ${tab === "suppliers" ? "bg-primary text-primary-foreground" : "bg-card"}`}><Truck className="ml-2 inline h-4 w-4"/>المجهّزون</button></div>
    {tab === "invoices" ? <>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث برقم الفاتورة أو اسم المجهّز" className="h-11 w-full rounded-lg border border-border bg-card px-4"/>
      <div className="overflow-auto rounded-lg border border-border bg-card"><table className="w-full text-sm"><thead className="bg-secondary"><tr><th className="p-3 text-right">رقم الفاتورة</th><th className="p-3 text-right">المجهّز</th><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">الإجمالي</th><th className="p-3 text-right">المدفوع</th><th className="p-3 text-right">المتبقي</th><th className="p-3">الإجراءات</th></tr></thead><tbody>{shownPurchases.map((purchase) => <tr key={purchase.id} className="border-t border-border"><td className="p-3 font-bold">{purchase.number}</td><td className="p-3">{purchase.supplierName}</td><td className="p-3">{new Date(purchase.createdAt).toLocaleDateString("en-GB")}</td><td className="p-3">{formatMoney(purchase.total)}</td><td className="p-3">{formatMoney(purchase.paid)}</td><td className="p-3 font-bold text-primary">{formatMoney(purchase.balance)}</td><td className="p-3"><div className="flex justify-center gap-1"><button title="عرض" onClick={() => setSelectedPurchase(purchase)} className="rounded-lg p-2 hover:bg-accent"><Eye className="h-4 w-4"/></button><button title="طباعة" onClick={() => printPurchase(purchase)} className="rounded-lg p-2 hover:bg-accent"><Printer className="h-4 w-4"/></button>{purchase.status === "posted" ? <button title="إلغاء الفاتورة" onClick={() => { if (confirm("إلغاء الفاتورة وعكس كمياتها من المخزون؟")) { cancelPurchase(purchase.id, user.name); load(); } }} className="rounded-lg p-2 text-destructive hover:bg-accent"><Ban className="h-4 w-4"/></button> : <span className="p-2 text-destructive">ملغاة</span>}</div></td></tr>)}</tbody></table>{!shownPurchases.length && <div className="p-10 text-center text-muted-foreground">لا توجد فواتير شراء</div>}</div>
    </> : <div className="grid gap-5 lg:grid-cols-[1fr_2fr]"><section className="rounded-lg border border-border bg-card p-5"><h2 className="mb-4 font-bold">إضافة مجهّز</h2><div className="space-y-3"><input value={newSupplier.name} onChange={(event) => setNewSupplier({ ...newSupplier, name: event.target.value })} placeholder="اسم المجهّز" className="h-11 w-full rounded-lg border border-border bg-secondary px-3"/><input value={newSupplier.phone} onChange={(event) => setNewSupplier({ ...newSupplier, phone: event.target.value })} placeholder="رقم الهاتف" className="h-11 w-full rounded-lg border border-border bg-secondary px-3"/><input value={newSupplier.address} onChange={(event) => setNewSupplier({ ...newSupplier, address: event.target.value })} placeholder="العنوان" className="h-11 w-full rounded-lg border border-border bg-secondary px-3"/><button onClick={() => { if (!newSupplier.name.trim()) return; saveSuppliers([...suppliers, { id: uid(), ...newSupplier, active: true }]); setNewSupplier({ name: "", phone: "", address: "" }); load(); }} className="h-11 w-full rounded-lg bg-primary font-bold text-primary-foreground">حفظ المجهّز</button></div></section><section className="overflow-auto rounded-lg border border-border bg-card"><table className="w-full text-sm"><thead className="bg-secondary"><tr><th className="p-3 text-right">المجهّز</th><th className="p-3 text-right">الهاتف</th><th className="p-3 text-right">العنوان</th><th className="p-3 text-right">الرصيد المتبقي</th><th className="p-3">الإجراءات</th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.id} className="border-t border-border"><td className="p-3 font-bold">{supplier.name}</td><td className="p-3">{supplier.phone || "—"}</td><td className="p-3">{supplier.address || "—"}</td><td className="p-3 font-bold text-primary">{formatMoney(balances.get(supplier.id) ?? 0)}</td><td className="p-3"><div className="flex justify-center gap-1"><button title="كشف الحساب" onClick={() => setStatementSupplier(supplier)} className="rounded-lg p-2 hover:bg-accent"><ReceiptText className="h-4 w-4"/></button><button title="تسجيل دفعة" onClick={() => setPaymentSupplier(supplier)} className="rounded-lg p-2 hover:bg-accent"><WalletCards className="h-4 w-4"/></button></div></td></tr>)}</tbody></table></section></div>}

    {creating && <PurchaseEditor products={products.filter((p) => p.active !== false)} onCancel={() => setCreating(false)} onSave={({ supplier, number: num, items: lines, paid: pay }) => {
      const sum = lines.reduce((t, i) => t + i.total, 0);
      const purchase: Purchase = { id: uid(), number: num, supplierId: supplier.id, supplierName: supplier.name, items: lines, total: sum, paid: pay, balance: Math.max(0, sum - pay), createdAt: new Date().toISOString(), status: "posted" };
      postPurchase(purchase, user.name); setCreating(false); load(); toast.success("تم اعتماد فاتورة الشراء وزيادة المخزون");
    }} />}
    {selectedPurchase && <Modal title={`فاتورة شراء ${selectedPurchase.number}`} onClose={() => setSelectedPurchase(null)} wide><div className="mb-4 flex justify-between rounded-lg bg-secondary p-4"><span>{selectedPurchase.supplierName}</span><span>{new Date(selectedPurchase.createdAt).toLocaleString("en-GB")}</span></div><table className="w-full text-sm"><thead><tr><th className="p-2 text-right">المادة</th><th className="p-2 text-right">الكمية</th><th className="p-2 text-right">سعر الشراء</th><th className="p-2 text-right">المجموع</th></tr></thead><tbody>{selectedPurchase.items.map((item, index) => <tr key={`${item.productId}-${index}`} className="border-t border-border"><td className="p-2">{item.name}</td><td className="p-2">{item.qty} {item.unit === "kg" ? "كغم" : "قطعة"}</td><td className="p-2">{formatMoney(item.cost)}</td><td className="p-2 font-bold">{formatMoney(item.total)}</td></tr>)}</tbody></table><div className="mt-4 flex justify-between text-lg font-bold"><span>الإجمالي</span><span>{formatMoney(selectedPurchase.total)}</span></div><button onClick={() => printPurchase(selectedPurchase)} className="mt-4 w-full rounded-lg bg-primary py-3 font-bold text-primary-foreground"><Printer className="ml-2 inline h-4 w-4"/>طباعة</button></Modal>}
    {paymentSupplier && <Modal title={`تسجيل دفعة إلى ${paymentSupplier.name}`} onClose={() => setPaymentSupplier(null)}><div className="space-y-3"><input autoFocus type="number" min="1" value={paymentAmount || ""} onChange={(event) => setPaymentAmount(Number(event.target.value))} placeholder="مبلغ الدفعة" className="h-12 w-full rounded-lg border border-border bg-secondary px-4"/><input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="ملاحظة اختيارية" className="h-12 w-full rounded-lg border border-border bg-secondary px-4"/><button onClick={addPayment} className="h-12 w-full rounded-lg bg-primary font-bold text-primary-foreground">حفظ الدفعة</button></div></Modal>}
    {statementSupplier && <Modal title={`كشف حساب ${statementSupplier.name}`} onClose={() => setStatementSupplier(null)} wide><div className="mb-4 rounded-lg bg-secondary p-4 text-lg font-bold">الرصيد الحالي: <span className="text-primary">{formatMoney(balances.get(statementSupplier.id) ?? 0)}</span></div><div className="max-h-96 overflow-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-right">التاريخ</th><th className="p-2 text-right">البيان</th><th className="p-2 text-right">مدين</th><th className="p-2 text-right">دائن</th></tr></thead><tbody>{[...purchases.filter((purchase) => purchase.supplierId === statementSupplier.id && purchase.status === "posted").map((purchase) => ({ id: purchase.id, date: purchase.createdAt, label: `فاتورة ${purchase.number}`, debit: purchase.balance, credit: 0 })), ...payments.filter((payment) => payment.supplierId === statementSupplier.id).map((payment) => ({ id: payment.id, date: payment.createdAt, label: payment.note || "دفعة", debit: 0, credit: payment.amount }))].sort((a, b) => b.date.localeCompare(a.date)).map((entry) => <tr key={entry.id} className="border-t border-border"><td className="p-2">{new Date(entry.date).toLocaleString("en-GB")}</td><td className="p-2">{entry.label}</td><td className="p-2">{entry.debit ? formatMoney(entry.debit) : "—"}</td><td className="p-2">{entry.credit ? formatMoney(entry.credit) : "—"}</td></tr>)}</tbody></table></div></Modal>}
  </div></AppLayout>;
}

function Modal({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"><div className={`max-h-[94vh] w-full overflow-auto rounded-lg border border-border bg-card p-6 ${wide ? "max-w-4xl" : "max-w-md"}`}><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><button title="إغلاق" onClick={onClose} className="rounded-lg bg-secondary px-3 py-2">×</button></div>{children}</div></div>;
}