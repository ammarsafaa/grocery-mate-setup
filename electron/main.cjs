const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const crypto = require("crypto");
const { execSync } = require("child_process");

// In an installed build, the UI is copied to resources/app so it cannot be
// omitted from app.asar. Development still reads the normal Vite output.
const ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..", "dist", "client");
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
  // Thermal printers print blank with "size: Xmm auto" + data: URLs, so we load
  // from a temp file, wait for rendering, and pass an explicit page size.
  const widthMm = Number((String(html).match(/size:(\d+)mm/) || [])[1]) || 80;
  const cleanHtml = String(html).replace(/@page\{[^}]*\}/, `@page{size:${widthMm}mm auto;margin:0}`);
  const tmp = path.join(app.getPath("temp"), `zeros-print-${Date.now()}.html`);
  fs.writeFileSync(tmp, cleanHtml, "utf8");
  const printWindow = new BrowserWindow({ show: false, width: 400, height: 800, webPreferences: { sandbox: true } });
  try {
    await printWindow.loadFile(tmp);
    await new Promise((r) => setTimeout(r, 400));
    const heightPx = await printWindow.webContents.executeJavaScript("document.fonts.ready.then(() => Math.ceil(document.documentElement.scrollHeight))");
    const heightMicrons = Math.max(50000, Math.ceil((heightPx / 96) * 25400) + 10000);
    return await new Promise((resolve) => {
      printWindow.webContents.print({
        silent: true, deviceName: printerName || undefined, copies: Math.max(1, Number(copies) || 1),
        printBackground: true, margins: { marginType: "none" },
        pageSize: { width: widthMm * 1000, height: heightMicrons },
      }, (success, failureReason) => {
        printWindow.close();
        fs.rm(tmp, () => {});
        resolve(success ? { ok: true } : { ok: false, error: failureReason });
      });
    });
  } catch (error) {
    if (!printWindow.isDestroyed()) printWindow.close();
    fs.rm(tmp, () => {});
    return { ok: false, error: error instanceof Error ? error.message : "print-error" };
  }
});

// ---- Auto updates (GitHub Releases). Only needs internet while updating ----
let updater = null;
try { updater = require("electron-updater").autoUpdater; updater.autoDownload = false; } catch { updater = null; }
let updWin = null;
function sendUpd(s) { if (updWin && !updWin.isDestroyed()) updWin.webContents.send("update-status", s); }
if (updater) {
  updater.on("update-available", (i) => sendUpd({ state: "available", version: i.version }));
  updater.on("update-not-available", () => sendUpd({ state: "none" }));
  updater.on("download-progress", (p) => sendUpd({ state: "downloading", percent: Math.round(p.percent) }));
  updater.on("update-downloaded", (i) => sendUpd({ state: "ready", version: i.version }));
  updater.on("error", (e) => sendUpd({ state: "error", error: String(e && e.message || e) }));
}
ipcMain.on("app-version", (e) => { e.returnValue = app.getVersion(); });
ipcMain.handle("update-check", async () => {
  if (!updater) return { ok: false, error: "no-updater" };
  try { await updater.checkForUpdates(); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle("update-download", async () => { try { await updater.downloadUpdate(); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message || e) }; } });
ipcMain.on("update-install", () => { allowQuitGlobal = true; updater.quitAndInstall(false, true); });
let allowQuitGlobal = false;

app.whenReady().then(async () => {
  initDb();
  const url = await startServer();
  const win = new BrowserWindow({
    width: 1366, height: 800, autoHideMenuBar: true,
    title: "زيروس",
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true },
  });
  updWin = win;
  win.maximize();
  win.loadURL(url + "/login");
  // Ask the app to force closing the shift + printing the day report before quitting
  let allowQuit = false;
  win.on("close", (e) => {
    if (allowQuit || allowQuitGlobal) return;
    e.preventDefault();
    win.webContents.send("app-close-requested");
  });
  ipcMain.on("confirm-quit", () => { allowQuit = true; win.close(); });
});

app.on("window-all-closed", () => app.quit());
