import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ImageIcon } from "lucide-react";

function resizeImage(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        const context = c.getContext("2d");
        if (!context) {
          reject(new Error("تعذر تجهيز الصورة"));
          return;
        }
        context.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { getGroups, getProducts, saveProducts, formatMoney, uid } from "@/lib/db";
import type { Product, ProductGroup } from "@/lib/types";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "المنتجات — نظام البقالة" },
      { name: "description", content: "إدارة المنتجات والأسعار والمخزون" },
      { property: "og:title", content: "المنتجات — نظام البقالة" },
      { property: "og:description", content: "إدارة المنتجات والأسعار والصور والمخزون" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

const EMPTY: Omit<Product, "id"> = {
  name: "",
  price: 0,
  unit: "piece",
  category: "عام",
  stock: 0,
  active: true,
  barcode: "",
};

function ProductsPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [priceEditId, setPriceEditId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");

  const saveQuickPrice = (id: string) => {
    const value = Number(priceDraft);
    if (!value || value <= 0) {
      toast.error("أدخل سعراً صحيحاً");
      return;
    }
    const next = products.map((p) => (p.id === id ? { ...p, price: value } : p));
    saveProducts(next);
    setProducts(next);
    setPriceEditId(null);
    toast.success("تم تحديث السعر");
  };

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [user, ready, navigate]);

  useEffect(() => {
    if (pathname === "/products") { setProducts(getProducts()); setGroups(getGroups()); }
  }, [pathname]);

  useEffect(() => {
    const reload = () => setProducts(getProducts());
    window.addEventListener("grocery-pos:products-updated", reload);
    return () => window.removeEventListener("grocery-pos:products-updated", reload);
  }, []);

  const save = () => {
    if (!editing || !editing.name || editing.price <= 0) {
      toast.error("أدخل اسم المنتج وسعره");
      return;
    }
    const next = isNew
      ? [...products, editing]
      : products.map((p) => (p.id === editing.id ? editing : p));
    try {
      saveProducts(next);
      const saved = getProducts();
      const savedProduct = saved.find((product) => product.id === editing.id);
      if (!savedProduct || savedProduct.image !== editing.image) {
        throw new Error("لم تُحفظ صورة المنتج");
      }
      setProducts(saved);
    } catch {
      toast.error("لا توجد مساحة كافية لحفظ الصورة، جرّب صورة أصغر");
      return;
    }
    setEditing(null);
    toast.success("تم الحفظ");
  };

  const remove = (id: string) => {
    const next = products.filter((p) => p.id !== id);
    saveProducts(next);
    setProducts(next);
    toast.success("تم حذف المنتج");
  };

  if (!ready || !user) return null;

  return (
    <AppLayout>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">المنتجات</h1>
          <button
            onClick={() => {
              setEditing({ ...EMPTY, id: uid() });
              setIsNew(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"
          >
            <Plus className="h-5 w-5" /> منتج جديد
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground">
              <tr>
                <th className="p-3 text-right font-semibold">الاسم</th>
                <th className="p-3 text-right font-semibold">المجموعة</th>
                <th className="p-3 text-right font-semibold">السعر</th>
                <th className="p-3 text-right font-semibold">الوحدة</th>
                <th className="p-3 text-right font-semibold">المخزون</th>
                <th className="p-3 text-right font-semibold">باركود</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-3 font-bold">
                    <div className="flex items-center gap-2">
                      {p.image && <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover" />}
                      {p.name}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{groups.find((g) => g.id === p.groupId)?.name ?? p.category}</td>
                  <td className="p-3">
                    {priceEditId === p.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="number"
                          value={priceDraft}
                          onChange={(e) => setPriceDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveQuickPrice(p.id);
                            if (e.key === "Escape") setPriceEditId(null);
                          }}
                          className="h-10 w-28 rounded-lg border border-primary bg-secondary px-2 outline-none"
                        />
                        <button onClick={() => saveQuickPrice(p.id)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">حفظ</button>
                        <button onClick={() => setPriceEditId(null)} className="rounded-lg bg-secondary px-3 py-2 text-xs font-bold">إلغاء</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setPriceEditId(p.id); setPriceDraft(String(p.price)); }}
                        className="rounded-lg px-2 py-1 font-bold text-primary hover:bg-accent"
                        title="اضغط لتغيير السعر بسرعة"
                      >
                        {formatMoney(p.price)}
                      </button>
                    )}
                  </td>
                  <td className="p-3">{p.unit === "kg" ? "كغم" : "قطعة"}</td>
                  <td className="p-3">{p.stock}</td>
                  <td className="p-3 text-muted-foreground">{p.barcode || "—"}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditing({ ...p });
                          setIsNew(false);
                        }}
                        className="rounded-lg p-2 hover:bg-accent"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {user.role === "admin" && (
                        <button
                          onClick={() => remove(p.id)}
                          className="rounded-lg p-2 text-destructive hover:bg-accent"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-4 text-xl font-bold">{isNew ? "منتج جديد" : "تعديل منتج"}</h3>
            <div className="space-y-3">
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="اسم المنتج"
                className="h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  value={editing.price || ""}
                  onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                  placeholder="السعر"
                  className="h-12 rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
                />
                <input
                  type="number"
                  value={editing.stock || ""}
                  onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })}
                  placeholder="المخزون"
                  className="h-12 rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={editing.unit}
                  onChange={(e) =>
                    setEditing({ ...editing, unit: e.target.value as "piece" | "kg" })
                  }
                  className="h-12 rounded-xl border border-border bg-secondary px-4 outline-none"
                >
                  <option value="piece">قطعة</option>
                  <option value="kg">كغم (ميزان)</option>
                </select>
                 <select value={editing.groupId ?? ""} onChange={(e) => { const group = groups.find((g) => g.id === e.target.value); setEditing({ ...editing, groupId: e.target.value || undefined, category: group?.name ?? "عام" }); }} className="h-12 rounded-xl border border-border bg-secondary px-4 outline-none"><option value="">بدون مجموعة</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
              </div>
               <div className="grid grid-cols-2 gap-3">
                 <input type="number" value={editing.costPrice || ""} onChange={(e) => setEditing({ ...editing, costPrice: Number(e.target.value) })} placeholder="سعر الشراء" className="h-12 rounded-xl border border-border bg-secondary px-4"/>
                 <input type="number" value={editing.minStock ?? ""} onChange={(e) => setEditing({ ...editing, minStock: Number(e.target.value) })} placeholder="حد تنبيه المخزون" className="h-12 rounded-xl border border-border bg-secondary px-4"/>
               </div>
              <input
                value={editing.barcode || ""}
                onChange={(e) => setEditing({ ...editing, barcode: e.target.value })}
                placeholder="الباركود (اختياري)"
                className="h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
              />
              {editing.unit === "kg" && (
                <input
                  inputMode="numeric"
                  value={editing.plu || ""}
                  onChange={(e) => setEditing({ ...editing, plu: e.target.value.replace(/\D/g, "") })}
                  placeholder="رقم المنتج في الميزان (لملصقات الباركود)"
                  className="h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
                />
              )}
              <div className="flex items-center gap-3">
                {editing.image ? (
                  <img src={editing.image} alt="" className="h-20 w-20 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-secondary">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <label className="cursor-pointer rounded-xl bg-secondary px-4 py-3 font-bold hover:bg-accent">
                  {editing.image ? "تغيير الصورة" : "إضافة صورة"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      try {
                        const img = await resizeImage(f);
                        setEditing((ed) => (ed ? { ...ed, image: img } : ed));
                        toast.success("تمت إضافة الصورة، اضغط حفظ");
                      } catch {
                        toast.error("تعذر قراءة الصورة، جرّب صورة JPG أو PNG");
                      }
                    }}
                  />
                </label>
                {editing.image && (
                  <button
                    onClick={() => setEditing({ ...editing, image: undefined })}
                    className="text-sm text-destructive"
                  >
                    حذف
                  </button>
                )}
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={save}
                className="h-12 flex-1 rounded-xl bg-primary font-bold text-primary-foreground"
              >
                حفظ
              </button>
              <button
                onClick={() => setEditing(null)}
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
