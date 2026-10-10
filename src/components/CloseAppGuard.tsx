import { useEffect, useState } from "react";
import { StopCircle, Printer, DatabaseBackup, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getOpenShift, getSales, formatMoney, getSettings, saveSettings } from "@/lib/db";
import { native } from "@/lib/native";
import { buildShiftReportHtml, closeShift, printHtml, summarize } from "@/lib/shiftReport";

type Stage = "hidden" | "shift" | "backup" | "failed";

/** On app close: forces closing the open shift (with report), then a mandatory database backup. */
export function CloseAppGuard() {
  const [stage, setStage] = useState<Stage>("hidden");
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const quit = () => { const q = native()?.quitApp; if (q) q(); else setStage("hidden"); };

  const runBackup = async () => {
    const bridge = native();
    if (!bridge?.backupDb) return quit();
    setStage("backup"); setError("");
    try {
      const s = getSettings();
      const r = await bridge.backupDb(s.backupFolder || "");
      if (r.ok) {
        saveSettings({ ...getSettings(), lastBackupAt: new Date().toISOString() });
        toast.success("تم أخذ النسخة الاحتياطية");
        setTimeout(quit, 500);
      } else { setError(r.error || "خطأ غير معروف"); setStage("failed"); }
    } catch (e) { setError(String(e)); setStage("failed"); }
  };

  useEffect(() => {
    const bridge = native();
    const onRequest = () => {
      if (getOpenShift()) setStage("shift");
      else if (bridge) void runBackup();
    };
    const off = bridge?.onCloseRequested?.(onRequest);
    const before = (e: BeforeUnloadEvent) => { if (!bridge && getOpenShift()) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", before);
    window.addEventListener("grocery-pos:request-close", onRequest);
    return () => { off?.(); window.removeEventListener("beforeunload", before); window.removeEventListener("grocery-pos:request-close", onRequest); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stage === "hidden") return null;
  const open = getOpenShift();
  const r = open ? summarize(getSales().filter((s) => s.shiftId === open.id)) : null;

  const finishShift = async () => {
    if (!open) return runBackup();
    if (cash === "") { toast.error("أدخل النقد الموجود في الصندوق"); return; }
    setBusy(true);
    const { shift, sales } = closeShift(open.id, Number(cash) || 0);
    const ok = await printHtml(buildShiftReportHtml(shift, sales));
    if (!ok) toast.error("تعذرت الطباعة، تم غلق الوردية وحفظ التقرير");
    else toast.success("تم غلق الوردية وطباعة التقرير");
    window.dispatchEvent(new Event("grocery-pos:shift-closed"));
    setBusy(false);
    if (native()) await runBackup(); else setStage("hidden");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" dir="rtl">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        {stage === "shift" && (
          <>
            <h2 className="mb-2 flex items-center gap-2 text-xl font-bold"><StopCircle className="h-6 w-6 text-destructive" /> يجب غلق الوردية قبل الخروج</h2>
            <p className="mb-4 text-sm text-muted-foreground">سيتم طباعة تقرير اليوم ثم أخذ نسخة احتياطية.</p>
            {open && r && (
              <div className="mb-4 space-y-1 rounded-xl bg-secondary p-3 text-sm">
                <div className="flex justify-between"><span>الكاشير</span><b>{open.userName}</b></div>
                <div className="flex justify-between"><span>عدد الفواتير</span><b>{r.count}</b></div>
                <div className="flex justify-between"><span>إجمالي المبيعات</span><b className="text-primary">{formatMoney(r.total)}</b></div>
              </div>
            )}
            <label className="mb-1 block text-sm text-muted-foreground">النقد الموجود فعلياً في الصندوق</label>
            <input autoFocus type="number" value={cash} onChange={(e) => setCash(e.target.value)} className="mb-4 h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary" />
            <button disabled={busy} onClick={finishShift} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-destructive font-bold text-destructive-foreground disabled:opacity-60">
              <Printer className="h-5 w-5" /> غلق الوردية والطباعة والنسخ ثم الخروج
            </button>
          </>
        )}
        {stage === "backup" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <DatabaseBackup className="h-10 w-10 animate-pulse text-primary" />
            <h2 className="text-xl font-bold">جاري أخذ نسخة احتياطية...</h2>
            <p className="text-sm text-muted-foreground">لا تطفئ الجهاز، البرنامج سينغلق تلقائياً بعد الانتهاء.</p>
          </div>
        )}
        {stage === "failed" && (
          <>
            <h2 className="mb-2 flex items-center gap-2 text-xl font-bold"><AlertTriangle className="h-6 w-6 text-destructive" /> فشل أخذ النسخة الاحتياطية</h2>
            <p className="mb-2 text-sm text-muted-foreground">تأكد أن مجلد النسخ موجود أو أن الفلاش موصول.</p>
            <p className="mb-4 break-all rounded-lg bg-secondary p-2 text-xs text-muted-foreground" dir="ltr">{error}</p>
            <div className="flex gap-2">
              <button onClick={() => void runBackup()} className="h-12 flex-1 rounded-xl bg-primary font-bold text-primary-foreground">إعادة المحاولة</button>
              <button onClick={quit} className="h-12 flex-1 rounded-xl border border-destructive font-bold text-destructive">الخروج بدون نسخة</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
