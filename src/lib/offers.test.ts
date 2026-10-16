import { describe, expect, it } from "vitest";
import { lineTotalWithOffer, weightedUnitPrice, roundToCash250, roundCash, parseScaleLabel, getSettings } from "./db";
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

  it("عرض الكيلو يستخدم سعر مجموع الوزن", () => {
    const kg: Product = { ...base, unit: "kg", offerQty: 2, offerPrice: 1500 };
    expect(lineTotalWithOffer(kg, 2)).toBe(1500);
  });

  it("سعر مخصص (جملة) يُستخدم للقطع خارج العرض", () => {
    expect(lineTotalWithOffer(withOffer, 3, 900)).toBe(2400);
  });
});

describe("proportional weighed offers", () => {
  const tomato: Product = { ...base, name: "طماطة", unit: "kg", offerQty: 3, offerPrice: 2000, plu: "1" };
  const potato: Product = { ...base, name: "بطاطا", unit: "kg", offerQty: 2, offerPrice: 1250 };
  it("3 kg tomatoes cost 2000", () => expect(lineTotalWithOffer(tomato, 3)).toBe(2000));
  it("1.5 kg tomatoes cost 1000", () => expect(lineTotalWithOffer(tomato, 1.5)).toBe(1000));
  it("6 kg tomatoes cost 4000", () => expect(lineTotalWithOffer(tomato, 6)).toBe(4000));
  it("2 kg potatoes cost 1250", () => expect(lineTotalWithOffer(potato, 2)).toBe(1250));
  it("4 kg potatoes cost 2500", () => expect(lineTotalWithOffer(potato, 4)).toBe(2500));
  it("1 kg potatoes is 625 before cash rounding", () => expect(lineTotalWithOffer(potato, 1)).toBe(625));
  it("rounds 625 to nearest 250 after weighing", () => expect(roundToCash250(lineTotalWithOffer(potato, 1))).toBe(750));
  it("keeps the unrounded unit rate for tomatoes", () => expect(weightedUnitPrice(tomato)).toBe(2000 / 3));
  it("uses normal kg price without a complete offer", () => {
    const incomplete = { ...tomato };
    delete incomplete.offerPrice;
    expect(lineTotalWithOffer(incomplete, 1.5)).toBe(1500);
  });
  it("weight barcode uses the proportional offer", () => {
    const settings = { ...getSettings(), labelBarcodeEnabled: true, labelPrefixes: "20", labelPluLength: 5, labelValueType: "weight" as const, labelWeightDecimals: 3 };
    const result = parseScaleLabel("2000001015000", settings, [tomato]);
    expect(result).toMatchObject({ qty: 1.5, total: 1000 });
  });
});

describe("roundCash — خيار التقريب لأقرب 250", () => {
  const plain: Product = { ...base, unit: "kg", price: 1000 }; // 1.1 kg = 1100 exactly

  it("rounds to nearest 250 when rounding is on", () => {
    expect(roundCash(lineTotalWithOffer(plain, 1.125), true)).toBe(1250); // 1125 → أقرب 250
  });

  it("keeps the exact amount when rounding is off", () => {
    expect(roundCash(lineTotalWithOffer(plain, 1.1), false)).toBeCloseTo(1100);
    expect(roundCash(625, false)).toBe(625);
  });

  it("rounds 625 up to 750 when rounding is on", () => {
    expect(roundCash(625, true)).toBe(750);
  });
});
