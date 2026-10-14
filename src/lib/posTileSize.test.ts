import { describe, expect, it, vi } from "vitest";
import { posTileWidth } from "./posTileSize";
import { getSettings, saveSettings } from "./db";

describe("saved POS tile width", () => {
  it("keeps the chosen size", () => {
    expect(posTileWidth(176)).toBe(176);
  });
  it("reads the chosen size back from local storage after saving", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() { return data.size; },
      key: (index: number) => Array.from(data.keys())[index] ?? null,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    vi.stubGlobal("window", { dispatchEvent: () => true });
    vi.stubGlobal("CustomEvent", class { constructor(public type: string) {} });
    try {
      saveSettings({ ...getSettings(), productTileWidth: 176 });
      expect(getSettings().productTileWidth).toBe(176);
      expect(JSON.parse(data.get("grocery-pos:settings") ?? "{}").productTileWidth).toBe(176);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("gives older settings a compact default", () => {
    expect(posTileWidth()).toBe(144);
  });
  it("bounds invalid sizes", () => {
    expect(posTileWidth(50)).toBe(112);
    expect(posTileWidth(500)).toBe(224);
    expect(posTileWidth(NaN)).toBe(144);
  });
});