const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posNative", {
  machineId: () => ipcRenderer.sendSync("machine-id"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  saveBackup: (folder, name, content) => ipcRenderer.invoke("save-backup", folder, name, content),
  readWeight: (host, port) => ipcRenderer.invoke("read-weight", host, port),
  // SQLite-backed storage (synchronous so the UI code stays simple)
  dbGetAll: () => ipcRenderer.sendSync("db-get-all"),
  dbSet: (key, value) => ipcRenderer.sendSync("db-set", key, value),
  backupDb: (folder) => ipcRenderer.invoke("backup-db", folder),
  listPrinters: () => ipcRenderer.invoke("list-printers"),
  printReceipt: (html, printerName, copies) => ipcRenderer.invoke("print-receipt", html, printerName, copies),
  onCloseRequested: (cb) => {
    const h = () => cb();
    ipcRenderer.on("app-close-requested", h);
    return () => ipcRenderer.removeListener("app-close-requested", h);
  },
  quitApp: () => ipcRenderer.send("confirm-quit"),
  appVersion: () => ipcRenderer.sendSync("app-version"),
  checkUpdate: () => ipcRenderer.invoke("update-check"),
  downloadUpdate: () => ipcRenderer.invoke("update-download"),
  installUpdate: () => ipcRenderer.send("update-install"),
  onUpdateStatus: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on("update-status", h);
    return () => ipcRenderer.removeListener("update-status", h);
  },
});
