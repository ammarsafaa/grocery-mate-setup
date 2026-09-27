import type {
  PosUser,
  Product,
  Sale,
  Shift,
  Settings,
  LicenseState,
  ProductGroup,
  Purchase,
  Supplier,
  SupplierPayment,
  StockMovement,
  ReceiptDesign,
} from "./types";

/**
 * Local data layer. In the browser preview it persists to localStorage.
 * In the Electron build the same API is backed by a SQLite database file,
 * so the exe keeps a real local database with automatic backups.
 */

const PREFIX = "grocery-pos:";

type NativeBridge = {
  dbGetAll: () => Record<string, string>;
  dbSet: (key: string, value: string) => boolean;
  backupDb: (folder: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  saveBackup: (f: string, n: string, c: string) => Promise<boolean>;
};

function native(): NativeBridge | null {
  const n = (window as unknown as { posNative?: NativeBridge }).posNative;
  return n && typeof n.dbGetAll === "function" ? n : null;
}

// In the Windows app, SQLite rows are mirrored into memory once at startup
// so the rest of the code keeps a simple synchronous API.
let sqliteCache: Record<string, string> | null = null;

function store(): Record<string, string> {
  const n = native();
  if (n) {
    if (!sqliteCache) {
      try {
        sqliteCache = n.dbGetAll() ?? {};
      } catch {
        sqliteCache = {};
      }
    }
    return sqliteCache;
  }
  // Browser preview fallback: localStorage
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = localStorage.getItem(k) ?? "";
  }
  return out;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = store()[key];
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  const json = JSON.stringify(value);
  const n = native();
  if (n && sqliteCache) {
    sqliteCache[key] = json;
    n.dbSet(key, json);
    return;
  }
  localStorage.setItem(PREFIX + key, json);
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------- Users ----------
const DEFAULT_ADMIN: PosUser = {
  id: "admin",
  name: "المدير",
  pin: "1234",
  role: "admin",
  active: true,
};

export function getUsers(): PosUser[] {
  const users = read<PosUser[]>("users", []);
  if (!users.some((u) => u.role === "admin")) return [DEFAULT_ADMIN, ...users];
  return users;
}

export function saveUsers(users: PosUser[]) {
  write("users", users);
}

// ---------- Products ----------
export function getProducts(): Product[] {
  const saved = read<Product[] | null>("products", null);
  return saved ?? seedProducts();
}

function seedProducts(): Product[] {
  const seeds: Product[] = [
    { id: uid(), name: "طماطة", price: 1500, unit: "kg", category: "خضروات", stock: 50, active: true },
    { id: uid(), name: "خيار", price: 1250, unit: "kg", category: "خضروات", stock: 40, active: true },
    { id: uid(), name: "بطاطة", price: 1000, unit: "kg", category: "خضروات", stock: 80, active: true },
    { id: uid(), name: "بصل", price: 900, unit: "kg", category: "خضروات", stock: 60, active: true },
    { id: uid(), name: "موز", price: 2000, unit: "kg", category: "فواكه", stock: 30, active: true },
    { id: uid(), name: "تفاح", price: 2500, unit: "kg", category: "فواكه", stock: 25, active: true },
    { id: uid(), name: "برتقال", price: 1750, unit: "kg", category: "فواكه", stock: 35, active: true },
    { id: uid(), name: "حليب", price: 1500, unit: "piece", category: "ألبان", stock: 48, active: true, barcode: "1001" },
    { id: uid(), name: "خبز", price: 500, unit: "piece", category: "مخبوزات", stock: 100, active: true, barcode: "1002" },
    { id: uid(), name: "أرز 5 كغم", price: 12000, unit: "piece", category: "مواد غذائية", stock: 20, active: true, barcode: "1003" },
    { id: uid(), name: "سكر 1 كغم", price: 1500, unit: "piece", category: "مواد غذائية", stock: 40, active: true, barcode: "1004" },
    { id: uid(), name: "شاي", price: 4000, unit: "piece", category: "مشروبات", stock: 30, active: true, barcode: "1005" },
  ];
  write("products", seeds);
  return seeds;
}

export function saveProducts(products: Product[]) {
  write("products", products);
  window.dispatchEvent(new CustomEvent("grocery-pos:products-updated"));
}

// ---------- Product groups ----------
export function getGroups(): ProductGroup[] {
  const saved = read<ProductGroup[] | null>("groups", null);
  if (saved) return saved.slice().sort((a, b) => a.order - b.order);
  const names = [...new Set(getProducts().map((p) => p.category).filter(Boolean))];
  const groups = names.map((name, order) => ({ id: uid(), name, color: "primary", icon: "package", order, active: true }));
  write("groups", groups);
  if (groups.length) {
    const byName = new Map(groups.map((g) => [g.name, g.id]));
    saveProducts(getProducts().map((p) => ({ ...p, groupId: p.groupId ?? byName.get(p.category) })));
  }
  return groups;
}

export function saveGroups(groups: ProductGroup[]) {
  write("groups", groups);
  window.dispatchEvent(new CustomEvent("grocery-pos:groups-updated"));
}

// ---------- Sales ----------
export function getSales(): Sale[] {
  return read<Sale[]>("sales", []);
}

export function addSale(sale: Sale) {
  const sales = getSales();
  sales.push(sale);
  write("sales", sales);
}

// ---------- Suppliers, purchases and stock ----------
export function getSuppliers(): Supplier[] { return read<Supplier[]>("suppliers", []); }
export function saveSuppliers(items: Supplier[]) { write("suppliers", items); }
export function getPurchases(): Purchase[] { return read<Purchase[]>("purchases", []); }
export function savePurchases(items: Purchase[]) { write("purchases", items); }
export function getSupplierPayments(): SupplierPayment[] { return read<SupplierPayment[]>("supplierPayments", []); }
export function saveSupplierPayments(items: SupplierPayment[]) { write("supplierPayments", items); }
export function getStockMovements(): StockMovement[] { return read<StockMovement[]>("stockMovements", []); }
export function saveStockMovements(items: StockMovement[]) { write("stockMovements", items); }

export function postPurchase(purchase: Purchase, userName: string) {
  savePurchases([...getPurchases(), purchase]);
  const movements = getStockMovements();
  const products = getProducts().map((product) => {
    const item = purchase.items.find((x) => x.productId === product.id);
    if (!item) return product;
    const stock = product.stock + item.qty;
    movements.push({ id: uid(), productId: product.id, productName: product.name, type: "purchase", qty: item.qty, balanceAfter: stock, referenceId: purchase.id, userName, createdAt: purchase.createdAt });
    return { ...product, stock, costPrice: item.cost };
  });
  saveProducts(products);
  saveStockMovements(movements);
}

export function cancelPurchase(id: string, userName: string): boolean {
  const purchases = getPurchases();
  const purchase = purchases.find((p) => p.id === id && p.status === "posted");
  if (!purchase) return false;
  const movements = getStockMovements();
  const products = getProducts().map((product) => {
    const item = purchase.items.find((x) => x.productId === product.id);
    if (!item) return product;
    const stock = Math.max(0, product.stock - item.qty);
    movements.push({ id: uid(), productId: product.id, productName: product.name, type: "purchase-cancel", qty: -item.qty, balanceAfter: stock, referenceId: purchase.id, userName, createdAt: new Date().toISOString() });
    return { ...product, stock };
  });
  saveProducts(products);
  saveStockMovements(movements);
  savePurchases(purchases.map((p) => p.id === id ? { ...p, status: "cancelled" } : p));
  return true;
}

export function adjustStock(productId: string, newQty: number, reason: string, userName: string) {
  const products = getProducts();
  const product = products.find((p) => p.id === productId);
  if (!product) return false;
  const qty = newQty - product.stock;
  saveProducts(products.map((p) => p.id === productId ? { ...p, stock: newQty } : p));
  saveStockMovements([...getStockMovements(), { id: uid(), productId, productName: product.name, type: reason === "تلف" ? "damage" : "adjustment", qty, balanceAfter: newQty, note: reason, userName, createdAt: new Date().toISOString() }]);
  return true;
}

export function recordSaleMovements(sale: Sale) {
  const products = getProducts();
  const movements = getStockMovements();
  for (const item of sale.items) {
    const product = products.find((p) => p.id === item.productId);
    if (product) movements.push({ id: uid(), productId: item.productId, productName: item.name, type: "sale", qty: -item.qty, balanceAfter: Math.max(0, product.stock - item.qty), referenceId: sale.id, userName: sale.userName, createdAt: sale.createdAt });
  }
  saveStockMovements(movements);
}

export function nextSaleNumber(): number {
  const sales = getSales();
  return sales.length ? Math.max(...sales.map((s) => s.number)) + 1 : 1;
}

// ---------- Shifts ----------
export function getShifts(): Shift[] {
  return read<Shift[]>("shifts", []);
}

export function saveShifts(shifts: Shift[]) {
  write("shifts", shifts);
}

export function getOpenShift(): Shift | undefined {
  return getShifts().find((s) => !s.closedAt);
}

// ---------- Settings ----------
const DEFAULT_SETTINGS: Settings = {
  storeName: "بقالة النور",
  currency: "د.ع",
  backupFolder: "",
  autoBackup: true,
  scaleIp: "192.168.1.87",
  scalePort: 3001,
  useProductGroups: false,
  colorPreset: "emerald",
  colorMode: "dark",
  customColor: "#10b981",
  productFont: "Cairo",
  productFontSize: 16,
  printerName: "",
  paperWidth: 80,
  autoPrint: false,
  printCopies: 1,
  autoCut: true,
  openDrawer: false,
};

export function getSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>("settings", {}) };
}

