import { getSettings } from "./db";
import { buildLayoutHtml, getLayout, receiptContent } from "./printLayout";
import type { Sale } from "./types";

export function buildReceiptHtml(sale: Sale) {
  const slot = getSettings().paperWidth;
  return buildLayoutHtml(getLayout("receipt", slot), receiptContent(sale));
}
