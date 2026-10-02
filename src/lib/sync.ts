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

function config(): SqlConfig | null {
  const s = getSettings();
  if (!s.syncEnabled || !s.sqlHost || !s.sqlDatabase) return null;
  return { server: s.sqlHost, port: Number(s.sqlPort) || 1433, database: s.sqlDatabase, user: s.sqlUser ?? "", password: s.sqlPassword ?? "" };
}
function terminal() { return (getSettings().terminalCode || "1").trim(); }

async function q(cfg: SqlConfig, sql: string, params: Record<string, unknown> = {}) {
  const n = native();
  if (!n?.sqlQuery) throw new Error("متاح في نسخة Windows فقط");
  const r = await n.sqlQuery(cfg, sql, params);
  if (!r.ok) throw new Error(r.error || "SQL error");
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
  try { await q(cfg, SCHEMA); schemaReady = JSON.stringify(cfg); return { ok: true }; } catch (e) { return { ok: false, error: (e as Error).message }; }
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
        await q(cfg, `MERGE zeros_records AS t USING (SELECT @c AS collection, @id AS id) AS s ON t.collection = s.collection AND t.id = s.id
          WHEN MATCHED THEN UPDATE SET data = @d, deleted = 0, terminal = @t, ver = NEXT VALUE FOR zeros_seq, updated_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (collection, id, data, deleted, terminal, ver) VALUES (@c, @id, @d, 0, @t, NEXT VALUE FOR zeros_seq);`, { c: col, id: r.id, d: data, t: term });
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
        if (col === "products") rec.stock = cur ? cur.stock : 0;
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
export function startSyncLoop() {
  if (timer !== null || typeof window === "undefined") return;
  const tick = () => { if (config()) void syncNow(); else if (status.state !== "off") setStatus({ state: "off", pending: 0 }); };
  tick();
  timer = window.setInterval(tick, 5000);
}
