import { native } from "@/lib/native";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Copy } from "lucide-react";
import { toast } from "sonner";
import { generateKey } from "@/lib/license";

export const Route = createFileRoute("/license-generator")({
  head: () => ({
    meta: [
      { title: "مولّد التراخيص — نظام البقالة" },
      { name: "description", content: "أداة صاحب النظام لإصدار مفاتيح التفعيل" },
      { property: "og:title", content: "مولّد التراخيص — نظام البقالة" },
      { property: "og:description", content: "أداة صاحب النظام لإصدار مفاتيح التفعيل" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GeneratorPage,
});

function GeneratorPage() {
  const [priv, setPriv] = useState("");
  const [mid, setMid] = useState("");
  const [out, setOut] = useState("");
  if (native()) return null;

  const run = async () => {
    try {
      setOut(await generateKey(priv, mid));
    } catch {
      toast.error("المفتاح الخاص غير صالح");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 shadow-2xl">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="h-6 w-6 text-primary" /> مولّد التراخيص
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">لصاحب النظام فقط. المفتاح الخاص لا يُحفظ في أي مكان.</p>
        <label className="mb-1 block text-sm text-muted-foreground">المفتاح الخاص</label>
        <textarea dir="ltr" rows={3} value={priv} onChange={(e) => setPriv(e.target.value)}
          className="mb-4 w-full rounded-xl border border-border bg-secondary p-3 font-mono text-xs outline-none focus:border-primary" />
        <label className="mb-1 block text-sm text-muted-foreground">رمز جهاز العميل</label>
        <input dir="ltr" value={mid} onChange={(e) => setMid(e.target.value)} placeholder="XXXX-XXXX-XXXX"
          className="mb-4 h-12 w-full rounded-xl border border-border bg-secondary px-4 font-mono outline-none focus:border-primary" />
        <button onClick={run} disabled={!priv || !mid}
          className="mb-4 h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50">
          إصدار مفتاح التفعيل
        </button>
        {out && (
          <div className="flex gap-2">
            <div dir="ltr" className="flex-1 break-all rounded-xl bg-secondary p-3 font-mono text-xs">{out}</div>
            <button onClick={() => { navigator.clipboard.writeText(out); toast.success("تم النسخ"); }}
              className="rounded-xl bg-secondary px-4" aria-label="نسخ"><Copy className="h-5 w-5" /></button>
          </div>
        )}
      </div>
    </div>
  );
}
