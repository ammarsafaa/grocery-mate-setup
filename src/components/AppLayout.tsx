import { useEffect } from "react";
import { isLicensed } from "@/lib/license";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ShoppingCart,
  Package,
  Clock,
  BarChart3,
  Settings as SettingsIcon,
  LogOut,
  Store,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { getSettings } from "@/lib/db";

const NAV = [
  { to: "/", label: "نقطة البيع", icon: ShoppingCart },
  { to: "/products", label: "المنتجات", icon: Package },
  { to: "/shifts", label: "الورديات", icon: Clock },
  { to: "/reports", label: "التقارير", icon: BarChart3 },
  { to: "/settings", label: "الإعدادات", icon: SettingsIcon },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const storeName = getSettings().storeName;
  useEffect(() => {
    isLicensed().then((ok) => { if (!ok) navigate({ to: "/activate" }); });
  }, [navigate]);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-20 flex-col items-center border-l border-border bg-sidebar py-4 md:w-56 md:items-stretch md:px-3">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Store className="h-5 w-5 text-primary" />
          </div>
          <span className="hidden text-lg font-bold text-foreground md:block">{storeName}</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => {
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
