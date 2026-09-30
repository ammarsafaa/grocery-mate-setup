const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const crypto = require("crypto");
const { execSync, spawn } = require("child_process");

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

// Restores a .db backup: replaces the live database file, then relaunches so the app loads it.
ipcMain.handle("restore-db", async () => {
  if (!db || !dbPath) return { ok: false, error: "no-db" };
  const r = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "نسخة احتياطية", extensions: ["db"] }],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false, error: "canceled" };
  try {
    db.close();
    fs.copyFileSync(r.filePaths[0], dbPath);
    // remove stale WAL/SHM so the restored file opens cleanly
    for (const ext of ["-wal", "-shm"]) { try { fs.unlinkSync(dbPath + ext); } catch {} }
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
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

// Extracts the weight in kg from raw scale data (shared by LAN and serial).
function parseWeight(buf) {
  const txt = String(buf).replace(/[^\x20-\x7E\r\n]/g, " ");
  let m = txt.match(/(-?\d+[.,]\d+)\s*(kg|g)?/i);
  if (m) {
    let w = parseFloat(m[1].replace(",", "."));
    if (m[2] && m[2].toLowerCase() === "g") w = w / 1000;
    return Math.abs(w);
  }
  m = txt.match(/(\d{4,7})\s*(kg|g)?/i); // integer grams e.g. 001175
  if (m) return parseInt(m[1], 10) / 1000;
  return null;
}

// Lists available serial (COM) ports via PowerShell — no extra packages needed.
ipcMain.handle("list-serial-ports", () => new Promise((resolve) => {
  const { execFile } = require("child_process");
  execFile("powershell", ["-NoProfile", "-Command", "[System.IO.Ports.SerialPort]::GetPortNames() -join ','"],
    { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(String(stdout).trim().split(",").map((s) => s.trim()).filter(Boolean));
    });
}));

// Runs a PowerShell script from a temp .ps1 file (-File). Passing multi-line scripts
// with quotes/here-strings through -Command gets mangled by Windows argument quoting.
function runPsFile(exe, script, opts, cb) {
  const os = require("os");
  const { execFile } = require("child_process");
  const file = path.join(os.tmpdir(), `zeros-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
  try { fs.writeFileSync(file, "\ufeff" + script, "utf8"); } catch (e) { return cb(e, "", ""); }
  execFile(exe, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { windowsHide: true, ...opts }, (err, stdout, stderr) => {
    try { fs.unlinkSync(file); } catch {}
    cb(err, stdout, stderr);
  });
}
const cleanPsError = (err, stderr) => {
  const t = String(stderr || "").replace(/\s+/g, " ").trim();
  if (t) return t.slice(0, 300);
  if (err && err.killed) return "timeout";
  return String((err && err.message) || "ps-error").split("\n")[0].slice(0, 120);
};

// Reads the weight from a serial (RS232) port via PowerShell.
ipcMain.handle("read-weight-serial", async (_e, com, baud) => {
  const sdk = await readWeightSdk(com, Number(baud) || 9600);
  if (sdk.ok) return sdk;
  const r = await readWeightSerialRaw(com, baud);
  return r.ok ? r : { ...r, error: `SDK: ${sdk.error} | RS232: ${r.error}` };
});
const readWeightSerialRaw = (com, baud) => new Promise((resolve) => {
  if (!/^COM\d{1,2}$/i.test(String(com || ""))) return resolve({ ok: false, error: "no-com" });
  const b = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].includes(Number(baud)) ? Number(baud) : 9600;
  const ps = `
$p = New-Object System.IO.Ports.SerialPort '${String(com).toUpperCase()}',${b},'None',8,'One'
$p.ReadTimeout = 400
$p.DtrEnable = $true
$p.RtsEnable = $true
$p.Encoding = [Text.Encoding]::GetEncoding(28591)
$p.Open()
$sb = New-Object Text.StringBuilder
$reqs = @([byte[]](0x05), [byte[]](0x57,0x0D,0x0A), [byte[]](0x50,0x0D,0x0A), [byte[]](0x52,0x0D,0x0A))
foreach ($q in $reqs) {
  try { $p.Write($q, 0, $q.Length) } catch {}
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.ElapsedMilliseconds -lt 900) {
    try { $s = $p.ReadExisting(); if ($s) { [void]$sb.Append($s) } } catch {}
    Start-Sleep -Milliseconds 60
  }
  if ($sb.Length -gt 0) { break }
}
$p.Close()
[Console]::Out.Write($sb.ToString())
`;
  runPsFile("powershell", ps, { timeout: 12000, encoding: "latin1" }, (err, stdout, stderr) => {
    if (err && !String(stdout || "").trim()) return resolve({ ok: false, error: cleanPsError(err, stderr) });
    const buf = String(stdout || "");
    const w = parseWeight(buf);
    if (w != null) resolve({ ok: true, weight: w, raw: buf });
    else resolve({ ok: false, error: buf.trim() ? "unparsed" : "no-data", raw: buf });
  });
});

// Official Rongta SDK (rtslabelscale.dll, 32-bit): rtscaleConnect + rtscaleGetPluWeight.
// Run through the 32-bit PowerShell that ships with Windows so no extra install is needed.
const SCALE_DIR = app.isPackaged ? path.join(process.resourcesPath, "scale") : path.join(__dirname, "scale");
function readWeightSdk(host, port) {
  return new Promise((resolve) => {
    if (!/^([\d.]{7,15}|COM\d{1,2})$/i.test(String(host || ""))) return resolve({ ok: false, error: "bad-address" });
    // Official SDK: BaudRate 0 = network (IP), otherwise RS232 baud rate.
    const p = /^COM/i.test(String(host)) ? Math.max(1, Math.min(115200, Number(port) || 9600)) : 0;
    const dir = SCALE_DIR.replace(/'/g, "''");
    const ps = `
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath '${dir}'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class RtScale {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern bool SetDllDirectory(string p);
  [DllImport("rtslabelscale.dll", CallingConvention=CallingConvention.StdCall)] public static extern int rtscaleLoadIniFile([MarshalAs(UnmanagedType.LPStr)] string f);
  [DllImport("rtslabelscale.dll", CallingConvention=CallingConvention.StdCall)] public static extern int rtscaleConnect([MarshalAs(UnmanagedType.LPStr)] string addr, int port, ref int connid);
  [DllImport("rtslabelscale.dll", CallingConvention=CallingConvention.StdCall)] public static extern int rtscaleDisConnect(int connid);
  [DllImport("rtslabelscale.dll", CallingConvention=CallingConvention.StdCall)] public static extern int rtscaleGetPluWeight(int connid, ref double w);
}
"@
[void][RtScale]::SetDllDirectory('${dir}')
[void][RtScale]::rtscaleLoadIniFile('${dir}\\SYSTEM.CFG')
$id = 0
$r = [RtScale]::rtscaleConnect('${String(host).toUpperCase()}', ${p}, [ref]$id)
if ($r -ne 0) { [Console]::Out.Write("CONNFAIL:$r"); exit }
$w = 0.0
$r = [RtScale]::rtscaleGetPluWeight($id, [ref]$w)
[void][RtScale]::rtscaleDisConnect($id)
if ($r -ne 0) { [Console]::Out.Write("WFAIL:$r"); exit }
[Console]::Out.Write("W:" + $w.ToString([Globalization.CultureInfo]::InvariantCulture))
`;
    const ps32 = path.join(process.env.WINDIR || "C:\\Windows", "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe");
    const exe = fs.existsSync(ps32) ? ps32 : "powershell";
    runPsFile(exe, ps, { timeout: /^COM/i.test(String(host)) ? 25000 : 12000 }, (err, stdout, stderr) => {
      const out = String(stdout || "").trim();
      const m = out.match(/W:(-?\d+(?:\.\d+)?)/);
      if (m) return resolve({ ok: true, weight: Math.abs(parseFloat(m[1])), raw: "SDK " + out });
      resolve({ ok: false, error: out || cleanPsError(err, stderr), raw: "SDK " + out });
    });
  });
}

ipcMain.handle("read-weight", async (_e, host, port) => {
  const sdk = await readWeightSdk(host, port);
  if (sdk.ok) return sdk;
  const tcp = await readWeightTcp(host, port);
  return tcp.ok ? tcp : { ...tcp, error: `SDK: ${sdk.error} | TCP: ${tcp.error}` };
});

// Fallback: reads whatever the scale sends over raw TCP and extracts the weight in kg.
const readWeightTcp = (host, port) => new Promise((resolve) => {
  let buf = "";
  let finished = false;
  const s = net.createConnection({ host, port: Number(port) }, () => {
    // Some scales stream continuously; others answer a request. Try common ones.
    try { s.write("W\r\n"); s.write("P\r\n"); s.write(Buffer.from([0x05])); } catch {}
  });
  const done = (v) => { if (finished) return; finished = true; s.destroy(); resolve({ raw: buf, ...v }); };
  const parse = () => {
    const txt = buf.replace(/[^\x20-\x7E\r\n]/g, " ");
    let m = txt.match(/(-?\d+[.,]\d+)\s*(kg|g)?/i);
    if (m) {
      let w = parseFloat(m[1].replace(",", "."));
      if (m[2] && m[2].toLowerCase() === "g") w = w / 1000;
      return Math.abs(w);
    }
    m = txt.match(/(\d{4,7})\s*(kg|g)?/i); // integer grams e.g. 001175
    if (m) return parseInt(m[1], 10) / 1000;
    return null;
  };
  s.setTimeout(4000, () => {
    const w = parse();
    done(w != null ? { ok: true, weight: w } : { ok: false, error: buf ? "unparsed" : "no-data" });
  });
  s.on("error", (err) => done({ ok: false, error: err.message }));
  s.on("data", (d) => {
    buf += d.toString("latin1");
    const w = parse();
    if (w != null && /[\r\n]/.test(buf)) done({ ok: true, weight: w });
  });
});

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
    width: 1366, height: 800, autoHideMenuBar: true, show: false,
    title: "زيروس",
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true },
  });
  updWin = win;
  // Show and focus only after the page is ready; otherwise Windows can leave the
  // window unfocused (e.g. when launched from the installer) and typing stops working.
  win.once("ready-to-show", () => { win.maximize(); win.show(); win.focus(); });
  win.on("closed", () => { updWin = null; });
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
