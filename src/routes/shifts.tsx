import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PlayCircle, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { getShifts, saveShifts, getOpenShift, getSales, formatMoney, uid } from "@/lib/db";
import { buildShiftReportHtml, closeShift as doCloseShift, printHtml } from "@/lib/shiftReport";
import type { Shift } from "@/lib/types";

export const Route = createFileRoute("/shifts")({
  head: () => ({
    meta: [
      { title: "الورديات — نظام البقالة" },
      { name: "description", content: "فتح وغلق الورديات وتقاريرها" },
      { property: "og:title", content: "الورديات — نظام البقالة" },
      { property: "og:description", content: "فتح وغلق الورديات ومراجعة تقاريرها" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShiftsPage,
});

function ShiftsPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [openCash, setOpenCash] = useState("");
  const [closeCash, setCloseCash] = useState("");

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [user, ready, navigate]);

  useEffect(() => setShifts(getShifts().slice().reverse()), []);

  const open = getOpenShift();

  const openShift = () => {
    if (!user) return;
    const s: Shift = {
      id: uid(),
      userId: user.id,
      userName: user.name,
      openedAt: new Date().toISOString(),
      openingCash: Number(openCash) || 0,
    };
    saveShifts([...getShifts(), s]);
    setShifts(getShifts().slice().reverse());
    setOpenCash("");
    toast.success("تم فتح الوردية");
  };

  useEffect(() => {
    const r = () => setShifts(getShifts().slice().reverse());
    window.addEventListener("grocery-pos:shift-closed", r);
    return () => window.removeEventListener("grocery-pos:shift-closed", r);
  }, []);

  const closeShift = async () => {
    if (!open) return;
    const { shift, sales } = doCloseShift(open.id, Number(closeCash) || 0);
    setShifts(getShifts().slice().reverse());
    setCloseCash("");
    toast.success("تم غلق الوردية، جارٍ طباعة تقرير اليوم");
    await printHtml(buildShiftReportHtml(shift, sales));
  };

  const reprint = (s: Shift) => printHtml(buildShiftReportHtml(s, getSales().filter((x) => x.shiftId === s.id)));

  if (!ready || !user) return null;

  return (
    <AppLayout>
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold">الورديات</h1>

        <div className="mb-6 rounded-2xl border border-border bg-card p-6">
          {open ? (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-3 w-3 rounded-full bg-primary" />
                <h2 className="text-lg font-bold">
                  وردية مفتوحة — {open.userName} منذ{" "}
                  {new Date(open.openedAt).toLocaleTimeString("ar-IQ")}
                </h2>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <label className="mb-1 block text-sm text-muted-foreground">
                    النقد الفعلي في الصندوق عند الغلق
                  </label>
                  <input
                    type="number"
                    value={closeCash}
                    onChange={(e) => setCloseCash(e.target.value)}
                    className="h-12 w-56 rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
                  />
                </div>
                <button
                  onClick={closeShift}
                  className="flex h-12 items-center gap-2 rounded-xl bg-destructive px-6 font-bold text-destructive-foreground"
                >
                  <StopCircle className="h-5 w-5" /> غلق الوردية
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-3">
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">
                  النقد الافتتاحي في الصندوق
                </label>
                <input
                  type="number"
                  value={openCash}
                  onChange={(e) => setOpenCash(e.target.value)}
                  className="h-12 w-56 rounded-xl border border-border bg-secondary px-4 outline-none focus:border-primary"
                />
              </div>
              <button
                onClick={openShift}
                className="flex h-12 items-center gap-2 rounded-xl bg-primary px-6 font-bold text-primary-foreground"
              >
                <PlayCircle className="h-5 w-5" /> فتح وردية
              </button>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground">
              <tr>
                <th className="p-3 text-right font-semibold">الموظف</th>
                <th className="p-3 text-right font-semibold">الفتح</th>
                <th className="p-3 text-right font-semibold">الغلق</th>
                <th className="p-3 text-right font-semibold">نقد الافتتاح</th>
                <th className="p-3 text-right font-semibold">عدد الفواتير</th>
                <th className="p-3 text-right font-semibold">إجمالي المبيعات</th>
                <th className="p-3 text-right font-semibold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="p-3 font-bold">{s.userName}</td>
                  <td className="p-3">{new Date(s.openedAt).toLocaleString("ar-IQ")}</td>
                  <td className="p-3">
                    {s.closedAt ? new Date(s.closedAt).toLocaleString("ar-IQ") : "—"}
                  </td>
                  <td className="p-3">{formatMoney(s.openingCash)}</td>
                  <td className="p-3">{s.salesCount ?? "—"}</td>
                  <td className="p-3 font-bold text-primary">
                    {s.salesTotal != null ? formatMoney(s.salesTotal) : "—"}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        s.closedAt ? "bg-secondary text-muted-foreground" : "bg-primary/15 text-primary"
                      }`}
                    >
                      {s.closedAt ? "مغلقة" : "مفتوحة"}
                    </span>
                    {s.closedAt && (
                      <button onClick={() => reprint(s)} className="mr-2 rounded-lg bg-secondary px-3 py-1 text-xs font-bold">طباعة التقرير</button>
                    )}
                  </td>
                </tr>
              ))}
              {shifts.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    لا توجد ورديات بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
