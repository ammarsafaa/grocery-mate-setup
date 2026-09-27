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
    // fixed port keeps localStorage (the data) on the same origin across runs
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

app.whenReady().then(async () => {
  const url = await startServer();
  const win = new BrowserWindow({
    width: 1366, height: 800, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true },
  });
  win.maximize();
  win.loadURL(url + "/login");
});

app.on("window-all-closed", () => app.quit());
