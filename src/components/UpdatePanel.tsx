import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { native, type UpdateStatus } from "@/lib/native";

export function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const n = native();

  useEffect(() => {
    const nn = native();
    setVersion(nn?.appVersion?.() ?? null);
    if (!nn?.onUpdateStatus) return;
    return nn.onUpdateStatus((s) => { setStatus(s); setChecking(false); });
  }, []);

  const check = async () => {
    if (!n?.checkUpdate) return;
    setChecking(true); setStatus(null);
    const r = await n.checkUpdate();
    if (!r.ok) { setChecking(false); setStatus({ state: "error" }); }
  };

  let msg = "";
  if (checking) msg = "جارِ البحث عن تحديث...";
  else if (status?.state === "none") msg = "أنت تستخدم أحدث نسخة.";
  else if (status?.state === "available") msg = `يوجد تحديث جديد (النسخة ${status.version}).`;
  else if (status?.state === "downloading") msg = `جارِ التحميل... ${status.percent ?? 0}%`;
  else if (status?.state === "ready") msg = "تم تحميل التحديث. اضغط «تثبيت الآن» وسيُعاد تشغيل البرنامج.";
  else if (status?.state === "error") msg = "تعذّر التحديث. تأكد من اتصال الإنترنت ثم حاول مرة أخرى.";

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
        <RefreshCw className="h-5 w-5 text-primary" /> تحديث البرنامج
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        النسخة الحالية: {version ?? "معاينة المتصفح"} — يحتاج الإنترنت وقت التحديث فقط، وبياناتك لا تتأثر.
      </p>
      {!n?.checkUpdate ? (
        <p className="text-sm text-muted-foreground">هذه الميزة تعمل في نسخة Windows فقط.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {status?.state === "available" ? (
            <button onClick={() => n.downloadUpdate?.()} className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">تحميل التحديث</button>
          ) : status?.state === "ready" ? (
            <button onClick={() => n.installUpdate?.()} className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">تثبيت الآن</button>
          ) : (
            <button disabled={checking || status?.state === "downloading"} onClick={check} className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground disabled:opacity-50">البحث عن تحديث</button>
          )}
          {msg && <span className="text-sm font-semibold">{msg}</span>}
        </div>
      )}
    </section>
  );
}
