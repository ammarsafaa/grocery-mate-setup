/**
 * Multi-cashier sync with an in-store SQL Server.
 * Each cashier keeps its local SQLite store (works offline); this module pushes
 * local changes and pulls other cashiers' changes every few seconds.
 * Products' stock is synced as deltas so concurrent sales never overwrite each other.
 */
import { native, type SqlConfig } from "./native";
import { getSettings, readCollection, writeCollection, readMeta, writeMeta } from "./db";

const COLLECTIONS = ["products", "groups", "users", "suppliers", "sales", "stockMovements", "shifts", "expenses", "purchases", "supplierPayments"] as const;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = { id: string; stock?: number; [k: string]: any };
type Row = Record<string, any> & { ver?: any; collection?: any; id?: any; deleted?: any; data?: any; product_id?: any; stock?: any };
type Meta = { lastVer: number; hashes: Record<string, Record<string, number>>; stockBase: Record<string, number> };

export type SyncStatus = { state: "off" | "ok" | "error" | "syncing"; pending: number; lastAt?: string; error?: string };
let status: SyncStatus = { state: "off", pending: 0 };
export function getSyncStatus() { return status; }
function setStatus(s: SyncStatus) { status = s; window.dispatchEvent(new CustomEvent("grocery-pos:sync-status")); }

function hash(s: string): number { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; }
function recHash(col: string, r: Rec) { if (col === "products") { const { stock: _s, ...rest } = r; return hash(JSON.stringify(rest)); } return hash(JSON.stringify(r)); }

/**
 * The on/off state of the link lives in its own record (not inside the settings object),
 * so saving any other setting from a stale settings screen can never switch the link off.
 * It turns on after any successful connection and only turns off when the admin unticks it.
 */
export function isSyncLinked(): boolean {
  const v = readMeta<boolean | null>("syncLinked", null);
  if (v !== null) return v;
  const s = getSettings();
  return !!s.syncEnabled || s.sqlSetup === "done";
}
export function setSyncLinked(on: boolean) {
  writeMeta("syncLinked", on);
  if (!on) setStatus({ state: "off", pending: 0 });
}

/**
 * Main cashier = SQL Server on this same device. When the choice was never saved explicitly,
 * a device without a server IP is the main one (matches what the settings screen shows).
 */
export function isMainCashier(s = getSettings()): boolean {
  if (s.sqlIsMain === true) return true;
  if (s.sqlIsMain === false) return false;
  return !(s.sqlHost ?? "").trim();
}

function config(): SqlConfig | null {
  const s = getSettings();
  if (!isSyncLinked()) return null;
  const main = isMainCashier(s);
  const server = main ? ".\\SQLEXPRESS" : (s.sqlHost ?? "").trim();
  if (!server) return null;
  return { server, port: main ? 1433 : Number(s.sqlPort) || 1433, database: (s.sqlDatabase || "GroceryPOS").trim(), user: s.sqlUser || "sa", password: s.sqlPassword ?? "" };
}
function terminal() { return (getSettings().terminalCode || "1").trim(); }

/** Turns technical SQL Server errors into clear Arabic messages. */
export function friendlySqlError(msg: string): string {
  const m = String(msg);
  if (/BADNAME/.test(m)) return "اسم القاعدة يجب أن يكون بأحرف إنجليزية وأرقام فقط بدون مسافات (مثل GroceryPOS)";
  if (/Login failed/i.test(m)) return "اسم المستخدم أو كلمة المرور لخادم SQL غير صحيحة";
  if (/CREATE DATABASE permission|permission denied/i.test(m)) return "المستخدم لا يملك صلاحية إنشاء قاعدة البيانات — استخدم المستخدم sa";
  if (/ETIMEOUT|timeout|Failed to connect|ECONNREFUSED|ESOCKET|getaddrinfo|ENOTFOUND/i.test(m)) {
    const main = isMainCashier();
    const hint = main
      ? "لا يمكن الاتصال بـ SQL Server على هذا الجهاز — اضغط زر «إصلاح إعدادات SQL Server تلقائياً» ثم أعد المحاولة"
      : "لا يمكن الوصول للجهاز الرئيسي — تأكد من IP، وأن البرنامج على الجهاز الرئيسي ضغط «إصلاح إعدادات SQL Server تلقائياً»";
    return `${hint}\nالتفاصيل: ${m.slice(0, 400)}`;
  }
  return m;
}

