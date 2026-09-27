const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posNative", {
  machineId: () => ipcRenderer.sendSync("machine-id"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  saveBackup: (folder, name, content) => ipcRenderer.invoke("save-backup", folder, name, content),
  readWeight: (host, port) => ipcRenderer.invoke("read-weight", host, port),
});
