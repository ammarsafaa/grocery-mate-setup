import { native } from "@/lib/native";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { PosInvoice } from "@/components/PosInvoice";
import { missingDeliveryFields } from "@/lib/deliveryFields";
import { posTileWidth } from "@/lib/posTileSize";
import { ArrowRight, FolderOpen, Printer, Scale, Trash2, ShoppingBasket, PlayCircle, Pencil, Percent, Package, Layers, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import {
  getProducts,
  getOpenShift,
  getShifts,
  saveShifts,
  addSale,
  nextSaleNumber,
  currentTerminal,
  saleLabel,
  saveProducts,
  formatMoney,
  maybeAutoBackup,
  getSettings,
  getGroups,
  recordSaleMovements,
  saleTotal,
  saleTotalWithDelivery,
  parseScaleLabel,
  uid,
  getHeldCarts,
  holdCart,
  takeHeldCart,
  lineTotalWithOffer,
  weightedUnitPrice,
} from "@/lib/db";
import { speakArabic } from "@/lib/image";
import { buildReceiptHtml } from "@/lib/receipt";
import { buildShiftReportHtml, closeShift as doCloseShift, printHtml } from "@/lib/shiftReport";
import type { CartItem, Product, ProductGroup, Sale } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "نقطة البيع — نظام البقالة" },
      { name: "description", content: "شاشة الكاشير لبيع المنتجات بالوزن أو بالقطعة" },
      { property: "og:title", content: "نقطة البيع — نظام البقالة" },
      { property: "og:description", content: "شاشة الكاشير لبيع المنتجات بالوزن أو بالقطعة" },
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
  const [openedMsg, setOpenedMsg] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [endCash, setEndCash] = useState("");
  const [ending, setEnding] = useState(false);
  useEffect(() => {
    if (!user || getOpenShift() || !getSettings().easyShift) return;
    const s = { id: uid(), userId: user.id, userName: user.name, openedAt: new Date().toISOString(), openingCash: 0 };
    saveShifts([...getShifts(), s]);
    setShift(s);
    setOpenedMsg(true);
  }, [user]);
  const endShift = async () => {
    if (!shift || ending) return;
    if (getHeldCarts().length > 0) {
      toast.error("توجد فواتير معلّقة — أنهِها أو احذفها قبل غلق الوردية");
      return;
    }
    setEnding(true);
    const { shift: closed, sales } = doCloseShift(shift.id, Number(endCash) || 0);
    window.dispatchEvent(new Event("grocery-pos:shift-closed"));
    toast.success("تم إنهاء الوردية، جارٍ طباعة التقرير");
    await printHtml(buildShiftReportHtml(closed, sales));
    setEnding(false); setEndOpen(false); setEndCash(""); setShift(undefined);
  };
  const [weightModal, setWeightModal] = useState<Product | null>(null);
  const [weight, setWeight] = useState("");
  const [scaleStatus, setScaleStatus] = useState("");
  const [liveWeight, setLiveWeight] = useState(0);
  const [settings, setSettings] = useState(getSettings());
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>("__all");
  const [priceMode, setPriceMode] = useState(false);
  const [priceEdit, setPriceEdit] = useState<Product | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [paidDraft, setPaidDraft] = useState(0);
  const [wholesale, setWholesale] = useState(false);
  const [cartonMode, setCartonMode] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountDraft, setDiscountDraft] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 1100);
    return () => clearTimeout(timer);
  }, [highlight, cart]);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({ name: "", phone: "", address: "" });
  const [held, setHeld] = useState(getHeldCarts());
  const [heldOpen, setHeldOpen] = useState(false);
  const pic = !!settings.pictureMode;

  /** سعر القطعة الفعلي: جملة إذا كان وضع الجملة فعّالاً أو الكمية وصلت حد الجملة. */
  const piecePrice = (p: Product, qty: number) =>
    p.wholesalePrice && p.wholesalePrice > 0 && (wholesale || ((p.wholesaleMinQty ?? 0) > 0 && qty >= (p.wholesaleMinQty ?? 0)))
      ? p.wholesalePrice
      : p.price;

  const saveQuickPrice = () => {
    const value = Number(priceDraft);
    if (!priceEdit || !value || value <= 0) {
      toast.error("أدخل سعراً صحيحاً");
      return;
    }
    const all = getProducts().map((p) => (p.id === priceEdit.id ? { ...p, price: value } : p));
    saveProducts(all);
    setProducts(all.filter((p) => p.active !== false));
    setPriceEdit(null);
    setPriceMode(false);
    toast.success(`تم تحديث سعر ${priceEdit.name}`);
  };

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
    window.addEventListener("grocery-pos:settings-updated", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener("storage", load);
      window.removeEventListener("grocery-pos:products-updated", load);
      window.removeEventListener("grocery-pos:settings-updated", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  const filtered = useMemo(
    () => products.filter((p) => (!selectedGroup || selectedGroup === "__all" || p.groupId === selectedGroup) && (p.name.includes(search) || p.barcode?.includes(search))),
    [products, search, selectedGroup],
  );

  const itemsTotal = cart.reduce((sum, item) => sum + item.total, 0);
  const roundingEnabled = settings.cashRounding !== false;
  const originalTotal = saleTotal(cart, discount, false);
  const total = saleTotal(cart, discount, roundingEnabled);

  // Poll the scale continuously so the live weight is always visible in the top bar
  useEffect(() => {
    if (settings.useScale === false) return;
    const n = native();
    if (!n) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      const s = getSettings();
      const r: { ok: boolean; weight?: number; error?: string; waiting?: boolean } = s.scaleMode === "lan"
        ? await n.readWeight(s.scaleIp, s.scalePort).catch((e) => ({ ok: false, error: String(e) }))
        : await n.readWeightSerial(s.scaleCom, s.scaleBaud).catch((e) => ({ ok: false, error: String(e) }));
      if (!alive) return;
      if (r.ok) setLiveWeight((r.weight ?? 0) > 0 ? (r.weight as number) : 0);
      setTimeout(tick, 150);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [settings.useScale]);

  // Poll the scale while the manual weight window is open (manual mode only)
  useEffect(() => {
    if (!weightModal) return;
    setScaleStatus("اكتب الوزن يدوياً بالكيلوغرام");
  }, [weightModal]);

  const addProduct = (p: Product) => {
    if (priceMode) {
      setPriceEdit(p);
      setPriceDraft(String(p.price));
      return;
    }
    if (p.unit === "kg") {
      if (settings.useScale !== false && native()) {
        if (liveWeight <= 0) {
          toast.error("ضع المنتج على الميزان أولاً");
          return;
        }
        const w = liveWeight;
        setCart((c) => [
          ...c,
          { productId: p.id, name: p.name, unit: "kg", price: weightedUnitPrice(p), qty: w, total: lineTotalWithOffer(p, w) },
        ]);
        setHighlight(p.id);
        return;
      }
      setWeight("");
      setWeightModal(p);
      return;
    }
    if (cartonMode) {
      const cartonPrice = p.cartonPrice;
      const cartonQty = p.cartonQty;
      if (!cartonPrice || !cartonQty) {
        toast.error("هذا المنتج بدون سعر كرتونة");
        return;
      }
      setCart((c) => [
        ...c,
        { productId: p.id, name: `${p.name} (كرتونة)`, unit: "piece", price: cartonPrice / cartonQty, qty: cartonQty, total: cartonPrice },
      ]);
      toast.success(`${p.name} — كرتونة (${p.cartonQty} قطعة)`);
      return;
    }
    setCart((c) => {
      const ex = c.find((i) => i.productId === p.id && !i.name.includes("كرتونة"));
      const newQty = (ex?.qty ?? 0) + 1;
      const price = piecePrice(p, newQty);
      if (ex)
        return c.map((i) =>
          i === ex
            ? { ...i, qty: newQty, price, total: lineTotalWithOffer(p, newQty, price) }
            : i,
        );
      return [
        ...c,
        { productId: p.id, name: p.name, unit: p.unit, price, qty: 1, total: lineTotalWithOffer(p, 1, price) },
      ];
    });
  };

  const handleScan = () => {
    const code = search.trim();
    if (!code) return;
    const label = parseScaleLabel(code, getSettings(), products);
    if (label) {
      if ("error" in label) { toast.error(label.error); setSearch(""); return; }
      const { product: p, qty, total: lineTotal } = label;
      const price = getSettings().labelValueType === "weight" ? weightedUnitPrice(p) : p.price;
      setCart((c) => [...c, { productId: p.id, name: p.name, unit: p.unit, price, qty, total: lineTotal }]);
      setHighlight(p.id);
      setSearch("");
      return;
    }
    const exact = products.find((p) => p.barcode && p.barcode === code);
    if (exact) { addProduct(exact); setSearch(""); }
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
        price: weightedUnitPrice(p),
        qty: w,
        total: lineTotalWithOffer(p, w),
      },
    ]);
    setHighlight(p.id);
    setWeightModal(null);
  };

  const checkout = async (paidAmount?: number, delivery?: Sale["delivery"]) => {
    if (!user || !shift || cart.length === 0) return;
    const fee = delivery ? Math.max(0, settings.deliveryFee ?? 0) : 0;
    const finalTotal = delivery ? saleTotalWithDelivery(cart, discount, roundingEnabled, fee) : total;
    const sale: Sale = {
      id: uid(),
      number: nextSaleNumber(),
      shiftId: shift.id,
      userId: user.id,
      userName: user.name,
      items: cart,
      total: finalTotal,
      createdAt: new Date().toISOString(),
      paid: paidAmount && paidAmount > finalTotal ? paidAmount : finalTotal,
      change: paidAmount && paidAmount > finalTotal ? paidAmount - finalTotal : 0,
      terminal: currentTerminal(),
      ...(discount > 0 ? { discount } : {}),
      ...(delivery ? { delivery: { ...delivery, fee } } : {}),
    };
    addSale(sale);
    setLastSale(sale);
    setDeliveryForm({ name: "", phone: "", address: "" });
    if (settings.speakTotals && !pic) speakArabic(`المبلغ ${finalTotal} دينار`);
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
    setDiscount(0);
    toast.success(`تم حفظ الفاتورة رقم ${saleLabel(sale)}`);
    if (settings.autoPrint) {
      const n = native();
      if (n) {
        const result = await n.printReceipt(buildReceiptHtml(sale), settings.printerName, settings.printCopies);
        if (!result.ok) toast.error("حُفظت الفاتورة لكن تعذرت طباعتها");
      }
    }
  };

  if (!ready || !user) return null;

  if (!shift && settings.easyShift) {
    return (
      <AppLayout>
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
          <PlayCircle className="h-16 w-16 text-primary" />
          <h2 className="text-2xl font-bold">انتهت الوردية</h2>
          <button onClick={() => { if (!user) return; const s = { id: uid(), userId: user.id, userName: user.name, openedAt: new Date().toISOString(), openingCash: 0 }; saveShifts([...getShifts(), s]); setShift(s); setOpenedMsg(true); }} className="rounded-xl bg-primary px-8 py-3 text-lg font-bold text-primary-foreground">فتح وردية جديدة</button>
        </div>
      </AppLayout>
    );
  }

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
      {openedMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center">
            <PlayCircle className="mx-auto mb-3 h-16 w-16 text-primary" />
            <h2 className="mb-6 text-2xl font-bold">تم فتح ورديتك ✅</h2>
            <button autoFocus onClick={() => setOpenedMsg(false)} className="h-14 w-full rounded-xl bg-primary text-xl font-bold text-primary-foreground">موافق</button>
          </div>
        </div>
      )}
      {endOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
            <h2 className="mb-4 text-2xl font-bold">إنهاء الوردية</h2>
            <label className="mb-2 block text-muted-foreground">كم فلوس بالقاصة؟</label>
            <input type="number" autoFocus value={endCash} onChange={(e) => setEndCash(e.target.value)} className="mb-4 h-14 w-full rounded-xl border border-border bg-secondary px-4 text-center text-2xl font-bold outline-none focus:border-primary" />
            <button disabled={ending} onClick={endShift} className="mb-2 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-destructive text-xl font-bold text-destructive-foreground disabled:opacity-50"><Printer className="h-6 w-6" /> غلق وطباعة</button>
            <button onClick={() => setEndOpen(false)} className="h-12 w-full rounded-xl bg-back font-bold text-back-foreground">رجوع</button>
          </div>
        </div>
      )}
      <div className="pos-workspace flex h-screen overflow-hidden">
        {/* Products grid */}
        <div className="pos-product-panel flex min-w-0 flex-1 flex-col p-3 short:p-2 narrow:p-2">
          <div className="mb-3 flex flex-wrap items-center gap-2 short:mb-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleScan(); }}
              autoFocus
              placeholder="ابحث بالاسم أو امسح الباركود..."
              className="h-12 min-w-56 flex-1 rounded-xl border border-border bg-card px-4 text-foreground outline-none focus:border-primary short:h-10"
            />
            {settings.easyShift && (
              <button onClick={() => setEndOpen(true)} className="h-12 shrink-0 rounded-xl bg-destructive px-5 font-bold text-destructive-foreground short:h-10 short:px-3 short:text-sm">إنهاء الوردية</button>
            )}
            {settings.useScale !== false && (
              <div className="flex h-12 min-w-40 shrink-0 items-center justify-between gap-2 rounded-xl border-2 border-primary/50 bg-card px-3 shadow-inner narrow:min-w-36 short:h-10">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black tracking-tight text-primary short:text-xl">
                    {liveWeight > 0 ? liveWeight.toFixed(3) : "0.000"}
                  </span>
                  <span className="text-xs font-bold text-muted-foreground">كغم</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${liveWeight > 0 ? "animate-pulse bg-primary" : "bg-muted-foreground/40"}`} />
                  <span className="text-[10px] font-bold text-muted-foreground">الميزان</span>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 narrow:basis-full">
            <button
              onClick={() => setPriceMode((v) => !v)}
              className={`flex h-12 shrink-0 items-center gap-2 rounded-xl px-5 font-bold transition short:h-10 short:px-3 short:text-sm ${priceMode ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:border-primary"}`}
            >
              <Pencil className="h-4 w-4" />
              {priceMode ? "اضغط على منتج لتغيير سعره" : "تغيير سعر"}
            </button>
            <button
              onClick={() => setWholesale((v) => !v)}
              title="تفعيل سعر الجملة للمنتجات التي لها سعر جملة"
              className={`flex h-12 shrink-0 items-center gap-2 rounded-xl px-4 font-bold transition short:h-10 short:px-3 short:text-sm ${wholesale ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:border-primary"}`}
            >
              <Layers className="h-4 w-4" />
              جملة
            </button>
            <button
              onClick={() => setCartonMode((v) => !v)}
              title="إضافة المنتج ككرتونة كاملة"
              className={`flex h-12 shrink-0 items-center gap-2 rounded-xl px-4 font-bold transition short:h-10 short:px-3 short:text-sm ${cartonMode ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:border-primary"}`}
            >
              <Package className="h-4 w-4" />
              كرتونة
            </button>
            {settings.discountEnabled && (
              <button
                onClick={() => { setDiscountDraft(""); setDiscountOpen(true); }}
                className={`flex h-12 shrink-0 items-center gap-2 rounded-xl px-4 font-bold transition short:h-10 short:px-3 short:text-sm ${discount > 0 ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:border-primary"}`}
              >
                <Percent className="h-4 w-4" />
                خصم
              </button>
            )}
            </div>
          </div>
          {settings.useProductGroups && <nav aria-label="مجموعات المنتجات" className="mb-3 flex shrink-0 gap-2 overflow-x-auto pb-1 short:mb-2">
            <Button variant={selectedGroup === "__all" ? "default" : "secondary"} className="shrink-0" onClick={() => setSelectedGroup("__all")}><Layers />الكل</Button>
            {groups.map((group) => <Button key={group.id} variant={selectedGroup === group.id ? "default" : "secondary"} className="shrink-0" onClick={() => setSelectedGroup(group.id)}><FolderOpen />{group.name}</Button>)}
          </nav>}
          <div className="pos-products-grid min-h-0 flex-1 content-start gap-2 overflow-auto" style={{ "--pos-tile-width": `${posTileWidth(settings.productTileWidth)}px` } as CSSProperties}>
            {settings.useProductGroups && selectedGroup && !search && (
              <button type="button" onClick={() => setSelectedGroup(null)} className="col-span-full flex h-11 w-fit cursor-pointer items-center gap-2 justify-self-start rounded-xl border-2 border-back bg-back px-4 font-black text-back-foreground hover:bg-back/90 active:scale-95 short:h-9">
                <ArrowRight className="h-5 w-5" />
                <span className="text-base">رجوع</span>
              </button>
            )}
            {settings.useProductGroups && !selectedGroup && !search && groups.map((group) => (
              <Button variant="outline"
                key={group.id}
                onClick={() => setSelectedGroup(group.id)}
                title={group.name} className={`pos-tile flex flex-col items-center justify-start gap-1 overflow-hidden bg-card p-2 hover:border-primary hover:bg-accent active:scale-95 ${pic ? "pos-tile-picture" : ""}`} 
              >
                {group.image ? (
                  <img src={group.image} alt={group.name} className="pos-tile-image" />
                ) : (
                  <div className="pos-tile-image flex items-center justify-center bg-primary/15">
                    <FolderOpen className={pic ? "h-16 w-16 text-primary" : "h-8 w-8 text-primary"} />
                  </div>
                )}
                <span className={pic ? "pos-tile-name text-xs text-muted-foreground" : "pos-tile-name product-name font-bold text-foreground"}>{group.name}</span>
              </Button>
            ))}
            {(!settings.useProductGroups || selectedGroup || search ? filtered : []).map((p) => (
              <Button variant="outline"
                key={p.id}
                onClick={() => addProduct(p)}
                title={p.name} className={`pos-tile flex flex-col items-center justify-start gap-1 overflow-hidden bg-card p-2 hover:border-primary hover:bg-accent active:scale-95 ${pic ? "pos-tile-picture" : ""}`} 
              >
                {p.image ? (
                  <img src={p.image} alt={p.name} className="pos-tile-image" />
                ) : (
                  p.unit === "kg" && <Scale className="h-5 w-5 text-primary" />
                )}
                 <span className={pic ? "pos-tile-name text-xs text-muted-foreground" : "pos-tile-name product-name font-bold text-foreground"}>{p.name}</span>
                <span className={pic ? "pos-tile-price text-lg font-black text-primary" : "pos-tile-price text-sm text-muted-foreground"}>
                  {p.unit === "kg" && weightedUnitPrice(p) !== p.price
                    ? `${p.offerQty} كغم بـ ${formatMoney(p.offerPrice ?? 0)}`
                    : `${formatMoney(p.price)} ${p.unit === "kg" ? "/ كغم" : ""}`}
                </span>
              </Button>
            ))}
            {settings.useProductGroups && !selectedGroup && !search && groups.length === 0 && <p className="col-span-full p-8 text-center text-muted-foreground">أضف مجموعات أو عطّل عرض المجموعات من الإعدادات</p>}
          </div>
        </div>

        <PosInvoice
          cart={cart} products={products} settings={settings} discount={discount} fields={deliveryForm}
          onFields={setDeliveryForm} highlight={highlight} heldCount={held.length}
          onRemove={(index) => setCart(cart.filter((_, i) => i !== index))}
          onQuantity={(index, delta) => {
            const item = cart[index];
            if (!item || item.unit !== "piece" || item.name.includes("كرتونة")) return;
            const product = products.find((p) => p.id === item.productId);
            if (!product) return;
            const qty = item.qty + delta;
            if (qty <= 0) { setCart(cart.filter((_, i) => i !== index)); return; }
            const price = piecePrice(product, qty);
            setCart(cart.map((line, i) => i === index ? { ...line, qty, price, total: lineTotalWithOffer(product, qty, price) } : line));
          }}
          onPay={() => { if (pic) { setPaidDraft(0); setPayOpen(true); if (settings.speakTotals) speakArabic(`المبلغ ${total} دينار`); } else checkout(); }}
          onDelivery={() => setDeliveryOpen(true)}
          canPrint={cart.length === 0 && lastSale !== null}
          onPrint={async () => {
            if (cart.length > 0) { toast.error("احفظ الفاتورة بالدفع أو التوصيل قبل طباعتها"); return; }
            if (lastSale) await printHtml(buildReceiptHtml(lastSale));
          }}
          onHold={() => { if (!cart.length) return; holdCart(cart, user?.name ?? ""); setCart([]); setDiscount(0); setDeliveryForm({ name: "", phone: "", address: "" }); setHeld(getHeldCarts()); toast.success("تم تعليق الفاتورة"); }}
          onHeld={() => { setHeld(getHeldCarts()); setHeldOpen(true); }}
        />
      </div>

      {deliveryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-bold">بيانات التوصيل</h2>
            <div className="space-y-3">
              {([
                ["name", "اسم الزبون", settings.deliveryNameOptional],
                ["phone", "رقم الهاتف", settings.deliveryPhoneOptional],
                ["address", "العنوان", settings.deliveryAddressOptional],
              ] as const).map(([key, label, optional]) => <div key={key}>
                <label htmlFor={`delivery-${key}`} className="mb-1 block text-sm font-semibold">{label}{optional && <span className="text-muted-foreground"> (اختياري)</span>}</label>
                <input id={`delivery-${key}`} value={deliveryForm[key]} type={key === "phone" ? "tel" : "text"} dir={key === "phone" ? "ltr" : "rtl"} onChange={(e) => setDeliveryForm({ ...deliveryForm, [key]: e.target.value })} className="h-11 w-full rounded-md border border-border bg-secondary px-3 outline-none focus:border-primary" />
              </div>)}
            </div>
            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between"><span>أجور التوصيل</span><span dir="ltr">{formatMoney(Math.max(0, settings.deliveryFee ?? 0))}</span></div>
              <div className="flex justify-between text-lg font-bold text-primary"><span>الإجمالي مع التوصيل</span><span dir="ltr">{formatMoney(saleTotalWithDelivery(cart, discount, roundingEnabled, Math.max(0, settings.deliveryFee ?? 0)))}</span></div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button className="h-12 bg-delivery text-delivery-foreground hover:bg-delivery/90" onClick={() => {
                const missing = missingDeliveryFields(deliveryForm, settings);
                if (missing.length) { toast.error(`اكتب ${missing.join(" و")} الزبون`); return; }
                setDeliveryOpen(false);
                checkout(undefined, { name: deliveryForm.name.trim(), phone: deliveryForm.phone.trim(), address: deliveryForm.address.trim(), fee: 0 });
              }}>حفظ التوصيل</Button>
              <Button variant="outline" className="h-12" onClick={() => setDeliveryOpen(false)}>رجوع</Button>
            </div>
          </div>
        </div>
      )}

      {/* Picture-mode payment: tap the notes the customer handed over */}
      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between gap-3"><ShoppingBasket className="h-10 w-10 shrink-0 text-primary"/><div className="min-w-0 flex-1">
              {roundingEnabled && <div className="mb-1 flex flex-wrap justify-between gap-x-2 text-sm font-semibold text-muted-foreground"><span>المجموع الأصلي</span><span dir="ltr">{formatMoney(originalTotal)}</span></div>}
              <div className="flex flex-wrap items-center justify-between gap-x-2 font-black"><span className="text-base">{roundingEnabled ? "المجموع بعد التقريب" : "الإجمالي"}</span><span dir="ltr" className="text-3xl text-primary">{formatMoney(total)}</span></div>
            </div></div>
            <div className="grid grid-cols-4 gap-3">
              {[250, 500, 1000, 5000, 10000, 25000, 50000].map((n) => (
                <button key={n} onClick={() => setPaidDraft((v) => v + n)} className="h-20 rounded-xl border-2 border-primary/40 bg-secondary text-2xl font-black hover:border-primary active:scale-95">{formatMoney(n)}</button>
              ))}
              <button onClick={() => setPaidDraft(0)} className="flex h-20 items-center justify-center rounded-xl bg-destructive text-destructive-foreground"><Trash2 className="h-9 w-9"/></button>
            </div>
            <div className={settings.showChange !== false ? "my-5 grid grid-cols-2 gap-3 text-center" : "my-5 text-center"}>
              <div className="rounded-xl bg-secondary p-4"><div className="text-3xl">💵</div><div className="text-3xl font-black">{formatMoney(paidDraft)}</div></div>
              {settings.showChange !== false && <div className="rounded-xl bg-primary/15 p-4"><div className="text-3xl">↩️</div><div className="text-3xl font-black text-primary">{formatMoney(Math.max(0, paidDraft - total))}</div></div>}
            </div>
            <div className="flex gap-3">
              <button disabled={paidDraft > 0 && paidDraft < total} onClick={() => { const change = Math.max(0, paidDraft - total); if (settings.speakTotals && change > 0) speakArabic(`الباقي ${change} دينار`); setPayOpen(false); checkout(paidDraft); }} className="flex h-20 flex-1 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"><Printer className="h-10 w-10"/></button>
              <button onClick={() => setPayOpen(false)} className="flex h-20 w-28 items-center justify-center rounded-xl bg-back text-back-foreground"><ArrowRight className="h-10 w-10"/></button>
            </div>
          </div>
        </div>
      )}

      {/* Quick price modal */}
      {priceEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-1 text-xl font-bold">{priceEdit.name}</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              السعر الحالي: {formatMoney(priceEdit.price)} {priceEdit.unit === "kg" ? "/ كغم" : "/ قطعة"}
            </p>
            <label className="mb-2 block text-sm font-semibold">السعر الجديد</label>
            <input
              autoFocus
              type="number"
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveQuickPrice(); }}
              className="mb-4 h-14 w-full rounded-xl border border-border bg-secondary px-4 text-center text-2xl font-bold outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button onClick={saveQuickPrice} className="h-12 flex-1 rounded-xl bg-primary font-bold text-primary-foreground">حفظ السعر</button>
              <button onClick={() => { setPriceEdit(null); setPriceMode(false); }} className="h-12 flex-1 rounded-xl bg-secondary font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Discount modal */}
      {discountOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-4 text-xl font-bold">خصم على الفاتورة</h3>
            <input
              autoFocus
              type="number"
              value={discountDraft}
              onChange={(e) => setDiscountDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = Number(discountDraft);
                  if (v > 0 && v <= itemsTotal) { setDiscount(v); setDiscountOpen(false); }
                  else toast.error("أدخل مبلغ خصم صحيحاً");
                }
              }}
              placeholder="مبلغ الخصم"
              className="mb-4 h-14 w-full rounded-xl border border-border bg-secondary px-4 text-center text-2xl font-bold outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const v = Number(discountDraft);
                  if (v > 0 && v <= itemsTotal) { setDiscount(v); setDiscountOpen(false); }
                  else toast.error("أدخل مبلغ خصم صحيحاً");
                }}
                className="h-12 flex-1 rounded-xl bg-primary font-bold text-primary-foreground"
              >
                تطبيق
              </button>
              <button onClick={() => { setDiscount(0); setDiscountOpen(false); }} className="h-12 flex-1 rounded-xl bg-secondary font-bold">رجوع بدون خصم</button>
            </div>
          </div>
        </div>
      )}

      {/* Held carts modal */}
      {heldOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-4 text-xl font-bold">الفواتير المعلّقة</h3>
            {held.length === 0 && <p className="py-6 text-center text-muted-foreground">لا توجد فواتير معلّقة</p>}
            <div className="max-h-80 space-y-2 overflow-auto">
              {held.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    if (cart.length > 0) { toast.error("علّق أو أنهِ الفاتورة الحالية أولاً"); return; }
                    const taken = takeHeldCart(h.id);
                    if (taken) {
                      setCart(taken.items);
                      setHeld(getHeldCarts());
                      setHeldOpen(false);
                      toast.success("رجعت الفاتورة المعلّقة");
                    }
                  }}
                  className="flex w-full items-center justify-between rounded-xl bg-secondary p-3 text-right transition hover:border-primary"
                >
                  <div>
                    <div className="font-bold">{h.items.length} صنف — {formatMoney(h.items.reduce((s, i) => s + i.total, 0))}</div>
                    <div className="text-xs text-muted-foreground">{new Date(h.heldAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} — {h.userName}</div>
                  </div>
                  <Undo2 className="h-5 w-5 text-primary" />
                </button>
              ))}
            </div>
            <button onClick={() => setHeldOpen(false)} className="mt-4 h-12 w-full rounded-xl bg-back font-bold text-back-foreground">رجوع</button>
          </div>
        </div>
      )}

      {/* Weight modal */}
      {weightModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
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
                onKeyDown={(e) => { if (e.key === "Enter") confirmWeight(); }}
                placeholder="0.000"
                className="mb-2 h-16 w-full rounded-xl border border-border bg-secondary px-4 text-center text-3xl font-bold outline-none focus:border-primary"
              />
            <p className="mb-4 text-center text-xs text-muted-foreground">
              {scaleStatus}
            </p>
            {parseFloat(weight) > 0 && (
              <p className="mb-4 text-center text-lg font-bold text-primary">
                {formatMoney(lineTotalWithOffer(weightModal, parseFloat(weight)))}
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
