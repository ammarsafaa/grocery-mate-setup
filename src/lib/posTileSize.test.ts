import { describe, expect, it } from "vitest";
import { posTileWidth } from "./posTileSize";

describe("saved POS tile width", () => {
  it("keeps the chosen size", () => {
    expect(posTileWidth(176)).toBe(176);
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