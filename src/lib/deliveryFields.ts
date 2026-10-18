import type { Settings } from "./types";

export type DeliveryFields = { name: string; phone: string; address: string };

export function missingDeliveryFields(fields: DeliveryFields, settings: Pick<Settings, "deliveryNameOptional" | "deliveryPhoneOptional" | "deliveryAddressOptional">): string[] {
  const missing: string[] = [];
  if (!settings.deliveryNameOptional && !fields.name.trim()) missing.push("الاسم");
  if (!settings.deliveryPhoneOptional && !fields.phone.trim()) missing.push("الهاتف");
  if (!settings.deliveryAddressOptional && !fields.address.trim()) missing.push("العنوان");
  return missing;
}