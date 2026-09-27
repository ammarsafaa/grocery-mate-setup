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
});
