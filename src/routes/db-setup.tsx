import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Server, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSettings, saveSettings } from "@/lib/db";
import { testSqlConnection, syncNow } from "@/lib/sync";
import { native } from "@/lib/native";

export const Route = createFileRoute("/db-setup")({
  head: () => ({
    meta: [
      { title: "ربط قاعدة البيانات — Zeros" },
      { name: "description", content: "ربط نظام البقالة بخادم SQL Server وإنشاء القاعدة تلقائياً" },
      { property: "og:title", content: "ربط قاعدة البيانات — Zeros" },
      { property: "og:description", content: "إعداد الاتصال بخادم SQL Server عند أول تشغيل" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DbSetupPage,
});

function DbSetupPage() {
  const navigate = useNavigate();
  const init = getSettings();
  const [f, setF] = useState({
    sqlIsMain: init.sqlIsMain ?? true,
    sqlHost: init.sqlHost ?? "",
    sqlPort: init.sqlPort ?? 1433,
    sqlDatabase: init.sqlDatabase || "GroceryPOS",
    sqlUser: init.sqlUser || "sa",
    sqlPassword: init.sqlPassword ?? "",
    terminalCode: init.terminalCode || "1",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const connect = async () => {
    if (!native()) { toast.info("الربط متاح في نسخة الويندوز"); return; }
    if (!f.sqlIsMain && !f.sqlHost.trim()) { setError("اكتب عنوان الجهاز الرئيسي (IP)"); return; }
    setBusy(true); setError("");
    const prev = getSettings();
    saveSettings({ ...prev, ...f, sqlPort: Number(f.sqlPort) || 1433, syncEnabled: true });
    const r = await testSqlConnection();
    if (!r.ok) {
      saveSettings({ ...getSettings(), syncEnabled: !!prev.syncEnabled });
      setError(r.error || "فشل الاتصال");
      setBusy(false);
      return;
    }
    await syncNow();
    saveSettings({ ...getSettings(), sqlSetup: "done" });
    toast.success("تم إنشاء قاعدة البيانات والاتصال بنجاح");
    navigate({ to: "/login" });
  };

  const skip = () => {
    saveSettings({ ...getSettings(), sqlSetup: "skipped" });
    toast.info("تقدر تربط لاحقاً من الإعدادات ← الربط مع الخادم");
    navigate({ to: "/login" });
  };

  const fields = (
    f.sqlIsMain
      ? []
      : [
          ["sqlHost", "عنوان الجهاز الرئيسي (IP)", "192.168.1.10"],
          ["sqlPort", "المنفذ", "1433"],
        ]
  ).concat([
    ["sqlDatabase", "اسم قاعدة البيانات", "GroceryPOS"],
    ["sqlUser", "اسم المستخدم", "sa"],
    ["sqlPassword", "كلمة السر", ""],
    ["terminalCode", "رقم هذا الكاشير", "1"],
  ]) as [keyof typeof f, string, string][];

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6">
        <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold">
          <Server className="h-6 w-6 text-primary" /> ربط قاعدة البيانات
        </h1>
        <p className="mb-5 text-sm text-muted-foreground">
          اكتب معلومات خادم SQL Server. إذا القاعدة غير موجودة يتم إنشاؤها مع جداولها تلقائياً، وإذا موجودة يرتبط بها هذا الجهاز.
        </p>
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          {fields.map(([key, label, ph]) => (
            <div key={key}>
              <label className="mb-1 block text-sm text-muted-foreground">{label}</label>
              <input
                dir="ltr"
                type={key === "sqlPassword" ? "password" : key === "sqlPort" ? "number" : "text"}
                value={String(f[key] ?? "")}
                placeholder={ph}
                onChange={(e) => setF({ ...f, [key]: key === "sqlPort" ? Number(e.target.value) : e.target.value })}
                className="h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
              />
            </div>
          ))}
        </div>
        {error && <div className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={connect} className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} إنشاء القاعدة والاتصال
          </button>
          <button disabled={busy} onClick={skip} className="rounded-xl bg-secondary px-6 py-3 font-bold">تخطي والعمل بدون خادم</button>
        </div>
        <details className="mt-4 rounded-xl bg-secondary/50 p-4 text-sm leading-7">
          <summary className="cursor-pointer font-bold">تجهيز الجهاز الرئيسي (مرة واحدة)</summary>
          <ol className="mt-2 list-decimal pr-5">
            <li>نصّب SQL Server Express واختر وضع الدخول المختلط (Mixed) وحدد كلمة مرور للمستخدم sa.</li>
            <li>من SQL Server Configuration Manager فعّل TCP/IP والمنفذ 1433 وأعد تشغيل الخدمة.</li>
            <li>اسمح بالمنفذ 1433 في جدار حماية ويندوز.</li>
            <li>اجعل رقم الكاشير مختلفاً لكل جهاز (1، 2، 3...).</li>
          </ol>
        </details>
      </div>
    </div>
  );
}
