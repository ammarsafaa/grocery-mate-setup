import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImageIcon, Printer, RotateCcw, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/lib/auth";
import { getReceiptDesign, getSettings, saveReceiptDesign } from "@/lib/db";
import { FONTS, buildLayoutHtml, clamp, elementStyle, getLayout, layoutCss, normalize, printableWidth, receiptContent, resetLayout, saveLayout, shiftContent, snap, type LayoutElement, type LayoutKind, type PrintLayout } from "@/lib/printLayout";
import { printHtml } from "@/lib/shiftReport";
import type { ReceiptDesign, Sale, Shift } from "@/lib/types";

export const Route = createFileRoute("/receipt-designer")({
  head: () => ({ meta: [
    { title: "مصمم الفاتورة والتقرير — نظام البقالة" }, { name: "description", content: "تصميم فاتورة البيع وتقرير الوردية بالسحب والقياسات بالملم" },
    { property: "og:title", content: "مصمم الفاتورة والتقرير — نظام البقالة" }, { property: "og:description", content: "تصميم فاتورة البيع وتقرير الوردية بالسحب والقياسات بالملم" },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: Designer,
});

const PX_MM = 3.78; const ZOOM = 1.6;
const now = new Date().toISOString();
const SAMPLE_SALE: Sale = { id: "s", number: 125, shiftId: "x", userId: "u", userName: "المدير", items: [{ productId: "a", name: "طماطة", unit: "kg", price: 1500, qty: 1.175, total: 1750 }, { productId: "b", name: "حليب", unit: "piece", price: 1500, qty: 2, total: 3000 }], total: 4750, paid: 5000, change: 250, createdAt: now };
const SAMPLE_SHIFT = { id: "x", userId: "u", userName: "المدير", openedAt: now, closedAt: now, openingCash: 10000, closingCash: 14750 } as Shift;

function Designer() {
  const { user, ready } = useAuth(); const navigate = useNavigate(); const settings = getSettings();
  const [kind, setKind] = useState<LayoutKind>("receipt"); const [slot, setSlot] = useState<58 | 80>(settings.paperWidth);
  const [layout, setLayoutState] = useState<PrintLayout>(() => getLayout("receipt", settings.paperWidth));
  const [info, setInfo] = useState<ReceiptDesign>(() => getReceiptDesign(settings.paperWidth));
  const [selected, setSelected] = useState("store"); const history = useRef<PrintLayout[]>([]);
  const drag = useRef<{ mode: "move" | "resize"; id: string; sx: number; sy: number; start: LayoutElement; pushed: boolean } | null>(null);
  useEffect(() => { if (ready && (!user || user.role !== "admin")) navigate({ to: user ? "/" : "/login" }); }, [ready, user, navigate]);

  const setLayout = (next: PrintLayout, record = true) => { if (record) history.current = [...history.current.slice(-49), layout]; setLayoutState(normalize(next)); };
  const load = (k: LayoutKind, s: 58 | 80) => { setKind(k); setSlot(s); history.current = []; setLayoutState(getLayout(k, s)); setInfo(getReceiptDesign(s)); };
  const content = useMemo(() => kind === "receipt" ? receiptContent(SAMPLE_SALE, info) : shiftContent(SAMPLE_SHIFT, [SAMPLE_SALE]), [kind, info]);
  if (!ready || !user || user.role !== "admin") return null;

  const W = printableWidth(layout); const active = layout.elements.find((e) => e.id === selected);
  const update = (patch: Partial<LayoutElement>, id = selected) => setLayout({ ...layout, elements: layout.elements.map((e) => e.id === id ? { ...e, ...patch } : e) });
  const move = (dir: -1 | 1) => { const i = layout.elements.findIndex((e) => e.id === selected); const j = i + dir; if (j < 0 || j >= layout.elements.length) return; const els = [...layout.elements]; [els[i], els[j]] = [els[j]!, els[i]!]; setLayout({ ...layout, elements: els }); };
  const undo = () => { const prev = history.current.pop(); if (prev) setLayoutState(prev); else toast.info("لا يوجد شيء للتراجع عنه"); };
  const save = () => { saveLayout(layout); if (kind === "receipt") saveReceiptDesign({ ...info, paperWidth: slot }); toast.success("تم حفظ التصميم"); };
  const testPrint = async () => { const html = buildLayoutHtml(layout, content); if (await printHtml(html)) toast.success("تم إرسال الطباعة التجريبية"); else toast.error("تعذرت الطباعة"); };

  const onPointerDown = (e: React.PointerEvent, id: string, mode: "move" | "resize") => {
    const start = layout.elements.find((x) => x.id === id); if (!start) return;
    e.stopPropagation(); e.preventDefault(); setSelected(id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, id, sx: e.clientX, sy: e.clientY, start, pushed: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.sx) / (PX_MM * ZOOM); const dy = (e.clientY - d.sy) / (PX_MM * ZOOM);
    if (!d.pushed) { if (Math.abs(dx) + Math.abs(dy) < 0.5) return; history.current = [...history.current.slice(-49), layout]; d.pushed = true; }
    const s = d.start;
    const patch = d.mode === "move" ? { x: clamp(snap(s.x - dx), 0, W - s.width), gapTop: snap(s.gapTop + dy) } : { width: clamp(snap(s.width - dx), 8, W - s.x) };
    setLayoutState((cur) => normalize({ ...cur, elements: cur.elements.map((x) => x.id === d.id ? { ...x, ...patch } : x) }));
  };
  const onPointerUp = () => { drag.current = null; };
  const m = layout.margins;

  return <AppLayout><div className="p-4 lg:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">مصمم الفاتورة والتقرير</h1><p className="text-sm text-muted-foreground">اسحب العنصر لتحريكه، واسحب المقبض الأيسر لتغيير عرضه. ما تراه هنا هو ما يُطبع.</p></div>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={undo}><Undo2 className="h-4 w-4"/>تراجع</Btn>
        <Btn onClick={() => { if (!confirm("إرجاع التصميم الافتراضي؟")) return; setLayout(resetLayout(kind, slot)); toast.info("تم إرجاع الوضع الافتراضي"); }}><RotateCcw className="h-4 w-4"/>افتراضي</Btn>
        <Btn onClick={testPrint}><Printer className="h-4 w-4"/>طباعة تجريبية</Btn>
        <button onClick={save} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground"><Save className="h-4 w-4"/>حفظ</button>
      </div>
    </div>

    <div className="mb-4 flex flex-wrap gap-2">
      {([["receipt", "فاتورة البيع"], ["shift", "تقرير إغلاق الوردية"]] as const).map(([k, l]) => <button key={k} onClick={() => load(k, slot)} className={`rounded-lg px-4 py-2 font-bold ${kind === k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{l}</button>)}
      <span className="mx-2 self-center text-sm text-muted-foreground">تصميم لطابعة:</span>
      {([58, 80] as const).map((w) => <button key={w} onClick={() => load(kind, w)} className={`rounded-lg px-4 py-2 font-bold ${slot === w ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{w} ملم</button>)}
    </div>

    <div className="grid gap-4 xl:grid-cols-[240px_1fr_300px]">
      <aside className="rounded-lg border border-border bg-card p-3">
        <h2 className="mb-2 font-bold">العناصر</h2>
        <div className="space-y-1.5">{layout.elements.map((e) => <div key={e.id} className={`flex items-center gap-1 rounded-lg border p-2 ${selected === e.id ? "border-primary bg-primary/10" : "border-border bg-secondary"}`}>
          <button className="flex-1 text-right text-sm" onClick={() => setSelected(e.id)}>{e.label}</button>
          <button title={e.visible ? "إخفاء" : "إظهار"} onClick={() => update({ visible: !e.visible }, e.id)} className="rounded p-1 hover:bg-accent">{e.visible ? <Eye className="h-4 w-4"/> : <EyeOff className="h-4 w-4 text-muted-foreground"/>}</button>
        </div>)}</div>
        <div className="mt-3 grid grid-cols-2 gap-2"><Btn onClick={() => move(-1)}><ArrowUp className="h-4 w-4"/>للأعلى</Btn><Btn onClick={() => move(1)}><ArrowDown className="h-4 w-4"/>للأسفل</Btn></div>
      </aside>

      <main className="overflow-auto rounded-lg border border-border bg-secondary p-6" onPointerDown={() => setSelected("")}>
        <style>{layoutCss(".pl-sheet")}</style>
        <div className="mx-auto w-fit" style={{ zoom: ZOOM }}>
          <Ruler widthMm={layout.paperWidthMm}/>
          <div className="pl-sheet relative shadow-lg" style={{ width: `${layout.paperWidthMm}mm`, minHeight: "90mm", padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm` }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <div className="pointer-events-none absolute inset-y-0 border-x border-dashed border-destructive/40" style={{ right: `${m.right}mm`, left: `${m.left}mm` }}/>
            {layout.elements.filter((e) => e.visible).map((e) => {
              const html = content(e.id, layout) || `<span style="color:#999">${e.label}</span>`;
              const sel = selected === e.id;
              return <section key={e.id} className={`pl-el relative touch-none cursor-move outline-dashed outline-1 ${sel ? "outline-primary" : "outline-transparent hover:outline-primary/40"}${e.divider ? " pl-div" : ""}`} style={cssText(elementStyle(e))} onPointerDown={(ev) => onPointerDown(ev, e.id, "move")}>
                <div dangerouslySetInnerHTML={{ __html: html }}/>
                {sel && <span title="اسحب لتغيير العرض" onPointerDown={(ev) => onPointerDown(ev, e.id, "resize")} className="absolute -left-1 top-1/2 h-4 w-2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-primary"/>}
              </section>;
            })}
          </div>
        </div>
      </main>

      <aside className="space-y-4 rounded-lg border border-border bg-card p-3">
        <div><h2 className="mb-2 font-bold">الورقة (ملم)</h2>
          <div className="grid grid-cols-2 gap-2">
            <Num label="عرض الورقة" value={layout.paperWidthMm} onChange={(v) => setLayout({ ...layout, paperWidthMm: v })}/>
            <Num label="الهامش العلوي" value={m.top} onChange={(v) => setLayout({ ...layout, margins: { ...m, top: v } })}/>
            <Num label="الهامش الأيمن" value={m.right} onChange={(v) => setLayout({ ...layout, margins: { ...m, right: v } })}/>
            <Num label="الهامش الأيسر" value={m.left} onChange={(v) => setLayout({ ...layout, margins: { ...m, left: v } })}/>
            <Num label="الهامش السفلي" value={m.bottom} onChange={(v) => setLayout({ ...layout, margins: { ...m, bottom: v } })}/>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">أقل هامش يمين/يسار 4 ملم حتى لا ينقص الكلام. مساحة الطباعة: {W} ملم</p>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={layout.tableBorders} onChange={(e) => setLayout({ ...layout, tableBorders: e.target.checked })}/>خطوط الجدول</label>
        </div>
        {active && <div className="border-t border-border pt-3"><h2 className="mb-2 font-bold">{active.label}</h2>
          <div className="grid grid-cols-2 gap-2">
            <Num label="من اليمين" value={active.x} onChange={(v) => update({ x: v })}/>
            <Num label="المسافة من الأعلى" value={active.gapTop} onChange={(v) => update({ gapTop: v })}/>
            <Num label="العرض" value={active.width} onChange={(v) => update({ width: v })}/>
            <Num label="حجم الخط" value={active.fontSize} step={1} onChange={(v) => update({ fontSize: v })}/>
          </div>
          <button onClick={() => update({ x: 0, width: W })} className="mt-2 w-full rounded-lg bg-secondary py-1.5 text-sm">ملء كامل العرض</button>
          <label className="mt-3 block text-sm"><span className="text-muted-foreground">نوع الخط</span><select value={active.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })} className="mt-1 h-9 w-full rounded-lg bg-secondary px-2">{FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
          <div className="mt-3 grid grid-cols-3 gap-1">{([["right", "يمين"], ["center", "وسط"], ["left", "يسار"]] as const).map(([a, l]) => <button key={a} onClick={() => update({ align: a })} className={`rounded-lg py-1.5 text-sm ${active.align === a ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{l}</button>)}</div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={active.bold} onChange={(e) => update({ bold: e.target.checked })}/>عريض</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={active.divider} onChange={(e) => update({ divider: e.target.checked })}/>خط فاصل</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={active.visible} onChange={(e) => update({ visible: e.target.checked })}/>ظاهر</label>
          </div>
        </div>}
        {kind === "receipt" && <div className="space-y-2 border-t border-border pt-3"><h2 className="font-bold">معلومات الفاتورة</h2>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-secondary p-2 text-sm"><ImageIcon className="h-4 w-4"/>رفع الشعار<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setInfo({ ...info, logo: String(r.result) }); r.readAsDataURL(f); }}/></label>
          <Text label="العنوان" value={info.address} onChange={(v) => setInfo({ ...info, address: v })}/>
          <Text label="الهاتف" value={info.phone} onChange={(v) => setInfo({ ...info, phone: v })}/>
          <Text label="الرسالة الختامية" value={info.footer} onChange={(v) => setInfo({ ...info, footer: v })}/>
        </div>}
      </aside>
    </div>
  </div></AppLayout>;
}

function cssText(s: string): React.CSSProperties {
  const o: Record<string, string> = {};
  for (const part of s.split(";")) { const i = part.indexOf(":"); if (i < 0) continue; const k = part.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()); o[k] = part.slice(i + 1).trim(); }
  return o as React.CSSProperties;
}
function Ruler({ widthMm }: { widthMm: number }) {
  const ticks = Array.from({ length: Math.floor(widthMm) + 1 }, (_, i) => i);
  return <div className="relative h-4 bg-card text-[5px] text-muted-foreground" style={{ width: `${widthMm}mm` }} dir="ltr">{ticks.map((i) => <span key={i} className="absolute bottom-0 border-l border-muted-foreground" style={{ left: `${i}mm`, height: i % 10 === 0 ? 8 : i % 5 === 0 ? 5 : 3 }}>{i % 10 === 0 && <span className="absolute -top-2 left-0.5">{i}</span>}</span>)}</div>;
}
function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} className="flex items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm">{children}</button>; }
function Num({ label, value, onChange, step = 0.5 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return <label className="block text-xs"><span className="text-muted-foreground">{label}</span><input type="number" step={step} value={value} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} className="mt-0.5 h-9 w-full rounded-lg bg-secondary px-2 text-sm" dir="ltr"/></label>;
}
function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="block text-xs"><span className="text-muted-foreground">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} className="mt-0.5 h-9 w-full rounded-lg bg-secondary px-2 text-sm"/></label>;
}
