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
}

export interface LicenseState {
  activated: boolean;
  key?: string;
  machineId?: string;
  activatedAt?: string;
}
