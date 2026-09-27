import { useEffect } from "react";
import { isLicensed } from "@/lib/license";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Delete, LockKeyhole } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import zerosLogo from "@/assets/zeros-logo.png";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — نظام البقالة" },
      { name: "description", content: "تسجيل الدخول برقم سري" },
      { property: "og:title", content: "تسجيل الدخول — نظام البقالة" },
      { property: "og:description", content: "تسجيل الدخول الآمن إلى نظام البقالة برقم سري" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const storeName = getSettings().storeName;
  useEffect(() => {
    isLicensed().then((ok) => { if (!ok) navigate({ to: "/activate" }); });
  }, [navigate]);

  const press = (d: string) => {
    if (pin.length >= 8) return;
    setError(false);
    setPin(pin + d);
  };

  const submit = (value: string) => {
    if (!value) return;
    if (login(value)) {
      navigate({ to: "/" });
    } else {
      setError(true);
      setPin("");
    }
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <img src={zerosLogo} alt="شعار زيروس" className="mx-auto mb-3 h-24 w-24 object-contain" />
          <div className="mb-1 text-sm font-bold text-primary">زيروس</div>
          <h1 className="text-2xl font-bold text-foreground">{storeName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">أدخل الرقم السري للدخول</p>
        </div>

        <div
          className={`mx-auto mb-6 flex h-14 w-48 items-center justify-center gap-2 rounded-xl border bg-secondary text-3xl tracking-[0.5em] text-foreground ${
            error ? "border-destructive" : "border-border"
          }`}
        >
          {pin ? "•".repeat(pin.length) : <span className="text-muted-foreground">----</span>}
        </div>
        {error && <p className="mb-4 text-center text-sm text-destructive">الرقم السري غير صحيح</p>}

        <div className="grid grid-cols-3 gap-3" dir="ltr">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => {
                if (k === "C") setPin("");
                else if (k === "⌫") setPin(pin.slice(0, -1));
                else press(k);
              }}
              className="flex h-16 items-center justify-center rounded-xl bg-secondary text-2xl font-bold text-foreground transition hover:bg-accent active:scale-95"
            >
              {k === "⌫" ? <Delete className="h-6 w-6" /> : k}
            </button>
          ))}
        </div>

        <button
          onClick={() => submit(pin)}
          className="mt-6 h-14 w-full rounded-xl bg-primary text-lg font-bold text-primary-foreground transition hover:opacity-90 active:scale-95"
        >
          دخول
        </button>
      </div>
    </div>
  );
}
