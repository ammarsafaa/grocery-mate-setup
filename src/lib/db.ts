import type {
  PosUser,
  Product,
  Sale,
  Shift,
  Settings,
  LicenseState,
} from "./types";

/**
 * Local data layer. In the browser preview it persists to localStorage.
 * In the Electron build the same API is backed by a SQLite database file,
 * so the exe keeps a real local database with automatic backups.
 */

const PREFIX = "grocery-pos:";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
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
  return read<Product[]>("products", seedProducts());
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
  scaleIp: "192.168.1.50",
  scalePort: 9000,
};

export function getSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>("settings", {}) };
}

export function saveSettings(s: Settings) {
  write("settings", s);
}

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
  const n = (window as unknown as { posNative?: { saveBackup: (f: string, n: string, c: string) => Promise<boolean> } }).posNative;
  if (n && s.backupFolder) {
    // Windows app: silent save into the chosen folder
    n.saveBackup(s.backupFolder, `backup-${today}.json`, exportBackup()).then(() =>
      saveSettings({ ...getSettings(), lastBackupAt: today }),
    );
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