async function q(cfg: SqlConfig, sql: string, params: Record<string, unknown> = {}) {
  const n = native();
  if (!n?.sqlQuery) throw new Error("متاح في نسخة Windows فقط");
  // Never wait forever: a hung call would block every later automatic retry.
  const r = await Promise.race([
    n.sqlQuery(cfg, sql, params),
    new Promise<{ ok: false; error: string }>((res) => setTimeout(() => res({ ok: false, error: "ETIMEOUT: no answer from SQL Server" }), 60000)),
  ]);
  if (!r.ok) throw new Error(friendlySqlError(r.error || "SQL error"));
  return (r.rows ?? []) as Row[];
}

const SCHEMA = `
IF OBJECT_ID('zeros_seq') IS NULL EXEC('CREATE SEQUENCE zeros_seq AS BIGINT START WITH 1 INCREMENT BY 1');
IF OBJECT_ID('zeros_records') IS NULL CREATE TABLE zeros_records (collection NVARCHAR(50) NOT NULL, id NVARCHAR(100) NOT NULL, data NVARCHAR(MAX) NULL, deleted BIT NOT NULL DEFAULT 0, terminal NVARCHAR(50) NULL, ver BIGINT NOT NULL, updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), PRIMARY KEY (collection, id));
IF OBJECT_ID('zeros_stock') IS NULL CREATE TABLE zeros_stock (product_id NVARCHAR(100) NOT NULL PRIMARY KEY, stock FLOAT NOT NULL, ver BIGINT NOT NULL);
`;
let schemaReady = "";

export async function testSqlConnection(): Promise<{ ok: boolean; error?: string }> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "فعّل الربط واكتب عنوان الخادم واسم القاعدة" };
  try { await q(cfg, SCHEMA); schemaReady = JSON.stringify(cfg); writeMeta("syncLinked", true); return { ok: true }; } catch (e) { return { ok: false, error: (e as Error).message }; }
}

