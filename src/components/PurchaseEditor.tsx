import { useMemo, useState } from "react";
import { CheckCircle2, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, getGroups, getSuppliers, saveSuppliers, uid } from "@/lib/db";
import { smartScore } from "@/lib/search";
import type { Product, PurchaseItem, Supplier } from "@/lib/types";

interface Props {
  products: Product[];
  onCancel: () => void;
  onSave: (data: { supplier: Supplier; number: string; items: PurchaseItem[]; paid: number }) => void;
}

/** Full-screen purchase invoice laid out like the POS: product tiles + invoice panel. */
export function PurchaseEditor({ products, onCancel, onSave }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(getSuppliers().filter((s) => s.active !== false));
  const [supplierId, setSupplierId] = useState("");
  const [number, setNumber] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [paid, setPaid] = useState<number | "">("");
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState("all");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSup, setNewSup] = useState({ name: "", phone: "" });
  const groups = useMemo(() => getGroups().filter((g) => g.active), []);

  const shown = useMemo(() => {
    const list = products.filter((p) => groupId === "all" || p.groupId === groupId);
    if (!query.trim()) return list;
    const exact = list.filter((p) => p.barcode === query.trim() || p.plu === query.trim());
    if (exact.length) return exact;
    return list.map((p) => ({ p, s: smartScore(query, [p.name, p.barcode, p.plu, p.category]) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.p);
  }, [products, groupId, query]);

  const total = items.reduce((t, i) => t + i.total, 0);
  const paidNum = paid === "" ? total : Math.min(Math.max(0, paid), total);

  const add = (p: Product) => {
    const idx = items.findIndex((i) => i.productId === p.id);
    if (idx >= 0) { setItems(items.map((i, k) => k === idx ? { ...i, qty: i.qty + 1, total: (i.qty + 1) * i.cost } : i)); return; }
    const cost = p.costPrice ?? 0;
    setItems([...items, { productId: p.id, name: p.name, unit: p.unit, qty: 1, cost, total: cost }]);
  };
  const update = (k: number, patch: Partial<PurchaseItem>) => setItems(items.map((i, j) => { if (j !== k) return i; const n = { ...i, ...patch }; return { ...n, total: Math.round(n.qty * n.cost * 100) / 100 }; }));

  const addSupplier = () => {
    if (!newSup.name.trim()) { toast.error("اكتب اسم المجهّز"); return; }
    const s: Supplier = { id: uid(), name: newSup.name.trim(), phone: newSup.phone.trim(), active: true };
    saveSuppliers([...getSuppliers(), s]);
    setSuppliers([...suppliers, s]); setSupplierId(s.id); setAddingSupplier(false); setNewSup({ name: "", phone: "" });
    toast.success("تمت إضافة المجهّز");
  };

  const submit = () => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) { toast.error("اختر المجهّز"); return; }
    if (!number.trim()) { toast.error("اكتب رقم فاتورة المجهّز"); return; }
    if (!items.length || items.some((i) => i.qty <= 0 || i.cost < 0)) { toast.error("أضف المواد وتأكد من الكمية والسعر"); return; }
    onSave({ supplier, number: number.trim(), items, paid: paidNum });
  };

  return <div className="fixed inset-0 z-50 flex flex-col bg-background" dir="rtl">
    <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(420px,46%)]">
      {/* Products */}
      <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card p-3">
        <div className="relative"><Search className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && shown.length === 1) { add(shown[0]!); setQuery(""); } }} placeholder="ابحث باسم المادة أو امسح الباركود..." className="h-12 w-full rounded-lg border border-border bg-secondary pr-10 pl-3" /></div>
        {groups.length > 0 && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setGroupId("all")} className={`rounded-lg px-4 py-2 text-sm font-bold ${groupId === "all" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>الكل</button>{groups.map((g) => <button key={g.id} onClick={() => setGroupId(g.id)} className={`rounded-lg px-4 py-2 text-sm font-bold ${groupId === g.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{g.name}</button>)}</div>}
        <div className="mt-3 grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2 overflow-auto">
          {shown.map((p) => <button key={p.id} onClick={() => add(p)} className="flex flex-col items-center rounded-lg border border-border bg-background p-2 text-center hover:border-primary">
            <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-secondary">{p.image ? <img src={p.image} alt={p.name} className="h-full w-full object-contain" /> : <span className="text-3xl font-bold text-muted-foreground">{p.name.slice(0, 1)}</span>}</div>
            <b className="mt-1 line-clamp-1 text-sm">{p.name}</b>
            <span className="text-xs text-muted-foreground">{(p.costPrice ?? 0).toLocaleString("en-GB")} / {p.unit === "kg" ? "كغم" : "قطعة"}</span>
          </button>)}
          {!shown.length && <div className="col-span-full p-10 text-center text-muted-foreground">لا توجد مواد</div>}
        </div>
      </section>

      {/* Invoice */}
      <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-bold">فاتورة شراء</h2><button title="إغلاق" onClick={onCancel} className="rounded-lg bg-secondary p-2"><X className="h-4 w-4" /></button></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-11 rounded-lg border border-border bg-secondary px-3"><option value="">اختر المجهّز</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <button onClick={() => setAddingSupplier(!addingSupplier)} className="h-11 rounded-lg border border-primary px-4 font-bold text-primary"><Plus className="ml-1 inline h-4 w-4" />مجهّز جديد</button>
        </div>
        {addingSupplier && <div className="mt-2 grid gap-2 rounded-lg bg-secondary p-2 sm:grid-cols-[1fr_1fr_auto]"><input autoFocus value={newSup.name} onChange={(e) => setNewSup({ ...newSup, name: e.target.value })} placeholder="اسم المجهّز" className="h-10 rounded-lg border border-border bg-background px-3" /><input value={newSup.phone} onChange={(e) => setNewSup({ ...newSup, phone: e.target.value })} placeholder="رقم الهاتف" className="h-10 rounded-lg border border-border bg-background px-3" /><button onClick={addSupplier} className="h-10 rounded-lg bg-primary px-4 font-bold text-primary-foreground">حفظ</button></div>}
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="رقم فاتورة المجهّز" className="mt-2 h-11 rounded-lg border border-border bg-secondary px-3" />

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm"><thead className="sticky top-0 bg-secondary"><tr><th className="p-2 text-right">المادة</th><th className="p-2 text-right">النوع</th><th className="p-2 text-right">الكمية / الوزن</th><th className="p-2 text-right">سعر الشراء</th><th className="p-2 text-right">المبلغ</th><th className="p-2"></th></tr></thead>
            <tbody>{items.map((i, k) => <tr key={i.productId} className="border-t border-border">
              <td className="p-2 font-bold">{i.name}</td>
              <td className="p-2"><span className={`rounded-md px-2 py-1 text-xs font-bold ${i.unit === "kg" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>{i.unit === "kg" ? "وزن" : "قطعة"}</span></td>
              <td className="p-2"><div className="flex items-center gap-1"><input aria-label="الكمية" type="number" min="0" step={i.unit === "kg" ? ".001" : "1"} value={i.qty} onChange={(e) => update(k, { qty: Number(e.target.value) })} className="h-9 w-20 rounded-md border border-border bg-secondary px-2" /><span className="text-xs text-muted-foreground">{i.unit === "kg" ? "كغم" : "قطعة"}</span></div></td>
              <td className="p-2"><div className="flex items-center gap-1"><input aria-label="سعر الشراء" type="number" min="0" value={i.cost} onChange={(e) => update(k, { cost: Number(e.target.value) })} className="h-9 w-24 rounded-md border border-border bg-secondary px-2" /><span className="text-xs text-muted-foreground">/{i.unit === "kg" ? "كغم" : "قطعة"}</span></div></td>
              <td className="p-2 font-bold">{i.total.toLocaleString("en-GB")}</td>
              <td className="p-2"><button title="حذف" onClick={() => setItems(items.filter((_, j) => j !== k))} className="text-destructive"><Trash2 className="h-4 w-4" /></button></td>
            </tr>)}</tbody></table>
          {!items.length && <div className="p-8 text-center text-muted-foreground">اضغط على المادة لإضافتها للفاتورة</div>}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-primary/10 p-3"><span className="text-sm">الإجمالي</span><b className="block text-2xl text-primary">{formatMoney(total)}</b></div>
          <label className="rounded-lg bg-secondary p-3 text-sm">المدفوع<input type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value === "" ? "" : Number(e.target.value))} placeholder={total.toLocaleString("en-GB")} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2" /></label>
          <div className="rounded-lg bg-destructive/10 p-3"><span className="text-sm text-destructive">المتبقي (دين)</span><b className="block text-2xl text-destructive">{formatMoney(Math.max(0, total - paidNum))}</b></div>
        </div>
        <div className="mt-3 flex gap-2"><button onClick={submit} className="h-12 flex-[2] rounded-lg bg-primary font-bold text-primary-foreground"><CheckCircle2 className="ml-2 inline h-5 w-5" />اعتماد الفاتورة</button><button onClick={onCancel} className="h-12 flex-1 rounded-lg bg-secondary font-bold">إلغاء</button></div>
      </section>
    </div>
  </div>;
}
