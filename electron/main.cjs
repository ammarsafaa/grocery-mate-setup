const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const crypto = require("crypto");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "dist", "client");
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2" };

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split("?")[0]);
      let file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(ROOT, "_shell.html");
      }
      res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(47821, "127.0.0.1", () => resolve("http://127.0.0.1:47821"));
  });
}

function machineId() {
  let raw = "";
  try {
    raw = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid').toString();
  } catch {
    raw = require("os").hostname();
  }
  const h = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 12).toUpperCase();
  return h.match(/.{4}/g).join("-");
}
const MID = machineId();

// ---------- SQLite database ----------
// All app data lives in one file: <userData>/grocery-pos.db
let db = null;
let dbPath = null;

function initDb() {
  const Database = require("better-sqlite3");
  dbPath = path.join(app.getPath("userData"), "grocery-pos.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
}

ipcMain.on("db-get-all", (e) => {
  const rows = db.prepare("SELECT key, value FROM kv").all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  e.returnValue = out;
});

ipcMain.on("db-set", (e, key, value) => {
  db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  e.returnValue = true;
});

// Copies the whole SQLite file to the chosen backup folder (real database backup).
ipcMain.handle("backup-db", async (_e, folder) => {
  if (!db || !dbPath) return { ok: false, error: "no-db" };
  fs.mkdirSync(folder, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const dest = path.join(folder, `grocery-pos-backup-${today}.db`);
  await db.backup(dest);
  return { ok: true, path: dest };
});

ipcMain.on("machine-id", (e) => { e.returnValue = MID; });

ipcMain.handle("pick-folder", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("save-backup", async (_e, folder, name, content) => {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, name), content, "utf8");
  return true;
});

// Reads whatever the scale sends over TCP and extracts the weight in kg.
ipcMain.handle("read-weight", (_e, host, port) => new Promise((resolve) => {
  const s = net.createConnection({ host, port }, () => s.write("W\r\n"));
  let buf = "";
  const done = (v) => { s.destroy(); resolve(v); };
  s.setTimeout(2500, () => done({ ok: false, error: "timeout" }));
  s.on("error", (err) => done({ ok: false, error: err.message }));
  s.on("data", (d) => {
    buf += d.toString("latin1");
    const m = buf.match(/(\d+\.\d+)\s*(kg|g)?/i);
    if (m) {
      let w = parseFloat(m[1]);
      if (m[2] && m[2].toLowerCase() === "g") w = w / 1000;
      done({ ok: true, weight: w, raw: buf });
    }
  });
}));

ipcMain.handle("list-printers", async (event) => {
  return event.sender.getPrintersAsync();
});

ipcMain.handle("print-receipt", async (_event, html, printerName, copies) => {
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await new Promise((resolve) => {
      printWindow.webContents.print({ silent: true, deviceName: printerName || undefined, copies: Math.max(1, Number(copies) || 1), printBackground: true, margins: { marginType: "none" } }, (success, failureReason) => {
        printWindow.close();
        resolve(success ? { ok: true } : { ok: false, error: failureReason });
      });
    });
  } catch (error) {
    if (!printWindow.isDestroyed()) printWindow.close();
    return { ok: false, error: error instanceof Error ? error.message : "print-error" };
  }
});

app.whenReady().then(async () => {
  initDb();
  const url = await startServer();
  const win = new BrowserWindow({
    width: 1366, height: 800, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true },
  });
  win.maximize();
  win.loadURL(url + "/login");
});

app.on("window-all-closed", () => app.quit());
