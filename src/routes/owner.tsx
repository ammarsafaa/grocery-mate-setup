import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Copy, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { issueLicense, ownerLogin, ownerLogout, ownerStatus } from "@/lib/owner.functions";
import zerosLogo from "@/assets/zeros-logo.png";

export const Route = createFileRoute("/owner")({
  head: () => ({
    meta: [
      { title: "لوحة التراخيص — زيروس" },
      { name: "description", content: "لوحة صاحب النظام لإصدار مفاتيح تفعيل زيروس" },
      { property: "og:title", content: "لوحة التراخيص — زيروس" },
      { property: "og:description", content: "لوحة صاحب النظام لإصدار مفاتيح تفعيل زيروس" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerPage,
});

const ERR: Record<string, string> = {
  locked: "انتهت الجلسة، سجّل الدخول مجدداً",
  "no-key": "المفتاح الخاص غير مضاف بعد",
  "bad-key": "المفتاح الخاص المحفوظ غير صالح",
};

function OwnerPage() {
  const status = useServerFn(ownerStatus);
  const login = useServerFn(ownerLogin);
  const logout = useServerFn(ownerLogout);
  const issue = useServerFn(issueLicense);
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [mid, setMid] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { status().then((r) => setUnlocked(r.unlocked)).catch(() => setUnlocked(false)); }, [status]);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await login({ data: { password: pw } }).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) { setUnlocked(true); setPw(""); } else toast.error("كلمة السر غير صحيحة");
  };

  const doIssue = async () => {
    setBusy(true); setOut("");
    try {
      const r = await issue({ data: { machineId: mid } });
      if (r.ok) setOut(r.key);
      else { toast.error(ERR[r.error] ?? "حدث خطأ"); if (r.error === "locked") setUnlocked(false); }
    } catch { toast.error("رمز الجهاز غير صحيح، يجب أن يكون مثل XXXX-XXXX-XXXX"); }
    setBusy(false);
  };

  const box = "w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary";

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <img src={zerosLogo} alt="شعار زيروس" className="mx-auto mb-3 h-20 w-20 object-contain" />
          <h1 className="flex items-center justify-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6 text-primary" /> لوحة التراخيص
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">لصاحب النظام فقط</p>
        </div>

        {unlocked === null && <p className="text-center text-muted-foreground">جاري التحميل…</p>}

        {unlocked === false && (
          <form onSubmit={doLogin}>
            <label className="mb-1 block text-sm text-muted-foreground">كلمة السر</label>
            <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} className={`${box} mb-4 h-12`} />
            <button disabled={busy || !pw} className="h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50">دخول</button>
          </form>
        )}

        {unlocked && (
          <>
            <label className="mb-1 block text-sm text-muted-foreground">رمز جهاز العميل</label>
            <input dir="ltr" value={mid} onChange={(e) => setMid(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" className={`${box} mb-4 h-12 font-mono text-center tracking-widest`} />
            <button onClick={doIssue} disabled={busy || !mid} className="mb-4 h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50">
              إصدار مفتاح التفعيل
            </button>
            {out && (
              <div className="mb-4 flex gap-2">
                <div dir="ltr" className="flex-1 break-all rounded-xl bg-secondary p-3 font-mono text-xs">{out}</div>
                <button onClick={() => { navigator.clipboard.writeText(out); toast.success("تم النسخ"); }} className="rounded-xl bg-secondary px-4" aria-label="نسخ">
                  <Copy className="h-5 w-5" />
                </button>
              </div>
            )}
            <button onClick={async () => { await logout(); setUnlocked(false); setOut(""); }} className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <LogOut className="h-4 w-4" /> تسجيل الخروج
            </button>
          </>
        )}
      </div>
    </div>
  );
}
