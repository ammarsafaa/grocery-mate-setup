import { formatMoney, getReceiptDesign, getSettings } from "./db";
import type { ReceiptElement, Sale } from "./types";

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);

export function buildReceiptHtml(sale: Sale) {
  const settings = getSettings();
  const design = getReceiptDesign(settings.paperWidth);
  const block = (element: ReceiptElement) => {
    const offsetX = Math.max(-12, Math.min(12, element.offsetX ?? 0));
    const offsetY = Math.max(-12, Math.min(12, element.offsetY ?? 0));
    const style = `font-family:${element.fontFamily},sans-serif;font-size:${element.fontSize}px;font-weight:${element.bold ? 700 : 400};text-align:${element.align};margin-bottom:${element.spacing}px;${element.divider ? "border-bottom:1px dashed #111;padding-bottom:5px;" : ""}`;
    const positionStyle = `position:relative;left:${offsetX}px;top:${offsetY}px;`;
    let content = "";
    if (element.id === "logo") content = design.logo ? `<img src="${design.logo}" style="display:block;max-width:55%;max-height:80px;margin:auto" />` : "";
    if (element.id === "store") content = escapeHtml(settings.storeName);
    if (element.id === "contact") content = `${escapeHtml(design.address)}${design.address && design.phone ? "<br>" : ""}${escapeHtml(design.phone)}`;
    if (element.id === "invoice") content = `فاتورة رقم: ${sale.number}`;
    if (element.id === "date") content = new Date(sale.createdAt).toLocaleString("en-GB");
    if (element.id === "cashier") content = `الكاشير: ${escapeHtml(sale.userName)}`;
    if (element.id === "items") content = `<table class="${design.tableBorders ?? true ? "item-table-bordered" : "item-table-plain"}"><thead><tr><th>المنتج</th><th>الكمية/الوزن</th><th>سعر الوحدة</th><th>المبلغ</th></tr></thead><tbody>${sale.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.unit === "kg" ? `${item.qty.toFixed(3)} كغم` : `${item.qty} قطعة`}</td><td>${item.price.toLocaleString("en-GB")}${item.unit === "kg" ? "/كغم" : ""}</td><td>${item.total.toLocaleString("en-GB")}</td></tr>`).join("")}</tbody></table>`;
    if (element.id === "totals") content = `<div class="line"><span>الإجمالي</span><span>${formatMoney(sale.total, settings.currency)}</span></div>${sale.paid !== undefined ? `<div class="line"><span>المدفوع</span><span>${formatMoney(sale.paid, settings.currency)}</span></div><div class="line"><span>الباقي</span><span>${formatMoney(sale.change ?? 0, settings.currency)}</span></div>` : ""}`;
    if (element.id === "footer") content = escapeHtml(design.footer);
    return content ? `<section style="${style}"><div style="${positionStyle}">${content}</div></section>` : "";
  };
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>@page{size:${settings.paperWidth}mm auto;margin:0}*{box-sizing:border-box}html,body{padding:0}body{width:${settings.paperWidth - 8}mm;max-width:${settings.paperWidth - 8}mm;margin:0 auto;color:#111;background:#fff;font-family:Cairo,Arial,sans-serif;overflow:visible}section{width:100%;max-width:100%;break-inside:avoid}table{width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed}th,td{min-width:0;padding:3px 1px;text-align:right;overflow-wrap:anywhere;word-break:break-word}.item-table-bordered th{border-bottom:2px solid #111}.item-table-bordered th,.item-table-bordered td{border-inline-end:1px solid #111}.item-table-bordered th:last-child,.item-table-bordered td:last-child{border-inline-end:0}.item-table-bordered tbody td{border-bottom:1px solid #777}.line{display:flex;justify-content:space-between;gap:4px;margin:3px 0}.line span{min-width:0;overflow-wrap:anywhere}</style></head><body>${design.elements.filter((e) => e.visible).map(block).join("")}</body></html>`;
}