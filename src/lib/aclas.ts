// Aclas LS6 label scale over LAN: sends products/prices (PLU) to the scale using
// the official AclasSDKConsole.exe (run by the Windows app). The scale prints a
// weight barcode label that the POS already reads.
import { getProducts, getSettings } from "@/lib/db";
import { native } from "@/lib/native";
import type { Product, Settings } from "@/lib/types";

const HEADER = "ID\tItemCode\tDepartmentID\tGroupID\tName1\tName2\tName3\tPrice\tUnitID\tBarcodeType1\tBarcodeType2\tLabel1ID\tLabel2ID\tProducedDate\tFreshnessDate\tValidDate\tPackageType\tPackageWeight\tPackagePrice\tPackageRange\tPackageDays\tPackageHours\tText1ID\tText2ID\tText3ID\tText4ID\tText5ID\tText6ID\tText7ID\tText8ID\tDiscountID\tDiscountRate\tHalfDiscount\tQuarterDiscount\tTareID\tTareValue\tIceID\tICEValue\tOriginID\tTraceabilityID\tLimitPrice\tTax1\tTax2\tTax3\tTax4\tFlag1\tFlag2\tFlag3\tProducedDateRule\tFreshnessDateFrom\tValidDateFrom\tPackageDateFrom\tSpeedCode\tPosition1\tSalesCategory\tDiscountBeginTime\tDiscountEndTime\tDiscountPrice\tDiscountFlag";

/** Barcode type per SDK table: 5-digit item → 7 (weight) / 2 (price); 6-digit → 27 / 22. */
function barcodeType(s: Settings): number {
  const six = (s.labelPluLength || 5) >= 6;
  if (s.labelValueType === "price") return six ? 22 : 2;
  return six ? 27 : 7;
}

export function aclasProducts(): Product[] {
  return getProducts().filter((p) => p.active && p.plu && /^\d{1,6}$/.test(p.plu));
}

export function buildPluFile(products: Product[], s: Settings): string {
  const now = new Date();
  const d = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
  const bt = barcodeType(s);
  const rows = products.map((p) => {
    const id = String(Number(p.plu));
    const name = p.name.replace(/[\t\r\n]/g, " ").slice(0, 40);
    const unit = p.unit === "kg" ? 4 : 10;
    const price = Math.min(999999.99, Math.max(0, Number(p.price) || 0));
    // Same defaults as the official demo file, with our own fields filled in.
    return [id, id, 2, 1, name, "", "", price, unit, bt, 0, 1, 0, d,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0,
      60, 240, 0, 0, 0, 0, 0, "", 0, "", "1899/12/30", "1899/12/30", 0, 0].join("\t");
  });
  return [HEADER, ...rows].join("\r\n") + "\r\n";
}

const ERRORS: Record<number, string> = {
  1: "الميزان غير متصل — تأكد من IP الميزان والكيبل وأن الميزان يعمل",
  2: "خطأ في الإعدادات المرسلة",
  3: "نقص في البيانات المرسلة",
  4: "فشل التنفيذ داخل الميزان",
};
export const aclasErrorText = (r: { ok: boolean; code?: number; error?: string }) =>
  r.ok ? "" : (r.code != null && ERRORS[r.code]) || r.error || "خطأ غير معروف";

export async function testAclas(ip: string) {
  const n = native();
  if (!n?.aclasExec) return { ok: false, error: "هذه الميزة تعمل في برنامج Windows فقط" };
  return n.aclasExec(ip, "test", "");
}

export async function sendToAclas(ip?: string) {
  const n = native();
  if (!n?.aclasExec) return { ok: false, error: "هذه الميزة تعمل في برنامج Windows فقط", count: 0 };
  const s = getSettings();
  const list = aclasProducts();
  if (!list.length) return { ok: false, error: "لا توجد منتجات لها رقم PLU", count: 0 };
  const r = await n.aclasExec(ip || s.aclasIp || "", "send", buildPluFile(list, s));
  return { ...r, count: list.length };
}

let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;
/** Sends prices to the scale automatically a few seconds after products change. */
export function startAclasAutoSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("grocery-pos:products-updated", () => {
    const s = getSettings();
    if (!s.aclasEnabled || !s.aclasAutoSend || !s.aclasIp || !native()?.aclasExec) return;
    clearTimeout(timer);
    timer = setTimeout(() => { void sendToAclas().catch(() => {}); }, 3000);
  });
}
