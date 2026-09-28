import { formatMoney, getReceiptDesign, getSettings, readLayoutRaw, writeLayoutRaw } from "./db";
import type { ReceiptDesign, Sale, Shift } from "./types";

/** Visual print layout: every element has a position/width in millimetres inside the printable area. */
export type LayoutKind = "receipt" | "shift";
export interface LayoutElement {
  id: string; label: string; visible: boolean;
  x: number; width: number; gapTop: number; // mm (x measured from the right edge, RTL)
  fontFamily: string; fontSize: number; bold: boolean; align: "right" | "center" | "left"; divider: boolean;
}
export interface Margins { top: number; right: number; bottom: number; left: number; }
export interface PrintLayout { kind: LayoutKind; slot: 58 | 80; paperWidthMm: number; margins: Margins; tableBorders: boolean; elements: LayoutElement[]; }

export const SAFE_MM = 4;
export const FONTS = ["Cairo", "Tajawal", "Noto Kufi Arabic", "Tahoma", "Arial"];

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const snap = (v: number) => Math.round(v * 2) / 2;
export const printableWidth = (l: PrintLayout) => Math.max(20, l.paperWidthMm - l.margins.left - l.margins.right);

const RECEIPT_IDS: [string, string][] = [["logo", "الشعار"], ["store", "اسم المتجر"], ["contact", "العنوان والهاتف"], ["invoice", "رقم الفاتورة"], ["date", "التاريخ والوقت"], ["cashier", "اسم الكاشير"], ["items", "جدول المنتجات"], ["totals", "الإجمالي والمدفوع والباقي"], ["footer", "الرسالة الختامية"]];
const SHIFT_IDS: [string, string, number, boolean, LayoutElement["align"]][] = [["store", "اسم المتجر", 18, true, "center"], ["title", "عنوان التقرير", 12, false, "center"], ["info", "معلومات الوردية", 11, false, "right"], ["summary", "ملخص المبيعات", 11, false, "right"], ["products", "المنتجات المباعة", 10, false, "right"], ["cashbox", "الصندوق", 11, false, "right"], ["final", "المبلغ النهائي", 14, true, "right"], ["signature", "توقيع الكاشير", 11, false, "center"]];

export function normalize(l: PrintLayout): PrintLayout {
  const margins = { top: clamp(l.margins.top, 0, 30), bottom: clamp(l.margins.bottom, 0, 30), right: clamp(l.margins.right, SAFE_MM, 20), left: clamp(l.margins.left, SAFE_MM, 20) };
  const next = { ...l, paperWidthMm: clamp(l.paperWidthMm, 40, 120), margins };
  const W = printableWidth(next);
  return { ...next, elements: next.elements.map((e) => { const width = clamp(e.width, 8, W); return { ...e, width, x: clamp(e.x, 0, W - width), gapTop: clamp(e.gapTop, -10, 60), fontSize: clamp(e.fontSize, 6, 40) }; }) };
}

function defaults(kind: LayoutKind, slot: 58 | 80): PrintLayout {
  const base = { kind, slot, paperWidthMm: slot, margins: { top: 2, right: SAFE_MM, bottom: 4, left: SAFE_MM }, tableBorders: true };
  const W = slot - SAFE_MM * 2;
  if (kind === "receipt") {
    const old = getReceiptDesign(slot);
    const elements = RECEIPT_IDS.map(([id, label]) => {
      const o = old.elements.find((e) => e.id === id);
      return { id, label, visible: o?.visible ?? true, x: 0, width: W, gapTop: o ? Math.round(((o.offsetY ?? 0) / 3.78) * 2) / 2 + 1 : 1, fontFamily: o?.fontFamily ?? "Cairo", fontSize: o?.fontSize ?? 11, bold: o?.bold ?? false, align: o?.align ?? "right", divider: o?.divider ?? false };
    });
    return normalize({ ...base, tableBorders: old.tableBorders ?? true, elements });
  }
  return normalize({ ...base, elements: SHIFT_IDS.map(([id, label, fontSize, bold, align]) => ({ id, label, visible: true, x: 0, width: W, gapTop: 1.5, fontFamily: "Cairo", fontSize, bold, align, divider: ["title", "info", "summary", "products", "cashbox"].includes(id) })) });
}

