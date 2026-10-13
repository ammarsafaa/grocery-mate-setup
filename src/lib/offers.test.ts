import { describe, expect, it } from "vitest";
import { lineTotalWithOffer } from "./db";
import type { Product } from "./types";

const base: Product = { id: "1", name: "شاي", price: 1000, unit: "piece", category: "عام", stock: 100, active: true };

describe("lineTotalWithOffer — عرض 2 بسعر 1500", () => {
  const withOffer: Product = { ...base, offerQty: 2, offerPrice: 1500 };

  it("بدون عرض: الكمية × السعر", () => {
    expect(lineTotalWithOffer(base, 3)).toBe(3000);
  });

  it("قطعة واحدة بالسعر العادي", () => {
    expect(lineTotalWithOffer(withOffer, 1)).toBe(1000);
  });

  it("قطعتان بسعر العرض", () => {
    expect(lineTotalWithOffer(withOffer, 2)).toBe(1500);
  });

  it("3 قطع: عرض + قطعة عادية", () => {
    expect(lineTotalWithOffer(withOffer, 3)).toBe(2500);
  });

  it("5 قطع: عرضان + قطعة", () => {
    expect(lineTotalWithOffer(withOffer, 5)).toBe(4000);
  });

  it("العرض لا ينطبق على منتجات الكيلو", () => {
    const kg: Product = { ...base, unit: "kg", offerQty: 2, offerPrice: 1500 };
    expect(lineTotalWithOffer(kg, 2)).toBe(2000);
  });

  it("سعر مخصص (جملة) يُستخدم للقطع خارج العرض", () => {
    expect(lineTotalWithOffer(withOffer, 3, 900)).toBe(2400);
  });
});
