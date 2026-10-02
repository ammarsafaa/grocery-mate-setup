import { useEffect, useState } from "react";
import { getSyncStatus, startSyncLoop, type SyncStatus } from "@/lib/sync";
import { startTelegramQueue } from "@/lib/telegram";
import { isLicensed } from "@/lib/license";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ShoppingCart,
  Package,
  Clock,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  FolderTree,
  Truck,
  Boxes,
  ReceiptText,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { applyTheme } from "@/lib/theme";
import zerosLogo from "@/assets/zeros-logo.png";

const NAV = [
  { to: "/", label: "نقطة البيع", icon: ShoppingCart },
  { to: "/products", label: "المنتجات", icon: Package },
  { to: "/groups", label: "المجموعات", icon: FolderTree, admin: true },
  { to: "/purchases", label: "المشتريات", icon: Truck, admin: true },
  { to: "/inventory", label: "المخزون", icon: Boxes, admin: true },
  { to: "/shifts", label: "الورديات", icon: Clock },
  { to: "/cashbox", label: "الصندوق والمصاريف", icon: Wallet, admin: true },
  { to: "/reports", label: "التقارير", icon: BarChart3 },
  { to: "/receipt-designer", label: "تصميم الفاتورة", icon: ReceiptText, admin: true },
  { to: "/settings", label: "الإعدادات", icon: SettingsIcon },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const storeName = getSettings().storeName;
  useEffect(() => {
    const refresh = () => applyTheme(getSettings());
    refresh();
    window.addEventListener("grocery-pos:settings-updated", refresh);
    return () => window.removeEventListener("grocery-pos:settings-updated", refresh);
  }, []);
  useEffect(() => {
    isLicensed().then((ok) => { if (!ok) navigate({ to: "/activate" }); });
  }, [navigate]);
  const [sync, setSync] = useState<SyncStatus>({ state: "off", pending: 0 });
  useEffect(() => {
    const h = () => setSync(getSyncStatus());
    h();
    window.addEventListener("grocery-pos:sync-status", h);
    startSyncLoop(); startTelegramQueue();
    return () => window.removeEventListener("grocery-pos:sync-status", h);
  }, []);


  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-20 flex-col items-center border-l border-border bg-sidebar py-4 md:w-56 md:items-stretch md:px-3">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src={zerosLogo} alt="شعار زيروس" className="h-11 w-11 shrink-0 object-contain" />
          <div className="hidden min-w-0 md:block">
            <div className="text-base font-bold text-foreground">زيروس</div>
            <div className="truncate text-xs text-muted-foreground">{storeName}</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.filter((item) => !("admin" in item) || !item.admin || user?.role === "admin").map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center justify-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition md:justify-start ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden md:block">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 border-t border-sidebar-border pt-3">
          {sync.state !== "off" && (
            <div title={sync.error || ""} className="mb-2 flex items-center justify-center gap-2 px-3 text-xs md:justify-start">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${sync.state === "error" ? "bg-destructive" : "bg-primary"}`} />
              <span className="hidden text-muted-foreground md:block">{sync.state === "error" ? "الخادم غير متصل — البيع مستمر" : "متصل بالخادم"}</span>
            </div>
          )}
          <div className="mb-2 hidden px-3 text-xs text-muted-foreground md:block">
            {user?.name} — {user?.role === "admin" ? "مدير" : "كاشير"}
          </div>
          <button
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
            className="flex w-full items-center justify-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-sidebar-accent hover:text-destructive md:justify-start"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="hidden md:block">خروج</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
