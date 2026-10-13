// Offline "smart" product search: Arabic letter normalization, word-order independence, typo tolerance.

export function normalizeArabic(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // diacritics + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
}

function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Score one query word against one text word. 0 = no match. */
function wordScore(q: string, w: string): number {
  if (w === q) return 100;
  if (w.startsWith(q)) return 80;
  if (w.includes(q)) return 60;
  if (q.length >= 3) {
    const allowed = q.length >= 6 ? 2 : 1;
    const target = w.length > q.length ? w.slice(0, q.length) : w;
    if (distance(q, w, allowed) <= allowed || distance(q, target, allowed) <= allowed) return 35;
  }
  return 0;
}

/** Returns a relevance score for `query` across `fields`; 0 means not a match. */
export function smartScore(query: string, fields: (string | undefined)[]): number {
  const q = normalizeArabic(query);
  if (!q) return 1;
  const text = normalizeArabic(fields.filter(Boolean).join(" "));
  const words = text.split(" ").filter(Boolean);
  let total = 0;
  for (const qw of q.split(" ")) {
    let best = 0;
    for (const w of words) best = Math.max(best, wordScore(qw, w));
    if (!best) return 0;
    total += best;
  }
  if (text.startsWith(q)) total += 50;
  else if (text.includes(q)) total += 20;
  return total;
}