let running = false;
export async function syncNow(): Promise<boolean> {
  const cfg = config();
  if (!cfg || !native()?.sqlQuery) { setStatus({ state: "off", pending: 0 }); return false; }
  if (running) return false;
  running = true;
  const term = terminal();
  try {
    if (schemaReady !== JSON.stringify(cfg)) { await q(cfg, SCHEMA); schemaReady = JSON.stringify(cfg); }
    const meta = readMeta<Meta>("sync", { lastVer: 0, hashes: {}, stockBase: {} });
    const snapshots: Record<string, Map<string, number>> = {};
    let pending = 0;

    // ---- Push records ----
    for (const col of COLLECTIONS) {
      const local = readCollection<Rec>(col);
      const known = meta.hashes[col] ?? (meta.hashes[col] = {});
      const snap = new Map<string, number>();
      for (const r of local) {
        const h = recHash(col, r);
        snap.set(r.id, h);
        if (known[r.id] === h) continue;
        pending++;
        const data = col === "products" ? JSON.stringify({ ...r, stock: undefined }) : JSON.stringify(r);
        // SQL Server forbids NEXT VALUE FOR inside MERGE, so take the number first, then update or insert.
        await q(cfg, `DECLARE @nv BIGINT = NEXT VALUE FOR zeros_seq;
          UPDATE zeros_records SET data = @d, deleted = 0, terminal = @t, ver = @nv, updated_at = SYSUTCDATETIME() WHERE collection = @c AND id = @id;
          IF @@ROWCOUNT = 0 INSERT INTO zeros_records (collection, id, data, deleted, terminal, ver) VALUES (@c, @id, @d, 0, @t, @nv);`, { c: col, id: r.id, d: data, t: term });
        known[r.id] = h;
      }
      for (const id of Object.keys(known)) {
        if (snap.has(id)) continue;
        await q(cfg, `UPDATE zeros_records SET deleted = 1, data = NULL, terminal = @t, ver = NEXT VALUE FOR zeros_seq WHERE collection = @c AND id = @id`, { c: col, id, t: term });
        delete known[id];
      }
      snapshots[col] = snap;
    }

    // ---- Push stock deltas ----
    const stockSnap = new Map<string, number>();
    for (const p of readCollection<Rec>("products")) {
      const stock = Number(p.stock) || 0;
      stockSnap.set(p.id, stock);
      const base = meta.stockBase[p.id];
      if (base === undefined) {
        await q(cfg, `IF NOT EXISTS (SELECT 1 FROM zeros_stock WHERE product_id = @id) INSERT INTO zeros_stock (product_id, stock, ver) VALUES (@id, @s, NEXT VALUE FOR zeros_seq)`, { id: p.id, s: stock });
      } else if (Math.abs(stock - base) > 1e-9) {
        await q(cfg, `UPDATE zeros_stock SET stock = stock + @d, ver = NEXT VALUE FOR zeros_seq WHERE product_id = @id`, { id: p.id, d: stock - base });
      }
    }

    // ---- Pull ----
    const recs = await q(cfg, `SELECT collection, id, data, deleted, ver FROM zeros_records WHERE ver > @v`, { v: meta.lastVer });
    const stocks = await q(cfg, `SELECT product_id, stock, ver FROM zeros_stock WHERE ver > @v OR @v = 0 OR product_id IN (SELECT id FROM zeros_records WHERE collection = 'products' AND ver > @v)`, { v: meta.lastVer });
    let maxVer = meta.lastVer;
    const byCol = new Map<string, Row[]>();
    for (const r of recs) { maxVer = Math.max(maxVer, Number(r.ver)); const arr = byCol.get(String(r.collection)) ?? []; arr.push(r); byCol.set(String(r.collection), arr); }
    for (const s of stocks) maxVer = Math.max(maxVer, Number(s.ver));

    for (const col of COLLECTIONS) {
      const incoming = byCol.get(col);
      if (!incoming?.length && !(col === "products" && stocks.length)) continue;
      const known = meta.hashes[col] ?? (meta.hashes[col] = {});
      const snap = snapshots[col] ?? new Map<string, number>();
      const local = readCollection<Rec>(col);
      const map = new Map(local.map((r) => [r.id, r]));
      for (const r of incoming ?? []) {
        const id = String(r.id);
        const cur = map.get(id);
        // Skip if this record was edited locally while syncing (it will be pushed next round).
        if (cur && snap.get(id) !== recHash(col, cur)) continue;
        if (r.deleted) { map.delete(id); delete known[id]; continue; }
        const rec = JSON.parse(String(r.data)) as Rec;
        if (col === "products") rec.stock = cur ? Number(cur.stock) || 0 : 0;
        map.set(id, rec);
        known[id] = recHash(col, rec);
      }
      if (col === "products") {
        for (const s of stocks) {
          const id = String(s.product_id);
          const p = map.get(id);
          const server = Number(s.stock);
          if (!p) { meta.stockBase[id] = server; continue; }
          const unpushed = (Number(p.stock) || 0) - (stockSnap.get(id) ?? server);
          map.set(id, { ...p, stock: Math.max(0, server + unpushed) });
          meta.stockBase[id] = server;
        }
        for (const [id, s] of stockSnap) if (meta.stockBase[id] === undefined) meta.stockBase[id] = s;
      }
      writeCollection(col, [...map.values()]);
    }
    meta.lastVer = maxVer;
    writeMeta("sync", meta);
    // Persist the link as enabled after a successful sync so it reconnects after restart.
    writeMeta("syncLinked", true);
    setStatus({ state: "ok", pending: 0, lastAt: new Date().toISOString() });
    void pending;
    return true;
  } catch (e) {
    setStatus({ state: "error", pending: 0, error: (e as Error).message });
    return false;
  } finally {
    running = false;
  }
}

let timer: number | null = null;
/** Starts automatic connection on app start; keeps retrying (every 3 s) until SQL Server answers, then syncs every 5 s. */
export function startSyncLoop() {
  if (timer !== null || typeof window === "undefined") return;
  const tick = async () => {
    if (config()) await syncNow(); else if (status.state !== "off") setStatus({ state: "off", pending: 0 });
    timer = window.setTimeout(tick, status.state === "ok" ? 5000 : 3000);
  };
  timer = window.setTimeout(tick, 0);
  window.addEventListener("online", () => { if (config()) void syncNow(); });
  window.addEventListener("grocery-pos:settings-updated", () => { if (config() && status.state !== "ok") void syncNow(); });
}
