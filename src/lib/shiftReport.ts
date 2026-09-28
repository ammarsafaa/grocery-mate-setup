import { buildLayoutHtml, getLayout, shiftContent } from "./printLayout";
import { getSales, getSettings, getShifts, saveShifts } from "./db";
import { native } from "./native";
import type { Sale, Shift } from "./types";

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const n = (v: number) => v.toLocaleString("en-GB");

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
  return buildLayoutHtml(getLayout("shift", getSettings().paperWidth), shiftContent(shift, sales));
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
