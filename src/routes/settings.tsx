import { native } from "@/lib/native";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, Upload, Plus, Trash2, Scale, HardDrive, Palette, Printer, Layers3, ReceiptText, Server } from "lucide-react";
import { testSqlConnection, syncNow, getSyncStatus } from "@/lib/sync";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { UpdatePanel } from "@/components/UpdatePanel";
import {
  getSettings,
  saveSettings,
  getUsers,
  saveUsers,
  exportBackup,
  resetAllData,
  importBackup,
  uid,
} from "@/lib/db";
import type { PosUser, Settings } from "@/lib/types";
import { applyTheme } from "@/lib/theme";
import { buildReceiptHtml } from "@/lib/receipt";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — نظام البقالة" },
      { name: "description", content: "إعدادات المتجر والميزان والنسخ الاحتياطي والمستخدمين" },
      { property: "og:title", content: "الإعدادات — نظام البقالة" },
      { property: "og:description", content: "إعدادات المتجر والميزان والطباعة والنسخ الاحتياطي والمستخدمين" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>(getSettings());
  const [users, setUsers] = useState<PosUser[]>([]);
  const [newUser, setNewUser] = useState({ name: "", pin: "", role: "cashier" as const });
  const fileRef = useRef<HTMLInputElement>(null);
  const [printers, setPrinters] = useState<Array<{ name: string; displayName?: string; isDefault?: boolean }>>([]);
  const [scaleTest, setScaleTest] = useState("");
  const [comPorts, setComPorts] = useState<string[]>([]);

  useEffect(() => {
    const n = native();
    if (n) n.listSerialPorts().then(setComPorts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user) navigate({ to: "/login" });
    else if (user.role !== "admin") navigate({ to: "/" });
  }, [user, ready, navigate]);

  useEffect(() => setUsers(getUsers()), []);
  useEffect(() => { const n = native(); if (n) n.listPrinters().then(setPrinters).catch(() => setPrinters([])); }, []);

  if (!ready || !user || user.role !== "admin") return null;

  const save = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
    applyTheme(s);
    toast.success("تم حفظ الإعدادات");
  };

  const downloadBackup = () => {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("تم تنزيل النسخة الاحتياطية");
  };

  const restore = async (file: File) => {
    const text = await file.text();
    if (importBackup(text)) {
      toast.success("تم استرجاع النسخة الاحتياطية");
      setUsers(getUsers());
      setSettings(getSettings());
    } else {
      toast.error("ملف غير صالح");
    }
  };

  const addUser = () => {
    if (!newUser.name || !/^\d{4,8}$/.test(newUser.pin)) {
      toast.error("الرقم السري يجب أن يكون من 4 إلى 8 أرقام");
      return;
    }
    if (users.some((u) => u.pin === newUser.pin)) {
      toast.error("هذا الرقم السري مستخدم مسبقاً");
      return;
    }
    const next = [...users, { id: uid(), ...newUser, active: true }];
    saveUsers(next);
    setUsers(next);
    setNewUser({ name: "", pin: "", role: "cashier" });
    toast.success("تمت إضافة المستخدم");
  };

  const removeUser = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (u?.role === "admin") {
      toast.error("لا يمكن حذف المدير");
      return;
    }
    const next = users.filter((x) => x.id !== id);
    saveUsers(next);
    setUsers(next);
  };

  const testPrint = async () => {
    const n = native();
    if (!n) { toast.info("الطباعة التجريبية متاحة في نسخة Windows"); return; }
    const now = new Date().toISOString();
    const html = buildReceiptHtml({ id: "test", number: 1, shiftId: "test", userId: user.id, userName: user.name, items: [{ productId: "test", name: "منتج تجريبي", unit: "piece", price: 1000, qty: 1, total: 1000 }], total: 1000, paid: 1000, change: 0, createdAt: now });
    const result = await n.printReceipt(html, settings.printerName, 1);
    if (result.ok) toast.success("تم إرسال الفاتورة التجريبية للطابعة"); else toast.error("تعذرت الطباعة التجريبية");
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">الإعدادات</h1>

        {/* Store */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-bold">المتجر</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">اسم المتجر</label>
              <input
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                className="h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">العملة</label>
              <input
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                className="h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
              />
            </div>
          </div>
          <button
            onClick={() => save(settings)}
            className="mt-4 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground"
          >
            حفظ
          </button>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Layers3 className="h-5 w-5 text-primary"/>عرض المجموعات</h2>
          <label className="flex items-center justify-between gap-4 rounded-lg bg-secondary p-4"><div><div className="font-bold">عرض المجموعات أولاً في نقطة البيع</div><div className="text-sm text-muted-foreground">عند تعطيله تظهر جميع المنتجات مباشرة</div></div><input type="checkbox" checked={settings.useProductGroups} onChange={(e) => setSettings({ ...settings, useProductGroups: e.target.checked })} className="h-5 w-5 accent-primary"/></label>
          <div className="mt-4 flex gap-2"><button onClick={() => save(settings)} className="rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground">حفظ</button><Link to="/groups" className="rounded-lg bg-secondary px-6 py-3 font-bold">إدارة المجموعات</Link></div>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Palette className="h-5 w-5 text-primary"/>ألوان النظام وخط المنتجات</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="mb-1 block text-sm text-muted-foreground">نظام الألوان</label><select value={settings.colorPreset} onChange={(e) => setSettings({ ...settings, colorPreset: e.target.value as Settings["colorPreset"] })} className="h-12 w-full rounded-lg border border-border bg-secondary px-4"><option value="emerald">أخضر</option><option value="blue">أزرق</option><option value="red">أحمر</option><option value="amber">ذهبي</option><option value="custom">لون مخصص</option></select></div>
            <div><label className="mb-1 block text-sm text-muted-foreground">المظهر</label><select value={settings.colorMode} onChange={(e) => setSettings({ ...settings, colorMode: e.target.value as Settings["colorMode"] })} className="h-12 w-full rounded-lg border border-border bg-secondary px-4"><option value="dark">داكن</option><option value="light">فاتح</option></select></div>
            {settings.colorPreset === "custom" && <div><label className="mb-1 block text-sm text-muted-foreground">اللون المخصص</label><input type="color" value={settings.customColor} onChange={(e) => setSettings({ ...settings, customColor: e.target.value })} className="h-12 w-full rounded-lg border border-border bg-secondary p-2"/></div>}
            <div><label className="mb-1 block text-sm text-muted-foreground">خط أسماء المنتجات</label><select value={settings.productFont} onChange={(e) => setSettings({ ...settings, productFont: e.target.value as Settings["productFont"] })} className="h-12 w-full rounded-lg border border-border bg-secondary px-4"><option>Cairo</option><option>Tajawal</option><option>Noto Kufi Arabic</option><option>Arial</option></select></div>
            <div><label className="mb-1 block text-sm text-muted-foreground">حجم خط المنتجات: {settings.productFontSize}</label><input type="range" min="12" max="28" value={settings.productFontSize} onChange={(e) => setSettings({ ...settings, productFontSize: Number(e.target.value) })} className="w-full accent-primary"/></div>
          </div><button onClick={() => save(settings)} className="mt-4 rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground">حفظ وتطبيق</button>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Printer className="h-5 w-5 text-primary"/>الطابعة والفاتورة</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="mb-1 block text-sm text-muted-foreground">الطابعة</label><select value={settings.printerName} onChange={(e) => setSettings({ ...settings, printerName: e.target.value })} className="h-12 w-full rounded-lg border border-border bg-secondary px-4"><option value="">الطابعة الافتراضية</option>{printers.map((p) => <option key={p.name} value={p.name}>{p.displayName || p.name}{p.isDefault ? " — الافتراضية" : ""}</option>)}</select>{!native() && <p className="mt-1 text-xs text-muted-foreground">تظهر طابعات Windows بعد تثبيت البرنامج</p>}</div>
            <div><label className="mb-1 block text-sm text-muted-foreground">مقاس الورق</label><select value={settings.paperWidth} onChange={(e) => setSettings({ ...settings, paperWidth: Number(e.target.value) as 58 | 80 })} className="h-12 w-full rounded-lg border border-border bg-secondary px-4"><option value={58}>58 ملم</option><option value={80}>80 ملم</option></select></div>
            <div><label className="mb-1 block text-sm text-muted-foreground">عدد النسخ</label><input type="number" min="1" max="5" value={settings.printCopies} onChange={(e) => setSettings({ ...settings, printCopies: Math.max(1, Number(e.target.value)) })} className="h-12 w-full rounded-lg border border-border bg-secondary px-4"/></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3"><label className="flex items-center gap-3 rounded-lg bg-secondary p-3"><input type="checkbox" checked={settings.autoPrint} onChange={(e) => setSettings({ ...settings, autoPrint: e.target.checked })}/>طباعة بعد البيع</label><label className="flex items-center gap-3 rounded-lg bg-secondary p-3"><input type="checkbox" checked={settings.autoCut} onChange={(e) => setSettings({ ...settings, autoCut: e.target.checked })}/>قص الورق</label><label className="flex items-center gap-3 rounded-lg bg-secondary p-3"><input type="checkbox" checked={settings.openDrawer} onChange={(e) => setSettings({ ...settings, openDrawer: e.target.checked })}/>فتح درج النقد</label></div>
          <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => save(settings)} className="rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground">حفظ</button><button onClick={testPrint} className="rounded-lg bg-secondary px-6 py-3 font-bold">طباعة تجريبية</button><Link to="/receipt-designer" className="flex items-center gap-2 rounded-lg bg-secondary px-6 py-3 font-bold"><ReceiptText className="h-4 w-4"/>تصميم الفاتورة</Link></div>
        </section>

        {/* Scale */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Scale className="h-5 w-5 text-primary" /> الميزان (رونكتا RLS1100)
          </h2>
          <div className="mb-4">
            <label className="mb-1 block text-sm text-muted-foreground">طريقة ربط الميزان</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, scaleMode: "serial" })}
                className={`flex-1 rounded-xl border px-4 py-3 font-bold ${settings.scaleMode !== "lan" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary"}`}
              >
                كيبل RS232 (تسلسلي)
              </button>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, scaleMode: "lan" })}
                className={`flex-1 rounded-xl border px-4 py-3 font-bold ${settings.scaleMode === "lan" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary"}`}
              >
                كيبل شبكة (LAN)
              </button>
            </div>
          </div>
          {settings.scaleMode === "lan" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">عنوان الميزان (IP)</label>
                <input
                  dir="ltr"
                  value={settings.scaleIp}
                  onChange={(e) => setSettings({ ...settings, scaleIp: e.target.value })}
                  className="h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">المنفذ</label>
                <input
                  dir="ltr"
                  type="number"
                  value={settings.scalePort}
                  onChange={(e) => setSettings({ ...settings, scalePort: Number(e.target.value) })}
                  className="h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">منفذ الكيبل (COM)</label>
                <div className="flex gap-2">
                  <select
                    dir="ltr"
                    value={settings.scaleCom}
                    onChange={(e) => setSettings({ ...settings, scaleCom: e.target.value })}
                    className="h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
                  >
                    <option value="">اختر المنفذ...</option>
                    {comPorts.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    {settings.scaleCom && !comPorts.includes(settings.scaleCom) && (
                      <option value={settings.scaleCom}>{settings.scaleCom}</option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      const n = native();
                      if (!n) return;
                      const ports = await n.listSerialPorts().catch(() => [] as string[]);
                      setComPorts(ports);
                      if (!ports.length) setScaleTest("لم أجد أي منفذ COM — تأكد أن كيبل الميزان موصول بالكاشير");
                    }}
                    className="shrink-0 rounded-xl bg-secondary px-4 font-bold"
                  >
                    تحديث
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">سرعة الاتصال (Baud)</label>
                <select
                  dir="ltr"
                  value={settings.scaleBaud}
                  onChange={(e) => setSettings({ ...settings, scaleBaud: Number(e.target.value) })}
                  className="h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
                >
                  {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            ضع شيئاً على الميزان ثم اضغط «اختبار الميزان» لمعرفة ما يرسله.
          </p>
          <button
            type="button"
            onClick={async () => {
              const n = native();
              if (!n) { setScaleTest("الاختبار يعمل في برنامج Windows فقط"); return; }
              setScaleTest("جارٍ الاختبار... ضع شيئاً على الميزان الآن");
              const call = () => settings.scaleMode === "lan"
                ? n.readWeight(settings.scaleIp, settings.scalePort).catch((e) => ({ ok: false, error: String(e), raw: "" } as { ok: boolean; weight?: number; error?: string; raw?: string; waiting?: boolean }))
                : n.readWeightSerial(settings.scaleCom, settings.scaleBaud).catch((e) => ({ ok: false, error: String(e), raw: "" } as { ok: boolean; weight?: number; error?: string; raw?: string; waiting?: boolean }));
              let r = await call();
              const started = Date.now();
              while ((r as { waiting?: boolean }).waiting && Date.now() - started < 12000) {
                await new Promise((res) => setTimeout(res, 400));
                r = await call();
              }
              const raw = r.raw ? JSON.stringify(r.raw).slice(0, 300) : "لا شيء";
              if (r.ok) {
                // Save the working scale settings so the sale screen uses the same connection.
                const next = { ...getSettings(), scaleMode: settings.scaleMode, scaleIp: settings.scaleIp, scalePort: settings.scalePort, scaleCom: settings.scaleCom, scaleBaud: settings.scaleBaud, useScale: true };
                saveSettings(next);
                setSettings({ ...settings, useScale: true });
                setScaleTest(`نجح ✓ الوزن: ${r.weight} كغم — تم حفظ إعدادات الميزان تلقائياً | البيانات المستلمة: ${raw}`);
              }
              else if (r.error === "no-data") setScaleTest(settings.scaleMode === "lan" ? `الاتصال تم لكن الميزان لم يرسل أي بيانات على هذا المنفذ.` : `المنفذ انفتح لكن الميزان لم يرسل أي بيانات. جرّب سرعة اتصال أخرى (مثلاً 4800 أو 2400) وتأكد أن الكيبل من نوع Null Modem.`);
              else if (r.error === "unparsed") setScaleTest(`وصلت بيانات لكن لم أفهم الوزن منها: ${raw}`);
              else if (r.error === "no-com") setScaleTest(`اختر منفذ COM أولاً من القائمة ثم اضغط حفظ.`);
              else setScaleTest(`فشل الاتصال: ${r.error}`);
            }}
            className="mt-3 rounded-xl bg-secondary px-4 py-2 font-bold"
          >
            اختبار الميزان
          </button>
          {settings.scaleMode !== "lan" && (
            <button
              type="button"
              onClick={async () => {
                const n = native();
                if (!n) { setScaleTest("الفحص يعمل في برنامج Windows فقط"); return; }
                const speeds = [9600, 4800, 2400, 19200, 38400, 57600, 115200, 1200];
                const call = (b: number) => n.readWeightSerial(settings.scaleCom, b).catch(() => ({ ok: false, raw: "" } as { ok: boolean; weight?: number; raw?: string; waiting?: boolean }));
                for (const b of speeds) {
                  setScaleTest(`جارٍ فحص السرعة ${b}... اترك شيئاً على الميزان`);
                  let r = await call(b);
                  const started = Date.now();
                  while ((r as { waiting?: boolean }).waiting && Date.now() - started < 8000) {
                    await new Promise((res) => setTimeout(res, 400));
                    r = await call(b);
                  }
                  if (r.raw) {
                    const hex = Array.from(r.raw.slice(0, 40)).map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
                    if (r.ok) setSettings({ ...settings, scaleBaud: b });
                    setScaleTest(`${r.ok ? `نجح ✓ الوزن ${r.weight} كغم على السرعة ${b} (اضغط حفظ)` : `وصلت بيانات على السرعة ${b} لكن لم أفهمها — أرسل لي صورة هذه الرسالة`} | ${JSON.stringify(r.raw).slice(0, 150)} | HEX: ${hex}`);
                    return;
                  }
                }
                setScaleTest("لم يرسل الميزان أي بيانات على كل السرعات. تأكد من إغلاق برنامج Rongta، ومن أن الكيبل Null Modem، ومن تفعيل إرسال الوزن في الميزان.");
              }}
              className="mt-3 ms-2 rounded-xl bg-secondary px-4 py-2 font-bold"
            >
              فحص تلقائي لكل السرعات
            </button>
          )}
          {scaleTest && <p dir="auto" className="mt-2 break-all rounded-lg bg-secondary p-3 text-sm">{scaleTest}</p>}
          <button
            onClick={() => save(settings)}
            className="mt-4 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground"
          >
            حفظ
          </button>
        </section>

        {/* Multi-cashier SQL Server sync */}
        {user?.role === "admin" && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
            <Server className="h-5 w-5 text-primary" /> الربط مع الخادم (SQL Server) — لأكثر من كاشير
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">كل كاشير يبيع حتى لو انقطعت الشبكة، والبيانات تُرسل للخادم تلقائياً عند رجوع الاتصال.</p>
          <label className="mb-4 flex items-center gap-3">
            <input type="checkbox" checked={!!settings.syncEnabled} onChange={(e) => setSettings({ ...settings, syncEnabled: e.target.checked })} className="h-5 w-5 accent-primary" />
            <span className="text-sm font-semibold">تشغيل الربط مع الخادم</span>
          </label>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            {([
              ["sqlHost", "عنوان الخادم (IP أو اسم الجهاز\\SQLEXPRESS)", "192.168.1.10"],
              ["sqlPort", "المنفذ", "1433"],
              ["sqlDatabase", "اسم قاعدة البيانات", "ZerosDB"],
              ["sqlUser", "اسم المستخدم", "sa"],
              ["sqlPassword", "كلمة السر", ""],
              ["terminalCode", "رقم هذا الكاشير", "1"],
            ] as const).map(([key, label, ph]) => (
              <div key={key}>
                <label className="mb-1 block text-sm text-muted-foreground">{label}</label>
                <input
                  dir="ltr"
                  type={key === "sqlPassword" ? "password" : key === "sqlPort" ? "number" : "text"}
                  value={String(settings[key] ?? "")}
                  placeholder={ph}
                  onChange={(e) => setSettings({ ...settings, [key]: key === "sqlPort" ? Number(e.target.value) : e.target.value })}
                  className="h-12 w-full rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => save(settings)} className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">حفظ</button>
            <button
              onClick={async () => {
                if (!native()) { toast.info("الربط متاح في نسخة الويندوز"); return; }
                save(settings);
                const r = await testSqlConnection();
                if (r.ok) toast.success("تم الاتصال بالخادم بنجاح"); else toast.error(`فشل الاتصال: ${r.error}`);
              }}
              className="rounded-xl bg-secondary px-6 py-3 font-bold"
            >اختبار الاتصال</button>
            <button
              onClick={async () => {
                if (!native()) { toast.info("الربط متاح في نسخة الويندوز"); return; }
                save(settings);
                const ok = await syncNow();
                if (ok) toast.success("تمت المزامنة"); else toast.error(`تعذرت المزامنة: ${getSyncStatus().error ?? "الربط غير مفعّل"}`);
              }}
              className="rounded-xl bg-secondary px-6 py-3 font-bold"
            >مزامنة الآن</button>
          </div>
        </section>
        )}

        {/* Scale label barcode */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Scale className="h-5 w-5 text-primary" /> البيع بملصق باركود الميزان
          </h2>
          <label className="mb-3 flex items-center justify-between gap-4 rounded-lg bg-secondary p-4">
            <div>
              <div className="font-bold">البيع باستخدام الميزان</div>
              <div className="text-sm text-muted-foreground">عند الإيقاف يكتب الكاشير الوزن بيده عند بيع المنتجات الموزونة</div>
            </div>
            <input type="checkbox" checked={settings.useScale !== false} onChange={(e) => setSettings({ ...settings, useScale: e.target.checked })} className="h-5 w-5 accent-primary" />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-lg bg-secondary p-4">
            <div>
              <div className="font-bold">تفعيل قراءة ملصقات الميزان</div>
              <div className="text-sm text-muted-foreground">الميزان يطبع ملصقاً، والكاشير يمسحه فيظهر المنتج والوزن والسعر</div>
            </div>
            <input type="checkbox" checked={settings.labelBarcodeEnabled} onChange={(e) => setSettings({ ...settings, labelBarcodeEnabled: e.target.checked })} className="h-5 w-5 accent-primary" />
          </label>
          {settings.labelBarcodeEnabled && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">بداية الباركود (افصل بفاصلة)</label>
                <input dir="ltr" value={settings.labelPrefixes} onChange={(e) => setSettings({ ...settings, labelPrefixes: e.target.value })} className="h-12 w-full rounded-xl border border-border bg-secondary px-4" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">عدد أرقام رقم المنتج</label>
                <select value={settings.labelPluLength} onChange={(e) => setSettings({ ...settings, labelPluLength: Number(e.target.value) })} className="h-12 w-full rounded-xl border border-border bg-secondary px-4">
                  {[4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">الملصق يحمل</label>
                <select value={settings.labelValueType} onChange={(e) => setSettings({ ...settings, labelValueType: e.target.value as "weight" | "price" })} className="h-12 w-full rounded-xl border border-border bg-secondary px-4">
                  <option value="weight">الوزن (مستحسن)</option>
                  <option value="price">السعر</option>
                </select>
              </div>
              {settings.labelValueType === "weight" && (
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">دقة الوزن</label>
                  <select value={settings.labelWeightDecimals} onChange={(e) => setSettings({ ...settings, labelWeightDecimals: Number(e.target.value) })} className="h-12 w-full rounded-xl border border-border bg-secondary px-4">
                    <option value={3}>غرام (01175 = 1.175 كغم)</option>
                    <option value={2}>10 غرام (00117 = 1.17 كغم)</option>
                  </select>
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">مثال: 21 00015 01175 8 ← منتج رقم 15 في الميزان، وزن 1.175 كغم. أضف «رقم المنتج في الميزان» لكل منتج بالوزن من صفحة المنتجات.</p>
          <button onClick={() => save(settings)} className="mt-4 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">حفظ</button>
        </section>

        <UpdatePanel />

        <section className="rounded-2xl border border-destructive/50 bg-card p-6">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-destructive"><Trash2 className="h-5 w-5" /> تصفير كل شيء</h2>
          <p className="mb-4 text-sm text-muted-foreground">يحذف كل المنتجات والمبيعات والورديات والمشتريات والمصاريف والمستخدمين والإعدادات، ويبقى التفعيل. يعود رقم الدخول إلى 1234. ننصح بتنزيل نسخة احتياطية قبل ذلك.</p>
          <button
            onClick={() => {
              if (!window.confirm("هل أنت متأكد؟ سيتم حذف كل البيانات نهائياً.")) return;
              if (window.prompt("اكتب كلمة: تصفير للتأكيد") !== "تصفير") { toast.error("لم يتم التصفير"); return; }
              resetAllData();
              toast.success("تم تصفير النظام");
              logout();
              navigate({ to: "/login" });
            }}
            className="rounded-xl bg-destructive px-6 py-3 font-bold text-destructive-foreground"
          >تصفير النظام بالكامل</button>
        </section>

        {/* Backup */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <HardDrive className="h-5 w-5 text-primary" /> النسخ الاحتياطي
          </h2>
          <div className="mb-4">
            <label className="mb-1 block text-sm text-muted-foreground">مكان حفظ النسخ</label>
            <div className="flex gap-2">
              <input
                dir="ltr"
                value={settings.backupFolder}
                onChange={(e) => setSettings({ ...settings, backupFolder: e.target.value })}
                placeholder="D:\backups"
                className="h-12 flex-1 rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
              />
              <button
                onClick={async () => {
                  const n = native();
                  if (!n) { toast.info("اختيار المجلد متاح في نسخة الويندوز"); return; }
                  const f = await n.pickFolder();
                  if (f) save({ ...settings, backupFolder: f });
                }}
                className="rounded-xl bg-secondary px-4 font-bold"
              >
                اختيار مجلد
              </button>
            </div>
          </div>
          <label className="mb-4 flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.autoBackup}
              onChange={(e) => setSettings({ ...settings, autoBackup: e.target.checked })}
              className="h-5 w-5 accent-primary"
            />
            <span className="text-sm font-semibold">نسخ احتياطي تلقائي يومياً</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => save(settings)}
              className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground"
            >
              حفظ
            </button>
            <button
              onClick={downloadBackup}
              className="flex items-center gap-2 rounded-xl bg-secondary px-6 py-3 font-bold"
            >
              <Download className="h-4 w-4" /> تنزيل نسخة الآن
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-xl bg-secondary px-6 py-3 font-bold"
            >
              <Upload className="h-4 w-4" /> استرجاع نسخة
            </button>
            {native()?.restoreDb && (
              <button
                onClick={async () => {
                  const n = native();
                  if (!n?.restoreDb) return;
                  const r = await n.restoreDb();
                  if (!r.ok && r.error !== "canceled") toast.error("تعذر استرجاع النسخة");
                  // عند النجاح يعيد البرنامج تشغيل نفسه تلقائياً بالبيانات المسترجعة
                }}
                className="flex items-center gap-2 rounded-xl bg-secondary px-6 py-3 font-bold"
              >
                <HardDrive className="h-4 w-4" /> استرجاع نسخة البرنامج (.db)
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
            />
          </div>
        </section>

        {/* Users */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-bold">المستخدمون</h2>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <input
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              placeholder="الاسم"
              className="h-12 rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
            />
            <input
              dir="ltr"
              inputMode="numeric"
              value={newUser.pin}
              onChange={(e) => setNewUser({ ...newUser, pin: e.target.value.replace(/\D/g, "") })}
              placeholder="الرقم السري (أرقام فقط)"
              className="h-12 rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
            />
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value as "cashier" })}
              className="h-12 rounded-xl border border-border bg-secondary px-4 outline-none"
            >
              <option value="cashier">كاشير</option>
              <option value="admin">مدير</option>
            </select>
            <button
              onClick={addUser}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground"
            >
              <Plus className="h-5 w-5" /> إضافة
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground">
              <tr>
                <th className="p-3 text-right font-semibold">الاسم</th>
                <th className="p-3 text-right font-semibold">الدور</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="p-3 font-bold">{u.name}</td>
                  <td className="p-3">{u.role === "admin" ? "مدير" : "كاشير"}</td>
                  <td className="p-3">
                    {u.role !== "admin" && (
                      <button
                        onClick={() => removeUser(u.id)}
                        className="rounded-lg p-2 text-destructive hover:bg-accent"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppLayout>
  );
}
