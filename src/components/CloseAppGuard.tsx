import { useEffect, useState } from "react";
import { StopCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { getOpenShift, getSales, formatMoney } from "@/lib/db";
import { native } from "@/lib/native";
import { buildShiftReportHtml, closeShift, printHtml, summarize } from "@/lib/shiftReport";

/** When the app window is closed, forces closing the open shift and printing the day report. */
export function CloseAppGuard() {
  const [show, setShow] = useState(false);
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const bridge = native();
    const onRequest = () => {
      if (!getOpenShift()) bridge?.quitApp?.();
      else setShow(true);
    };
    const off = bridge?.onCloseRequested?.(onRequest);
    // Browser preview: warn before leaving while a shift is open
    const before = (e: BeforeUnloadEvent) => { if (!bridge && getOpenShift()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", before);
    window.addEventListener("grocery-pos:request-close", onRequest);
    return () => { off?.(); window.removeEventListener("beforeunload", before); window.removeEventListener("grocery-pos:request-close", onRequest); };
  }, []);

  if (!show) return null;
  const open = getOpenShift();
  const r = open ? summarize(getSales().filter((s) => s.shiftId === open.id)) : null;

  const finish = async () => {
    if (!open) return native()?.quitApp?.();
    if (cash === "") { toast.error("أدخل النقد الموجود في الصندوق"); return; }
    setBusy(true);
    const { shift, sales } = closeShift(open.id, Number(cash) || 0);
    const ok = await printHtml(buildShiftReportHtml(shift, sales));
    if (!ok) toast.error("تعذرت الطباعة، تم غلق الوردية وحفظ التقرير");
    else toast.success("تم غلق الوردية وطباعة التقرير");
    window.dispatchEvent(new Event("grocery-pos:shift-closed"));
    setTimeout(() => { const q = native()?.quitApp; if (q) q(); else setShow(false); }, 800);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" dir="rtl">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h2 className="mb-2 flex items-center gap-2 text-xl font-bold"><StopCircle className="h-6 w-6 text-destructive" /> يجب غلق الوردية قبل الخروج</h2>
        <p className="mb-4 text-sm text-muted-foreground">لا يمكن إغلاق البرنامج والوردية مفتوحة. سيتم طباعة تقرير اليوم.</p>
        {open && r && (
          <div className="mb-4 space-y-1 rounded-xl bg-secondary p-3 text-sm">
            <div className="flex justify-between"><span>الكاشير</span><b>{open.userName}</b></div>
            <div className="flex justify-between"><span>عدد الفواتير</span><b>{r.count}</b></div>
            <div className="flex justify-between"><span>إجمالي المبيعات</span><b className="text-primary">{formatMoney(r.total)}</b></div>
          </div>
        )}
        <label className="mb-1 block text-sm text-muted-foreground">النقد الموجود فعلياً في الصندوق</label>
        <input autoFocus type="number" value={cash} onChange={(e) => setCash(e.target.value)} className="mb-4 h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary" />
        <button disabled={busy} onClick={finish} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-destructive font-bold text-destructive-foreground disabled:opacity-60">
          <Printer className="h-5 w-5" /> غلق الوردية وطباعة التقرير ثم الخروج
        </button>
      </div>
    </div>
  );
}
