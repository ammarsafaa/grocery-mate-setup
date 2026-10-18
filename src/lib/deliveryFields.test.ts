import { describe, expect, it } from "vitest";
import { missingDeliveryFields } from "./deliveryFields";

const empty = { name: "", phone: "", address: "" };
describe("independent optional delivery fields", () => {
  it("requires all three by default", () => expect(missingDeliveryFields(empty, {})).toEqual(["الاسم", "الهاتف", "العنوان"]));
  it("makes only name optional", () => expect(missingDeliveryFields(empty, { deliveryNameOptional: true })).toEqual(["الهاتف", "العنوان"]));
  it("makes only phone optional", () => expect(missingDeliveryFields(empty, { deliveryPhoneOptional: true })).toEqual(["الاسم", "العنوان"]));
  it("makes only address optional", () => expect(missingDeliveryFields(empty, { deliveryAddressOptional: true })).toEqual(["الاسم", "الهاتف"]));
  it("allows empty fields when all three are optional", () => expect(missingDeliveryFields(empty, { deliveryNameOptional: true, deliveryPhoneOptional: true, deliveryAddressOptional: true })).toEqual([]));
  it("does not accept whitespace for required fields", () => expect(missingDeliveryFields({ name: "  ", phone: "07", address: "بغداد" }, {})).toEqual(["الاسم"]));
});