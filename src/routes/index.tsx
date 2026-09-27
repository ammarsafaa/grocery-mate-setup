import { native } from "@/lib/native";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FolderOpen, Printer, Scale, Trash2, ShoppingBasket, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import {
  getProducts,
  getOpenShift,
  addSale,
  nextSaleNumber,
  saveProducts,
  formatMoney,
  maybeAutoBackup,
  getSettings,
  getGroups,
  recordSaleMovements,
  uid,
} from "@/lib/db";
import { buildReceiptHtml } from "@/lib/receipt";
import type { CartItem, Product, ProductGroup, Sale } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "نقطة البيع — نظام البقالة" },
      { name: "description", content: "شاشة الكاشير لبيع المنتجات بالوزن أو بالقطعة" },
      { property: "og:title", content: "نقطة البيع — نظام البقالة" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosPage,
});

function PosPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [shift, setShift] = useState(getOpenShift());
  const [weightModal, setWeightModal] = useState<Product | null>(null);
  const [weight, setWeight] = useState("");
  const [scaleStatus, setScaleStatus] = useState("");
  const [settings, setSettings] = useState(getSettings());
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [user, ready, navigate]);

  const loadProducts = () => { setProducts(getProducts().filter((p) => p.active !== false)); setGroups(getGroups().filter((g) => g.active)); setSettings(getSettings()); };

  useEffect(() => {
    if (pathname === "/") loadProducts();
  }, [pathname]);

  useEffect(() => {
    const load = () => loadProducts();
    load();
    maybeAutoBackup();
    window.addEventListener("focus", load);
    window.addEventListener("storage", load);
    window.addEventListener("grocery-pos:products-updated", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener("storage", load);
      window.removeEventListener("grocery-pos:products-updated", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  const filtered = useMemo(
    () => products.filter((p) => (!selectedGroup || p.groupId === selectedGroup) && (p.name.includes(search) || p.barcode?.includes(search))),
    [products, search, selectedGroup],
  );

  const total = cart.reduce((s, i) => s + i.total, 0);

  // Poll the scale continuously while the weight window is open
  useEffect(() => {
    if (!weightModal) return;
    const n = native();
    if (!n) {
      setScaleStatus("الميزان يعمل فقط في نسخة الويندوز المثبتة على الكاشير");
      return;
    }
    let alive = true;
    const s = getSettings();
    const tick = async () => {
      if (!alive) return;
      const r = await n.readWeight(s.scaleIp, s.scalePort).catch(() => ({ ok: false }) as any);
      if (!alive) return;
      if (r.ok && r.weight > 0) {
        setWeight(r.weight.toFixed(3));
        setScaleStatus("تم جلب الوزن من الميزان");
      } else {
        setScaleStatus("بانتظار الوزن من الميزان... ضع المنتج على الميزان");
      }
      setTimeout(tick, 500);
    };
    setScaleStatus("جاري الاتصال بالميزان...");
    tick();
    return () => {
      alive = false;
    };
  }, [weightModal]);

  const addProduct = (p: Product) => {
    if (p.unit === "kg") {
      setWeight("");
      setWeightModal(p);
      return;
    }
    setCart((c) => {
      const ex = c.find((i) => i.productId === p.id);
      if (ex)
        return c.map((i) =>
          i.productId === p.id
            ? { ...i, qty: i.qty + 1, total: (i.qty + 1) * i.price }
            : i,
        );
      return [
        ...c,
        { productId: p.id, name: p.name, unit: p.unit, price: p.price, qty: 1, total: p.price },
      ];
    });
  };

  const confirmWeight = () => {
    const w = parseFloat(weight);
    if (!weightModal || !w || w <= 0) return;
    const p = weightModal;
    setCart((c) => [
      ...c,
      {
        productId: p.id,
        name: p.name,
        unit: "kg",
        price: p.price,
        qty: w,
        total: Math.round(w * p.price),
      },
    ]);
    setWeightModal(null);
  };

  const checkout = async () => {
    if (!user || !shift || cart.length === 0) return;
    const sale: Sale = {
      id: uid(),
      number: nextSaleNumber(),
      shiftId: shift.id,
      userId: user.id,
      userName: user.name,
      items: cart,
      total,
      createdAt: new Date().toISOString(),
      paid: total,
      change: 0,
    };
    addSale(sale);
    // Decrement stock once per product, even when it appears on several cart lines.
    const sold = new Map<string, number>();
    for (const item of cart) sold.set(item.productId, (sold.get(item.productId) ?? 0) + item.qty);
    const all = getProducts().map((p) => {
      const qty = sold.get(p.id);
      return qty ? { ...p, stock: Math.max(0, p.stock - qty) } : p;
    });
    saveProducts(all);
    recordSaleMovements(sale);
    setProducts(all.filter((p) => p.active));
    setCart([]);
    toast.success(`تم حفظ الفاتورة رقم ${nextSaleNumber() - 1}`);
    if (settings.autoPrint) {
      const n = native();
      if (n) {
        const result = await n.printReceipt(buildReceiptHtml(sale), settings.printerName, settings.printCopies);
        if (!result.ok) toast.error("حُفظت الفاتورة لكن تعذرت طباعتها");
      }
    }
  };

  if (!ready || !user) return null;

  if (!shift) {
    return (
      <AppLayout>
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <PlayCircle className="h-16 w-16 text-primary" />
          <h2 className="text-2xl font-bold">لا توجد وردية مفتوحة</h2>
          <p className="text-muted-foreground">يجب فتح وردية قبل بدء البيع</p>
          <button
            onClick={() => navigate({ to: "/shifts" })}
            className="rounded-xl bg-primary px-8 py-3 text-lg font-bold text-primary-foreground"
          >
            فتح وردية
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex h-screen">
        {/* Products grid */}
        <div className="flex flex-1 flex-col p-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الباركود..."
            className="mb-4 h-12 rounded-xl border border-border bg-card px-4 text-foreground outline-none focus:border-primary"
          />
          {settings.useProductGroups && !search && <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {selectedGroup && <button onClick={() => setSelectedGroup(null)} className="flex min-w-24 items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-3 font-bold"><ArrowRight className="h-4 w-4"/>رجوع</button>}
            {!selectedGroup && groups.map((group) => <button key={group.id} onClick={() => setSelectedGroup(group.id)} className="flex min-w-32 flex-col items-center gap-2 rounded-lg border border-border bg-card px-5 py-4 font-bold hover:border-primary"><FolderOpen className="h-7 w-7 text-primary"/>{group.name}</button>)}
          </div>}
          <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-auto lg:grid-cols-3 xl:grid-cols-4">
            {(!settings.useProductGroups || selectedGroup || search ? filtered : []).map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card p-3 transition hover:border-primary hover:bg-accent active:scale-95"
              >
                {p.image ? (
                  <img src={p.image} alt={p.name} className="h-20 w-20 rounded-xl object-cover" />
                ) : (
                  p.unit === "kg" && <Scale className="h-5 w-5 text-primary" />
                )}
                 <span className="product-name font-bold text-foreground">{p.name}</span>
                <span className="text-sm text-muted-foreground">
                  {formatMoney(p.price)} {p.unit === "kg" ? "/ كغم" : ""}
                </span>
              </button>
            ))}
            {settings.useProductGroups && !selectedGroup && !search && groups.length === 0 && <p className="col-span-full p-8 text-center text-muted-foreground">أضف مجموعات أو عطّل عرض المجموعات من الإعدادات</p>}
          </div>
        </div>

        {/* Cart */}
        <div className="flex w-96 flex-col border-r border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border p-4">
            <ShoppingBasket className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">الفاتورة الحالية</h2>
          </div>
          <div className="flex-1 overflow-auto p-3">
            {cart.length === 0 && (
              <p className="mt-8 text-center text-sm text-muted-foreground">
                اختر المنتجات لإضافتها
              </p>
            )}
            {cart.map((i, idx) => (
              <div
                key={idx}
                className="mb-2 flex items-center justify-between rounded-xl bg-secondary p-3"
              >
                <div>
                  <div className="font-bold text-foreground">{i.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.unit === "kg" ? `${i.qty} كغم × ${formatMoney(i.price)}` : `${i.qty} × ${formatMoney(i.price)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-primary">{formatMoney(i.total)}</span>
                  <button
                    onClick={() => setCart(cart.filter((_, x) => x !== idx))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-4">
            <div className="mb-3 flex items-center justify-between text-xl font-bold">
              <span>الإجمالي</span>
              <span className="text-primary">{formatMoney(total)}</span>
            </div>
            <button
              onClick={checkout}
              disabled={cart.length === 0}
              className="h-14 w-full rounded-xl bg-primary text-lg font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              <Printer className="ml-2 inline h-5 w-5" />
              دفع وحفظ الفاتورة
            </button>
          </div>
        </div>
      </div>

      {/* Weight modal */}
      {weightModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-1 text-xl font-bold">{weightModal.name}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              السعر: {formatMoney(weightModal.price)} / كغم
            </p>
            <label className="mb-2 block text-sm font-semibold">الوزن من الميزان (كغم)</label>
            <div className="mb-2 flex h-16 w-full items-center justify-center rounded-xl border border-border bg-secondary text-3xl font-bold">
              {weight || "—"}
            </div>
            <p className="mb-4 text-center text-xs text-muted-foreground">
              {scaleStatus}
            </p>
            {parseFloat(weight) > 0 && (
              <p className="mb-4 text-center text-lg font-bold text-primary">
                {formatMoney(Math.round(parseFloat(weight) * weightModal.price))}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={confirmWeight}
                className="h-12 flex-1 rounded-xl bg-primary font-bold text-primary-foreground"
              >
                إضافة
              </button>
              <button
                onClick={() => setWeightModal(null)}
                className="h-12 flex-1 rounded-xl bg-secondary font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
