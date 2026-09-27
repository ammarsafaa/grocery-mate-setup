import { getReceiptDesign, getSettings } from "./db";
import type { ReceiptElement, Sale } from "./types";

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);

export function buildReceiptHtml(sale: Sale) {
  const settings = getSettings();
  const design = getReceiptDesign(settings.paperWidth);
  const block = (element: ReceiptElement) => {
    const style = `font-family:${element.fontFamily},sans-serif;font-size:${element.fontSize}px;font-weight:${element.bold ? 700 : 400};text-align:${element.align};margin-bottom:${element.spacing}px;${element.divider ? "border-bottom:1px dashed #111;padding-bottom:5px" : ""}`;
    let content = "";
    if (element.id === "logo") content = design.logo ? `<img src="${design.logo}" style="display:block;max-width:55%;max-height:80px;margin:auto" />` : "";
    if (element.id === "store") content = escapeHtml(settings.storeName);
    if (element.id === "contact") content = `${escapeHtml(design.address)}${design.address && design.phone ? "<br>" : ""}${escapeHtml(design.phone)}`;
    if (element.id === "invoice") content = `فاتورة رقم: ${sale.number}`;
    if (element.id === "date") content = new Date(sale.createdAt).toLocaleString("ar-IQ");
    if (element.id === "cashier") content = `الكاشير: ${escapeHtml(sale.userName)}`;
    if (element.id === "items") content = `<table><thead><tr><th>الصنف</th><th>الكمية</th><th>المبلغ</th></tr></thead><tbody>${sale.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.qty}</td><td>${item.total.toLocaleString("ar-IQ")}</td></tr>`).join("")}</tbody></table>`;
    if (element.id === "totals") content = `<div class="line"><span>الإجمالي</span><span>${sale.total.toLocaleString("ar-IQ")} ${escapeHtml(settings.currency)}</span></div>${sale.paid !== undefined ? `<div class="line"><span>المدفوع</span><span>${sale.paid.toLocaleString("ar-IQ")}</span></div><div class="line"><span>الباقي</span><span>${(sale.change ?? 0).toLocaleString("ar-IQ")}</span></div>` : ""}`;
    if (element.id === "footer") content = escapeHtml(design.footer);
    return content ? `<section style="${style}">${content}</section>` : "";
  };
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>@page{size:${settings.paperWidth}mm auto;margin:2mm}*{box-sizing:border-box}body{width:${settings.paperWidth - 4}mm;margin:0;color:#111;background:#fff;font-family:Cairo,Arial,sans-serif}table{width:100%;border-collapse:collapse}th,td{padding:3px 1px;text-align:right}.line{display:flex;justify-content:space-between;margin:3px 0}</style></head><body>${design.elements.filter((e) => e.visible).map(block).join("")}</body></html>`;
}