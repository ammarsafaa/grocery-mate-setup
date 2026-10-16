import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { native, type UpdateStatus } from "@/lib/native";
import { getOpenShift } from "@/lib/db";
import { Button } from "@/components/ui/button";

export function UpdateNotification() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => native()?.onUpdateStatus?.((s) => {
    if (["available", "downloading", "ready"].includes(s.state)) { setStatus(s); setHidden(false); }
    if (s.state === "error") setMessage(s.error ?? "تعذر إكمال التحديث؛ حاول من الإعدادات.");
  }), []);
  if (hidden || !status) return null;
  const install = () => {
    if (getOpenShift()) { setMessage("أغلق الوردية قبل تثبيت التحديث."); return; }
    native()?.installUpdate?.();
  };
  return <aside role="status" className="fixed bottom-3 right-3 z-50 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-lg">
    <RefreshCw className="h-5 w-5 text-primary" />
    <div className="text-sm font-bold">{status.state === "downloading" ? `تحميل التحديث ${status.percent ?? 0}%` : status.state === "ready" ? "التحديث جاهز" : `تحديث جديد ${status.version ?? ""}`}{message && <p className="text-destructive">{message}</p>}</div>
    {status.state === "available" && <Button size="sm" onClick={() => native()?.downloadUpdate?.()}><Download />تنزيل</Button>}
    {status.state === "ready" && <Button size="sm" onClick={install}>تثبيت وإعادة تشغيل</Button>}
    <Button variant="ghost" size="icon" aria-label="لاحقاً" title="لاحقاً" onClick={() => setHidden(true)}><X /></Button>
  </aside>;
}