export function getLayout(kind: LayoutKind, slot: 58 | 80): PrintLayout {
  const saved = readLayoutRaw<PrintLayout>(`${kind}:${slot}`);
  const def = defaults(kind, slot);
  if (!saved) return def;
  const elements = saved.elements.filter((e) => def.elements.some((d) => d.id === e.id));
  for (const d of def.elements) if (!elements.some((e) => e.id === d.id)) elements.push(d);
  return normalize({ ...def, ...saved, elements });
}
export const resetLayout = (kind: LayoutKind, slot: 58 | 80) => { writeLayoutRaw(`${kind}:${slot}`, null); return defaults(kind, slot); };
export const saveLayout = (l: PrintLayout) => writeLayoutRaw(`${l.kind}:${l.slot}`, normalize(l));

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const n = (v: number) => v.toLocaleString("en-GB");
const line = (a: string, b: string) => `<div class="pl-line"><span>${a}</span><b>${b}</b></div>`;

export type ContentFn = (id: string, l: PrintLayout) => string;

export function receiptContent(sale: Sale, design: ReceiptDesign = getReceiptDesign(getSettings().paperWidth)): ContentFn {
  const st = getSettings();
  return (id, l) => {
    const tb = l.tableBorders ? "pl-bordered" : "";
    switch (id) {
      case "logo": return design.logo ? `<img src="${design.logo}" class="pl-logo" />` : "";
      case "store": return esc(st.storeName);
      case "contact": return `${esc(design.address)}${design.address && design.phone ? "<br>" : ""}${esc(design.phone)}`;
      case "invoice": return `فاتورة رقم: ${sale.number}`;
      case "date": return new Date(sale.createdAt).toLocaleString("en-GB");
      case "cashier": return `الكاشير: ${esc(sale.userName)}`;
      case "items": return `<table class="${tb}"><thead><tr><th>المنتج</th><th>الكمية/الوزن</th><th>سعر الوحدة</th><th>المبلغ</th></tr></thead><tbody>${sale.items.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.unit === "kg" ? `${i.qty.toFixed(3)} كغم` : `${i.qty} قطعة`}</td><td>${n(i.price)}${i.unit === "kg" ? "/كغم" : ""}</td><td>${n(i.total)}</td></tr>`).join("")}</tbody></table>`;
      case "totals": return line("الإجمالي", formatMoney(sale.total, st.currency)) + (sale.paid !== undefined ? line("المدفوع", formatMoney(sale.paid, st.currency)) + line("الباقي", formatMoney(sale.change ?? 0, st.currency)) : "");
      case "footer": return esc(design.footer);
      default: return "";
    }
  };
}

export function summarize(sales: Sale[]) {
  const map = new Map<string, { name: string; unit: "piece" | "kg"; qty: number; total: number }>();
  for (const s of sales) for (const i of s.items) { const c = map.get(i.productId) ?? { name: i.name, unit: i.unit, qty: 0, total: 0 }; c.qty += i.qty; c.total += i.total; map.set(i.productId, c); }
  const products = [...map.values()].sort((a, b) => b.total - a.total);
  const total = sales.reduce((t, s) => t + s.total, 0); const count = sales.length; const times = sales.map((s) => s.createdAt).sort();
  return { products, total, count, avg: count ? Math.round(total / count) : 0, max: count ? Math.max(...sales.map((s) => s.total)) : 0, pieces: products.filter((p) => p.unit === "piece").reduce((t, p) => t + p.qty, 0), kg: products.filter((p) => p.unit === "kg").reduce((t, p) => t + p.qty, 0), first: times[0], last: times[times.length - 1] };
}

export function shiftContent(shift: Shift, sales: Sale[]): ContentFn {
  const st = getSettings(); const r = summarize(sales);
  const expected = shift.openingCash + r.total; const diff = (shift.closingCash ?? 0) - expected;
  const money = (v: number) => `${n(v)} ${st.currency}`.trim();
  const t = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-GB") : "—");
  return (id, l) => {
    switch (id) {
      case "store": return esc(st.storeName);
      case "title": return "تقرير نهاية الوردية / اليوم";
      case "info": return `<b>معلومات الوردية</b>${line("الكاشير", esc(shift.userName))}${line("الفتح", t(shift.openedAt))}${line("الغلق", t(shift.closedAt))}${line("أول فاتورة", t(r.first))}${line("آخر فاتورة", t(r.last))}`;
      case "summary": return `<b>ملخص المبيعات</b>${line("عدد الفواتير", n(r.count))}${line("متوسط الفاتورة", money(r.avg))}${line("أكبر فاتورة", money(r.max))}${line("عدد الأصناف المختلفة", n(r.products.length))}${line("القطع المباعة", n(r.pieces))}${line("الوزن المباع", `${r.kg.toFixed(3)} كغم`)}`;
      case "products": return `<b>المنتجات المباعة (من الأكثر إلى الأقل)</b><table class="${l.tableBorders ? "pl-bordered" : ""}"><thead><tr><th style="width:9%">#</th><th>المنتج</th><th>الكمية/الوزن</th><th>المبلغ</th></tr></thead><tbody>${r.products.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${p.unit === "kg" ? `${p.qty.toFixed(3)} كغم` : `${n(p.qty)} قطعة`}</td><td>${n(p.total)}</td></tr>`).join("") || `<tr><td colspan="4" style="text-align:center">لا توجد مبيعات</td></tr>`}</tbody></table>`;
      case "cashbox": return `<b>الصندوق</b>${line("نقد الافتتاح", money(shift.openingCash))}${line("المبيعات النقدية", money(r.total))}${line("المتوقع في الصندوق", money(expected))}${line("الموجود فعلياً", money(shift.closingCash ?? 0))}${line(diff >= 0 ? "زيادة" : "عجز", money(Math.abs(diff)))}`;
      case "final": return line("المبلغ النهائي للمبيعات", money(r.total));
      case "signature": return "توقيع الكاشير: ..................";
      default: return "";
    }
  };
}

