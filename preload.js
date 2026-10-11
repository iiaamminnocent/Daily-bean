const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('DailyBeanNative', {
    getStoragePath: () => ipcRenderer.invoke('get-storage-path'),
    selectStorageFolder: () => ipcRenderer.invoke('select-storage-folder'),
    exportBackup: () => ipcRenderer.invoke('export-backup'),
    importBackup: () => ipcRenderer.invoke('import-backup'),
    saveEntry: (entry) => ipcRenderer.invoke('save-entry', entry),
    getEntry: (date) => ipcRenderer.invoke('get-entry', date),
    getAllEntries: () => ipcRenderer.invoke('get-all-entries')
});