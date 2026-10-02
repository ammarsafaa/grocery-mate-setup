import { formatMoney, getExpenses, getSettings } from "./db";
import { summarize } from "./shiftReport";
import type { Sale, Shift } from "./types";

const QUEUE_KEY = "grocery-pos:telegram-queue";

function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
const t = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-GB") : "—");

export function buildTelegramReport(shift: Shift, sales: Sale[]): string {
  const st = getSettings();
  const r = summarize(sales);
  const day = (shift.closedAt ?? new Date().toISOString()).slice(0, 10);
  const exp = getExpenses().filter((e) => e.createdAt.slice(0, 10) === day);
  const expTotal = exp.reduce((a, e) => a + e.amount, 0);
  const expected = shift.openingCash + r.total;
  const diff = (shift.closingCash ?? 0) - expected;
  const lines = [
    `🧾 <b>تقرير غلق الوردية — ${esc(st.storeName || "زيروس")}</b>`,
    `👤 الكاشير: ${esc(shift.userName)}`,
    `🕐 الفتح: ${t(shift.openedAt)}`,
    `🕔 الغلق: ${t(shift.closedAt)}`,
    "",
    `📄 عدد الفواتير: <b>${r.count}</b>`,
    `💰 إجمالي المبيعات: <b>${formatMoney(r.total)}</b>`,
    `📊 متوسط الفاتورة: ${formatMoney(r.avg)}`,
    `⬆️ أعلى فاتورة: ${formatMoney(r.max)}`,
    "",
    `💵 نقد الافتتاح: ${formatMoney(shift.openingCash)}`,
    `🧮 المتوقع في الصندوق: ${formatMoney(expected)}`,
    `✅ النقد الفعلي: ${formatMoney(shift.closingCash ?? 0)}`,
    `${diff === 0 ? "⚖️" : diff > 0 ? "➕" : "➖"} الفرق: ${formatMoney(diff)}`,
  ];
  if (r.products.length) {
    lines.push("", "<b>المنتجات المباعة (من الأكثر إلى الأقل):</b>");
    r.products.forEach((p, i) => lines.push(`${i + 1}. ${esc(p.name)} — ${p.unit === "kg" ? p.qty.toFixed(3) + " كغم" : p.qty + " قطعة"} — ${formatMoney(p.total)}`));
  }
  lines.push("", `<b>مصاريف اليوم:</b> ${formatMoney(expTotal)}`);
  exp.forEach((e) => lines.push(`• ${esc(e.title)} (${esc(e.category)}) — ${formatMoney(e.amount)}`));
  lines.push(`<b>الصافي (مبيعات الوردية − مصاريف اليوم):</b> ${formatMoney(r.total - expTotal)}`);
  return lines.join("\n").slice(0, 4000);
}

function chatIds() { return (getSettings().telegramChatIds ?? "").split(/[,\s]+/).filter(Boolean); }

export async function sendTelegram(text: string): Promise<{ ok: boolean; error?: string }> {
  const st = getSettings();
  const token = st.telegramToken?.trim();
  const ids = chatIds();
  if (!token || !ids.length) return { ok: false, error: "أدخل رمز البوت ورقم المحادثة" };
  try {
    for (const chat_id of ids) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text, parse_mode: "HTML" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) return { ok: false, error: j.description || `خطأ ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "لا يوجد اتصال بالإنترنت" };
  }
}

function readQueue(): string[] { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } }
function writeQueue(q: string[]) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

/** Sends pending reports saved while offline. */
export async function flushTelegramQueue() {
  const q = readQueue();
  if (!q.length) return;
  const left: string[] = [];
  for (const m of q) if (!(await sendTelegram(m)).ok) left.push(m);
  writeQueue(left);
}

/** Sends the shift report if enabled; queues it when offline. Never throws. */
export async function sendShiftReportTelegram(shift: Shift, sales: Sale[]): Promise<boolean> {
  const st = getSettings();
  if (!st.telegramEnabled) return true;
  const text = buildTelegramReport(shift, sales);
  const r = await sendTelegram(text);
  if (!r.ok) writeQueue([...readQueue(), text]);
  return r.ok;
}

let started = false;
export function startTelegramQueue() {
  if (started || typeof window === "undefined") return;
  started = true;
  flushTelegramQueue();
  window.addEventListener("online", () => flushTelegramQueue());
  setInterval(() => flushTelegramQueue(), 5 * 60 * 1000);
}