export function saveSettings(s: Settings) {
  write("settings", s);
  window.dispatchEvent(new CustomEvent("grocery-pos:settings-updated"));
}

const DEFAULT_RECEIPT_ELEMENTS: ReceiptDesign["elements"] = [
  { id: "logo", label: "الشعار", visible: true, fontSize: 12, fontFamily: "Cairo", bold: false, align: "center", spacing: 4, divider: false },
  { id: "store", label: "اسم المتجر", visible: true, fontSize: 20, fontFamily: "Cairo", bold: true, align: "center", spacing: 4, divider: false },
  { id: "contact", label: "العنوان والهاتف", visible: true, fontSize: 11, fontFamily: "Cairo", bold: false, align: "center", spacing: 5, divider: true },
  { id: "invoice", label: "رقم الفاتورة", visible: true, fontSize: 12, fontFamily: "Cairo", bold: true, align: "right", spacing: 2, divider: false },
  { id: "date", label: "التاريخ والوقت", visible: true, fontSize: 11, fontFamily: "Cairo", bold: false, align: "right", spacing: 2, divider: false },
  { id: "cashier", label: "اسم الكاشير", visible: true, fontSize: 11, fontFamily: "Cairo", bold: false, align: "right", spacing: 5, divider: true },
  { id: "items", label: "جدول المنتجات", visible: true, fontSize: 11, fontFamily: "Cairo", bold: false, align: "right", spacing: 5, divider: true },
  { id: "totals", label: "الإجمالي والمدفوع والباقي", visible: true, fontSize: 14, fontFamily: "Cairo", bold: true, align: "right", spacing: 5, divider: true },
  { id: "footer", label: "الرسالة الختامية", visible: true, fontSize: 11, fontFamily: "Cairo", bold: false, align: "center", spacing: 2, divider: false },
];

