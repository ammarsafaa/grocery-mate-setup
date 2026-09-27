import type { Settings } from "./types";

const PRESETS = { emerald: "#10b981", blue: "#2563eb", red: "#dc2626", amber: "#d97706" } as const;

export function applyTheme(settings: Settings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.mode = settings.colorMode;
  const color = settings.colorPreset === "custom" ? settings.customColor : PRESETS[settings.colorPreset];
  root.style.setProperty("--primary", color);
  root.style.setProperty("--ring", color);
  root.style.setProperty("--sidebar-primary", color);
  root.style.setProperty("--product-font", `"${settings.productFont}", sans-serif`);
  root.style.setProperty("--product-font-size", `${settings.productFontSize}px`);
}