import { native } from "@/lib/native";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, Upload, Plus, Trash2, Scale, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import {
  getSettings,
  saveSettings,
  getUsers,
  saveUsers,
  exportBackup,
  importBackup,
  uid,
} from "@/lib/db";
import type { PosUser, Settings } from "@/lib/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات — نظام البقالة" },
      { name: "description", content: "إعدادات المتجر والميزان والنسخ الاحتياطي والمستخدمين" },
      { property: "og:title", content: "الإعدادات — نظام البقالة" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>(getSettings());
  const [users, setUsers] = useState<PosUser[]>([]);
  const [newUser, setNewUser] = useState({ name: "", pin: "", role: "cashier" as const });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) navigate({ to: "/login" });
    else if (user.role !== "admin") navigate({ to: "/" });
  }, [user, ready, navigate]);

  useEffect(() => setUsers(getUsers()), []);

  if (!ready || !user || user.role !== "admin") return null;

  const save = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
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

        {/* Scale */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Scale className="h-5 w-5 text-primary" /> الميزان (رونكتا RLS1100)
          </h2>
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
          <p className="mt-3 text-xs text-muted-foreground">
            سيتم تفعيل جلب الوزن المباشر بعد تأكيد موديل الميزان النهائي.
          </p>
          <button
            onClick={() => save(settings)}
            className="mt-4 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground"
          >
            حفظ
          </button>
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