export function getReceiptDesign(width: 58 | 80): ReceiptDesign {
  return read<ReceiptDesign>(`receiptDesign:${width}`, { paperWidth: width, elements: DEFAULT_RECEIPT_ELEMENTS.map((e) => ({ ...e })), address: "", phone: "", footer: "شكراً لتسوقكم معنا" });
}
export function saveReceiptDesign(design: ReceiptDesign) { write(`receiptDesign:${design.paperWidth}`, design); }

// ---------- License ----------
export function getLicense(): LicenseState {
  return read<LicenseState>("license", { activated: false });
}

export function saveLicense(l: LicenseState) {
  write("license", l);
}

// ---------- Session ----------
export function getSessionUserId(): string | null {
  return read<string | null>("session", null);
}

export function setSessionUserId(id: string | null) {
  write("session", id);
}

// ---------- Backup ----------
export function exportBackup(): string {
  const data = {
    exportedAt: new Date().toISOString(),
    users: getUsers(),
    products: getProducts(),
    sales: getSales(),
    shifts: getShifts(),
    settings: getSettings(),
    groups: getGroups(),
    suppliers: getSuppliers(),
    purchases: getPurchases(),
    supplierPayments: getSupplierPayments(),
    stockMovements: getStockMovements(),
    receipt58: getReceiptDesign(58),
    receipt80: getReceiptDesign(80),
  };
  return JSON.stringify(data, null, 2);
}

export function importBackup(json: string): boolean {
  try {
    const data = JSON.parse(json);
    if (data.users) write("users", data.users);
    if (data.products) write("products", data.products);
    if (data.sales) write("sales", data.sales);
    if (data.shifts) write("shifts", data.shifts);
    if (data.settings) write("settings", data.settings);
    if (data.groups) write("groups", data.groups);
    if (data.suppliers) write("suppliers", data.suppliers);
    if (data.purchases) write("purchases", data.purchases);
    if (data.supplierPayments) write("supplierPayments", data.supplierPayments);
    if (data.stockMovements) write("stockMovements", data.stockMovements);
    if (data.receipt58) write("receiptDesign:58", data.receipt58);
    if (data.receipt80) write("receiptDesign:80", data.receipt80);
    return true;
  } catch {
    return false;
  }
}

/** Automatic backup: downloads a dated JSON copy once per day when enabled. */
export function maybeAutoBackup() {
  const s = getSettings();
  if (!s.autoBackup) return;
  const today = new Date().toISOString().slice(0, 10);
  if (s.lastBackupAt === today) return;
  const n = native();
  if (n && s.backupFolder) {
    // Windows app: copy the real SQLite database file into the chosen folder
    n.backupDb(s.backupFolder).then((r) => {
      if (r.ok) saveSettings({ ...getSettings(), lastBackupAt: today });
    });
    return;
  }
  const blob = new Blob([exportBackup()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `backup-${today}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  saveSettings({ ...s, lastBackupAt: today });
}

export function formatMoney(n: number, currency?: string): string {
  const c = currency ?? getSettings().currency;
  return `${n.toLocaleString("ar-IQ")} ${c}`;
}
