import { Bike, Printer, ShoppingBasket, Trash2, PauseCircle, Undo2, CreditCard, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, saleTotal, saleTotalWithDelivery } from "@/lib/db";
import type { CartItem, Settings } from "@/lib/types";
import type { DeliveryFields } from "@/lib/deliveryFields";

interface Props {
  cart: CartItem[];
  settings: Settings;
  discount: number;
  fields: DeliveryFields;
  onFields: (fields: DeliveryFields) => void;
  highlight: string | null;
  onRemove: (index: number) => void;
  onQuantity: (index: number, delta: number) => void;
  onPay: () => void;
  onDelivery: () => void;
  onPrint: () => void;
  onHold: () => void;
  onHeld: () => void;
  heldCount: number;
  canPrint: boolean;
}

export function PosInvoice({ cart, settings, discount, fields, onFields, highlight, onRemove, onQuantity, onPay, onDelivery, onPrint, onHold, onHeld, heldCount, canPrint }: Props) {
  const rounding = settings.cashRounding !== false;
  const total = saleTotal(cart, discount, rounding);
  const fee = Math.max(0, settings.deliveryFee ?? 0);
  return (
    <aside className="pos-invoice flex min-h-0 min-w-0 flex-col border-r border-border bg-card" aria-label="الفاتورة الحالية">
      {settings.deliveryEnabled && <section className="border-b border-border p-4 short:p-3">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold short:mb-2"><Bike className="h-5 w-5 text-primary" />بيانات التوصيل</h2>
        <div className="grid grid-cols-3 gap-3 narrow:gap-2">
          {([
            ["name", "اسم الزبون", settings.deliveryNameOptional],
            ["phone", "رقم الهاتف", settings.deliveryPhoneOptional],
            ["address", "العنوان", settings.deliveryAddressOptional],
          ] as const).map(([key, label, optional]) => <div key={key} className="min-w-0">
            <label htmlFor={`delivery-${key}`} className="mb-1 block text-xs font-semibold">{label}{optional && <span className="text-muted-foreground"> (اختياري)</span>}</label>
            <input id={`delivery-${key}`} value={fields[key]} type={key === "phone" ? "tel" : "text"} dir={key === "phone" ? "ltr" : "rtl"} onChange={(e) => onFields({ ...fields, [key]: e.target.value })} className="h-10 w-full min-w-0 rounded-md border border-border bg-secondary px-2 text-sm outline-none focus:border-primary short:h-9" />
          </div>)}
        </div>
        <div className="mt-3 flex items-center justify-end gap-3 text-xs short:mt-2"><span className="text-muted-foreground">أجور التوصيل</span><span dir="ltr" className="font-bold">{formatMoney(fee)}</span></div>
      </section>}
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 short:py-2">
        <h2 className="flex items-center gap-2 text-sm font-bold"><ShoppingBasket className="h-5 w-5 text-primary" />قائمة المشتريات</h2>
        <span className="text-xs text-muted-foreground">{cart.length} أصناف</span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto" aria-live="polite">
        <table className="pos-invoice-table w-full table-fixed text-right text-xs">
          <colgroup><col className="w-[29%]"/><col className="w-[24%]"/><col className="w-[19%]"/><col className="w-[20%]"/><col className="w-[8%]"/></colgroup>
          <thead className="sticky top-0 z-10 bg-secondary text-muted-foreground"><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th><span className="sr-only">حذف</span></th></tr></thead>
          <tbody>{cart.map((item, index) => <tr key={index} className={highlight === item.productId ? "pos-line-added" : ""}>
            <td className="font-bold">{item.name}</td>
            <td><div className="flex flex-wrap items-center justify-center gap-1">
              {item.unit === "piece" && <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`تقليل كمية ${item.name}`} onClick={() => onQuantity(index, -1)}><Minus /></Button>}
              <span dir="ltr" className="font-semibold">{item.unit === "kg" ? item.qty.toFixed(3) : item.qty}</span>
              {item.unit === "piece" && <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`زيادة كمية ${item.name}`} onClick={() => onQuantity(index, 1)}><Plus /></Button>}
              <span className="w-full text-center text-muted-foreground">{item.unit === "kg" ? "كغم" : "قطعة"}</span>
            </div></td>
            <td><span dir="ltr">{formatMoney(item.price)}</span></td>
            <td className="font-bold text-primary"><span dir="ltr">{formatMoney(item.total)}</span></td>
            <td><Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`حذف ${item.name}`} onClick={() => onRemove(index)}><Trash2 /></Button></td>
          </tr>)}</tbody>
        </table>
        {cart.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">الفاتورة فارغة</div>}
      </div>
      <footer className="border-t border-border p-4 short:p-3">
        {discount > 0 && <div className="mb-2 flex justify-between text-xs text-muted-foreground"><span>الخصم</span><span dir="ltr">-{formatMoney(discount)}</span></div>}
        {rounding && <div className="mb-2 flex justify-between gap-2 text-sm text-muted-foreground" data-testid="original-sale-total"><span>المجموع الأصلي</span><span dir="ltr">{formatMoney(saleTotal(cart, discount, false))}</span></div>}
        <div className="mb-2 flex justify-between gap-2 font-bold" data-testid="final-sale-total"><span>{rounding ? "المجموع بعد التقريب" : "مجموع المواد"}</span><span dir="ltr" className="text-primary">{formatMoney(total)}</span></div>
        {settings.deliveryEnabled && <><div className="mb-2 flex justify-between gap-2 text-sm"><span>أجور التوصيل</span><span dir="ltr">{formatMoney(fee)}</span></div><div className="mb-3 flex justify-between gap-2 border-t border-border pt-2 text-lg font-bold text-primary"><span>الإجمالي مع التوصيل</span><span dir="ltr">{formatMoney(saleTotalWithDelivery(cart, discount, rounding, fee))}</span></div></>}
        <div className="mb-2 flex gap-2">
          <Button variant="secondary" className="h-9 flex-1" onClick={onHold} disabled={!cart.length}><PauseCircle />تعليق</Button>
          <Button variant="secondary" className="h-9 flex-1" onClick={onHeld}><Undo2 />المعلّقة{heldCount > 0 && <span>{heldCount}</span>}</Button>
        </div>
        <div className="grid grid-flow-col auto-cols-fr gap-2">
          <Button variant="secondary" className="h-16 flex-col gap-1 px-1 short:h-14" onClick={onPrint} disabled={!canPrint}><Printer />طباعة الفاتورة</Button>
          {settings.deliveryEnabled && <Button className="h-16 flex-col gap-1 bg-delivery px-1 text-delivery-foreground hover:bg-delivery/90 short:h-14" onClick={onDelivery} disabled={!cart.length}><Bike />توصيل</Button>}
          <Button className="h-16 flex-col gap-1 px-1 short:h-14" onClick={onPay} disabled={!cart.length}><CreditCard />دفع</Button>
        </div>
      </footer>
    </aside>
  );
}