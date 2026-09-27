import { native } from "@/lib/native";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Scale, Trash2, ShoppingBasket, PlayCircle } from "lucide-react";
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
  uid,
} from "@/lib/db";
import type { CartItem, Product } from "@/lib/types";

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
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [shift, setShift] = useState(getOpenShift());
  const [weightModal, setWeightModal] = useState<Product | null>(null);
  const [weight, setWeight] = useState("");

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [user, ready, navigate]);

  useEffect(() => {
    setProducts(getProducts().filter((p) => p.active));
    maybeAutoBackup();
  }, []);

  const filtered = useMemo(
    () => products.filter((p) => p.name.includes(search) || p.barcode?.includes(search)),
    [products, search],
  );

  const total = cart.reduce((s, i) => s + i.total, 0);

  const addProduct = (p: Product) => {
    if (p.unit === "kg") {
      setWeight("");
      setWeightModal(p);
      const n = native();
      if (n) {
        const s = getSettings();
        n.readWeight(s.scaleIp, s.scalePort).then((r) => {
          if (r.ok && r.weight) setWeight(r.weight.toFixed(3));
          else toast.error("تعذر قراءة الوزن من الميزان — أدخله يدوياً");
        });
      }
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

  const checkout = () => {
    if (!user || !shift || cart.length === 0) return;
    addSale({
      id: uid(),
      number: nextSaleNumber(),
      shiftId: shift.id,
      userId: user.id,
      userName: user.name,
      items: cart,
      total,
      createdAt: new Date().toISOString(),
    });
    // decrement stock
    const all = getProducts().map((p) => {
      const item = cart.find((i) => i.productId === p.id);
      return item ? { ...p, stock: Math.max(0, p.stock - item.qty) } : p;
    });
    saveProducts(all);
    setProducts(all.filter((p) => p.active));
    setCart([]);
    toast.success(`تم حفظ الفاتورة رقم ${nextSaleNumber() - 1}`);
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
          <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-auto lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="flex h-28 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card p-3 transition hover:border-primary hover:bg-accent active:scale-95"
              >
                {p.unit === "kg" && <Scale className="h-5 w-5 text-primary" />}
                <span className="text-base font-bold text-foreground">{p.name}</span>
                <span className="text-sm text-muted-foreground">
                  {formatMoney(p.price)} {p.unit === "kg" ? "/ كغم" : ""}
                </span>
              </button>
            ))}
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
              دفع وحفظ الفاتورة
            </button>
          </div>
        </div>
      </div>

      {/* Weight modal */}
      {weightModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-1 text-xl font-bold">{weightModal.name}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              السعر: {formatMoney(weightModal.price)} / كغم
            </p>
            <label className="mb-2 block text-sm font-semibold">الوزن (كغم)</label>
            <input
              autoFocus
              type="number"
              step="0.001"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmWeight()}
              placeholder="0.000"
              className="mb-2 h-14 w-full rounded-xl border border-border bg-secondary px-4 text-center text-2xl font-bold outline-none focus:border-primary"
            />
            <p className="mb-4 text-xs text-muted-foreground">
              عند ربط الميزان سيُجلب الوزن تلقائياً من الميزان بدون كتابة
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