/** CSS shared by print output and the designer preview (scoped by selector). */
export function layoutCss(scope: string) {
  const s = scope;
  return `${s}{color:#111;background:#fff;font-family:Cairo,Arial,sans-serif;direction:rtl;box-sizing:border-box}${s} *{box-sizing:border-box}${s} .pl-el{display:block;break-inside:avoid;overflow-wrap:anywhere}${s} .pl-div{border-bottom:1px dashed #111;padding-bottom:1.2mm}${s} .pl-logo{display:block;max-width:60%;max-height:22mm;margin:auto}${s} table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:inherit}${s} th,${s} td{padding:0.6mm 0.3mm;text-align:right;overflow-wrap:anywhere;word-break:break-word}${s} th{border-bottom:1.5px solid #111}${s} .pl-bordered th,${s} .pl-bordered td{border-inline-end:1px solid #111}${s} .pl-bordered th:last-child,${s} .pl-bordered td:last-child{border-inline-end:0}${s} .pl-bordered tbody td{border-bottom:1px solid #777}${s} .pl-line{display:flex;justify-content:space-between;gap:1mm;margin:0.6mm 0}${s} .pl-line span{min-width:0}`;
}

export function elementStyle(e: LayoutElement) {
  return `margin-top:${e.gapTop}mm;margin-right:${e.x}mm;width:${e.width}mm;font-family:'${e.fontFamily}',sans-serif;font-size:${e.fontSize}px;font-weight:${e.bold ? 700 : 400};text-align:${e.align};`;
}

export function buildLayoutHtml(layout: PrintLayout, content: ContentFn) {
  const l = normalize(layout); const m = l.margins;
  const body = l.elements.filter((e) => e.visible).map((e) => { const c = content(e.id, l); return c ? `<section class="pl-el${e.divider ? " pl-div" : ""}" style="${elementStyle(e)}">${c}</section>` : ""; }).join("");
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>@page{size:${l.paperWidthMm}mm auto;margin:0}html,body{margin:0;padding:0}${layoutCss(".pl-sheet")}.pl-sheet{width:${l.paperWidthMm}mm;padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;overflow:hidden}</style></head><body><div class="pl-sheet">${body}</div></body></html>`;
}
