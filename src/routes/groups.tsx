import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FolderOpen, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/lib/auth";
import { getGroups, saveGroups, uid } from "@/lib/db";
import type { ProductGroup } from "@/lib/types";

export const Route = createFileRoute("/groups")({
  head: () => ({ meta: [
    { title: "مجموعات المنتجات — نظام البقالة" },
    { name: "description", content: "إدارة مجموعات المنتجات وترتيب ظهورها في نقطة البيع" },
    { property: "og:title", content: "مجموعات المنتجات — نظام البقالة" },
    { property: "og:description", content: "إدارة مجموعات المنتجات وترتيب ظهورها في نقطة البيع" },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: GroupsPage,
});

const COLORS = ["primary", "success", "warning", "danger", "info"];

function GroupsPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [editing, setEditing] = useState<ProductGroup | null>(null);
  useEffect(() => { if (ready && (!user || user.role !== "admin")) navigate({ to: user ? "/" : "/login" }); }, [ready, user, navigate]);
  useEffect(() => setGroups(getGroups()), []);
  if (!ready || !user || user.role !== "admin") return null;
  const commit = (next: ProductGroup[]) => { setGroups(next); saveGroups(next); };
  const move = (index: number, delta: number) => {
    const target = index + delta; if (target < 0 || target >= groups.length) return;
    const next = [...groups]; [next[index], next[target]] = [next[target], next[index]];
    commit(next.map((g, order) => ({ ...g, order })));
  };
  const save = () => {
    if (!editing?.name.trim()) return toast.error("أدخل اسم المجموعة");
    const exists = groups.some((g) => g.id === editing.id);
    commit(exists ? groups.map((g) => g.id === editing.id ? editing : g) : [...groups, { ...editing, order: groups.length }]);
    setEditing(null); toast.success("تم حفظ المجموعة");
  };
  return <AppLayout><div className="space-y-5 p-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">مجموعات المنتجات</h1><p className="text-sm text-muted-foreground">رتّب المجموعات كما تريد أن تظهر للكاشير</p></div><button onClick={() => setEditing({ id: uid(), name: "", color: "primary", icon: "package", order: groups.length, active: true })} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground"><Plus className="h-5 w-5"/>مجموعة جديدة</button></div>
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {groups.map((group, index) => <div key={group.id} className="flex items-center gap-3 border-b border-border p-4 last:border-0">
        <GripVertical className="h-5 w-5 text-muted-foreground"/><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15"><FolderOpen className="h-5 w-5 text-primary"/></div>
        <div className="flex-1"><div className="font-bold">{group.name}</div><div className="text-xs text-muted-foreground">{group.active ? "ظاهرة في نقطة البيع" : "مخفية"}</div></div>
        <button title="للأعلى" onClick={() => move(index, -1)} className="rounded-lg bg-secondary px-3 py-2">↑</button><button title="للأسفل" onClick={() => move(index, 1)} className="rounded-lg bg-secondary px-3 py-2">↓</button>
        <button onClick={() => commit(groups.map((g) => g.id === group.id ? { ...g, active: !g.active } : g))} className="rounded-lg bg-secondary px-3 py-2 text-sm font-bold">{group.active ? "إخفاء" : "إظهار"}</button>
        <button title="تعديل" onClick={() => setEditing({ ...group })} className="rounded-lg p-2 hover:bg-accent"><Pencil className="h-4 w-4"/></button>
        <button title="حذف" onClick={() => commit(groups.filter((g) => g.id !== group.id))} className="rounded-lg p-2 text-destructive hover:bg-accent"><Trash2 className="h-4 w-4"/></button>
      </div>)}
      {!groups.length && <div className="p-10 text-center text-muted-foreground">لا توجد مجموعات</div>}
    </div>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"><div className="w-full max-w-md rounded-lg border border-border bg-card p-6"><h2 className="mb-4 text-xl font-bold">بيانات المجموعة</h2><input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="اسم المجموعة" className="h-12 w-full rounded-lg border border-border bg-secondary px-4"/><div className="mt-4 flex gap-2">{COLORS.map((color) => <button key={color} onClick={() => setEditing({ ...editing, color })} className={`h-9 w-9 rounded-full border-2 ${editing.color === color ? "border-foreground" : "border-transparent"} bg-primary`} title={color}/>)}</div><div className="mt-5 flex gap-2"><button onClick={save} className="h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground">حفظ</button><button onClick={() => setEditing(null)} className="h-12 flex-1 rounded-lg bg-secondary font-bold">إلغاء</button></div></div></div>}
  </div></AppLayout>;
}