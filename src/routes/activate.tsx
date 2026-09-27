import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Copy } from "lucide-react";
import { toast } from "sonner";
import { activate, getMachineId } from "@/lib/license";

export const Route = createFileRoute("/activate")({
  head: () => ({
    meta: [
      { title: "تفعيل النظام — نظام البقالة" },
      { name: "description", content: "تفعيل ترخيص نظام البقالة على هذا الجهاز" },
      { property: "og:title", content: "تفعيل النظام — نظام البقالة" },
      { property: "og:description", content: "تفعيل ترخيص نظام البقالة على هذا الجهاز" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivatePage,
});

function ActivatePage() {
  const navigate = useNavigate();
  const [mid, setMid] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setMid(getMachineId()), []);

  const submit = async () => {
    setBusy(true);
    const ok = await activate(key);
    setBusy(false);
    if (ok) {
      toast.success("تم تفعيل النظام");
      navigate({ to: "/login" });
    } else toast.error("مفتاح التفعيل غير صحيح لهذا الجهاز");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
            <KeyRound className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">تفعيل النظام</h1>
          <p className="mt-1 text-sm text-muted-foreground">أرسل رمز الجهاز إلى صاحب النظام للحصول على مفتاح التفعيل</p>
        </div>
        <label className="mb-1 block text-sm text-muted-foreground">رمز الجهاز</label>
        <div className="mb-4 flex gap-2">
          <div dir="ltr" className="flex h-12 flex-1 items-center justify-center rounded-xl bg-secondary font-mono text-lg font-bold tracking-widest">{mid}</div>
          <button
            onClick={() => { navigator.clipboard.writeText(mid); toast.success("تم النسخ"); }}
            className="rounded-xl bg-secondary px-4"
            aria-label="نسخ"
          >
            <Copy className="h-5 w-5" />
          </button>
        </div>
        <label className="mb-1 block text-sm text-muted-foreground">مفتاح التفعيل</label>
        <textarea
          dir="ltr"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          rows={3}
          className="mb-4 w-full rounded-xl border border-border bg-secondary p-3 font-mono text-sm outline-none focus:border-primary"
        />
        <button
          disabled={busy || !key}
          onClick={submit}
          className="h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50"
        >
          تفعيل
        </button>
      </div>
    </div>
  );
}
