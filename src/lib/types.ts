export type UserRole = "admin" | "cashier";

export interface PosUser {
  id: string;
  name: string;
  pin: string; // numbers only
  role: UserRole;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  barcode?: string;
  price: number; // per unit or per kg
  unit: "piece" | "kg";
  category: string;
  stock: number;
  active: boolean;
  image?: string | undefined; // small data URL
  groupId?: string | undefined;
  costPrice?: number;
  minStock?: number;
}

export interface ProductGroup {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
  active: boolean;
}

export interface CartItem {
  productId: string;
  name: string;
  unit: "piece" | "kg";
  price: number;
  qty: number; // pieces or weight in kg
  total: number;
}

export interface Sale {
  id: string;
  number: number;
  shiftId: string;
  userId: string;
  userName: string;
  items: CartItem[];
  total: number;
  createdAt: string; // ISO
  paid?: number;
  change?: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  active: boolean;
}

export interface PurchaseItem {
  productId: string;
  name: string;
  unit: "piece" | "kg";
  qty: number;
  cost: number;
  total: number;
}

export interface Purchase {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  total: number;
  paid: number;
  balance: number;
  createdAt: string;
  status: "posted" | "cancelled";
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  amount: number;
  note?: string;
  createdAt: string;
}

export type StockMovementType = "purchase" | "sale" | "return" | "adjustment" | "damage" | "purchase-cancel";

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  qty: number;
  balanceAfter: number;
  referenceId?: string;
  note?: string;
  userName?: string;
  createdAt: string;
}

export type ReceiptElementType = "logo" | "store" | "contact" | "invoice" | "date" | "cashier" | "items" | "totals" | "footer";

export interface ReceiptElement {
  id: ReceiptElementType;
  label: string;
  visible: boolean;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  align: "right" | "center" | "left";
  spacing: number;
  divider: boolean;
}

export interface ReceiptDesign {
  paperWidth: 58 | 80;
  elements: ReceiptElement[];
  tableBorders?: boolean;
  logo?: string;
  address: string;
  phone: string;
  footer: string;
}

export interface Shift {
  id: string;
  userId: string;
  userName: string;
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  closingCash?: number;
  salesTotal?: number;
  salesCount?: number;
}

export interface Settings {
  storeName: string;
  currency: string;
  backupFolder: string;
  autoBackup: boolean;
  lastBackupAt?: string;
  scaleIp: string;
  scalePort: number;
  useProductGroups: boolean;
  colorPreset: "emerald" | "blue" | "red" | "amber" | "custom";
  colorMode: "dark" | "light";
  customColor: string;
  productFont: "Cairo" | "Tajawal" | "Noto Kufi Arabic" | "Arial";
  productFontSize: number;
  printerName: string;
  paperWidth: 58 | 80;
  autoPrint: boolean;
  printCopies: number;
  autoCut: boolean;
  openDrawer: boolean;
}

export interface LicenseState {
  activated: boolean;
  key?: string;
  machineId?: string;
  activatedAt?: string;
}
