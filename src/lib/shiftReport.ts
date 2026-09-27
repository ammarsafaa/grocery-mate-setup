import { getSales, getSettings, getShifts, saveShifts } from "./db";
import { native } from "./native";
import type { Sale, Shift } from "./types";

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const n = (v: number) => v.toLocaleString("ar-IQ");

export interface ProductLine { name: string; unit: "piece" | "kg"; qty: number; total: number; }

export function summarize(sales: Sale[]) {
  const map = new Map<string, ProductLine>();
  for (const s of sales) for (const i of s.items) {
    const cur = map.get(i.productId) ?? { name: i.name, unit: i.unit, qty: 0, total: 0 };
    cur.qty += i.qty; cur.total += i.total; map.set(i.productId, cur);
  }
  const products = [...map.values()].sort((a, b) => b.total - a.total);
  const total = sales.reduce((t, s) => t + s.total, 0);
  const count = sales.length;
  const pieces = products.filter((p) => p.unit === "piece").reduce((t, p) => t + p.qty, 0);
  const kg = products.filter((p) => p.unit === "kg").reduce((t, p) => t + p.qty, 0);
  const times = sales.map((s) => s.createdAt).sort();
  return { products, total, count, avg: count ? Math.round(total / count) : 0, max: count ? Math.max(...sales.map((s) => s.total)) : 0, pieces, kg, first: times[0], last: times[times.length - 1] };
}

/** Closes the open shift and returns it with its sales. */
export function closeShift(shiftId: string, closingCash: number): { shift: Shift; sales: Sale[] } {
  const sales = getSales().filter((s) => s.shiftId === shiftId);
  let closed!: Shift;
  const updated = getShifts().map((s) => {
    if (s.id !== shiftId) return s;
    closed = { ...s, closedAt: new Date().toISOString(), closingCash, salesTotal: sales.reduce((t, x) => t + x.total, 0), salesCount: sales.length };
    return closed;
  });
  saveShifts(updated);
  return { shift: closed, sales };
}

export function buildShiftReportHtml(shift: Shift, sales: Sale[]) {
  const st = getSettings();
  const cur = esc(st.currency);
  const r = summarize(sales);
  const expected = shift.openingCash + r.total;
  const diff = (shift.closingCash ?? 0) - expected;
  const line = (a: string, b: string) => `<div class="line"><span>${a}</span><b>${b}</b></div>`;
  const t = (iso?: string) => (iso ? new Date(iso).toLocaleString("ar-IQ") : "—");
  const rows = r.products.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${p.unit === "kg" ? `${p.qty.toFixed(3)} كغم` : `${n(p.qty)} قطعة`}</td><td>${n(p.total)}</td></tr>`).join("");
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>@page{size:${st.paperWidth}mm auto;margin:2mm}*{box-sizing:border-box}body{width:${st.paperWidth - 4}mm;margin:0;color:#111;background:#fff;font-family:Cairo,Arial,sans-serif;font-size:12px}h1{font-size:16px;text-align:center;margin:4px 0}h2{font-size:13px;margin:8px 0 4px;border-bottom:1px dashed #111;padding-bottom:3px}.line{display:flex;justify-content:space-between;margin:2px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:2px;text-align:right;border-bottom:1px solid #999;overflow-wrap:anywhere}th:first-child,td:first-child{width:8%}.big{font-size:15px;border-top:2px solid #111;padding-top:4px;margin-top:6px}</style></head><body>
<h1>${esc(st.storeName)}</h1><div style="text-align:center">تقرير نهاية الوردية / اليوم</div>
<h2>معلومات الوردية</h2>${line("الكاشير", esc(shift.userName))}${line("الفتح", t(shift.openedAt))}${line("الغلق", t(shift.closedAt))}${line("أول فاتورة", t(r.first))}${line("آخر فاتورة", t(r.last))}
<h2>ملخص المبيعات</h2>${line("عدد الفواتير", n(r.count))}${line("متوسط الفاتورة", `${n(r.avg)} ${cur}`)}${line("أكبر فاتورة", `${n(r.max)} ${cur}`)}${line("عدد الأصناف المختلفة", n(r.products.length))}${line("القطع المباعة", n(r.pieces))}${line("الوزن المباع", `${r.kg.toFixed(3)} كغم`)}
<h2>المنتجات المباعة (من الأكثر إلى الأقل)</h2><table><thead><tr><th>#</th><th>المنتج</th><th>الكمية/الوزن</th><th>المبلغ</th></tr></thead><tbody>${rows || `<tr><td colspan="4" style="text-align:center">لا توجد مبيعات</td></tr>`}</tbody></table>
<h2>الصندوق</h2>${line("نقد الافتتاح", `${n(shift.openingCash)} ${cur}`)}${line("المبيعات النقدية", `${n(r.total)} ${cur}`)}${line("المتوقع في الصندوق", `${n(expected)} ${cur}`)}${line("الموجود فعلياً", `${n(shift.closingCash ?? 0)} ${cur}`)}${line(diff >= 0 ? "زيادة" : "عجز", `${n(Math.abs(diff))} ${cur}`)}
<div class="line big"><span>المبلغ النهائي للمبيعات</span><b>${n(r.total)} ${cur}</b></div>
<div style="text-align:center;margin-top:10px">توقيع الكاشير: ..................</div></body></html>`;
}

export async function printHtml(html: string): Promise<boolean> {
  const bridge = native();
  const st = getSettings();
  if (bridge) return (await bridge.printReceipt(html, st.printerName, 1)).ok;
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;width:0;height:0;border:0";
  document.body.appendChild(f);
  f.contentDocument!.open(); f.contentDocument!.write(html); f.contentDocument!.close();
  await new Promise((r) => setTimeout(r, 300));
  f.contentWindow!.print();
  setTimeout(() => f.remove(), 2000);
  return true;
}
