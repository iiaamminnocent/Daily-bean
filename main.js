const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const configPath = path.join(app.getPath('userData'), 'dailybean-config.json');

function getDefaultStoragePath() {
    return path.join(app.getPath('documents'), 'DailyBean_Data');
}

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) { console.error(e); }
    return { storagePath: getDefaultStoragePath() };
}

function saveConfig(cfg) {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}

function ensureDirectories(targetPath) {
    const entriesDir = path.join(targetPath, 'entries');
    const mediaDir = path.join(targetPath, 'media');
    if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, { recursive: true });
    if (!fs.existsSync(entriesDir)) fs.mkdirSync(entriesDir, { recursive: true });
    if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200, height: 850, minWidth: 900, minHeight: 650,
        autoHideMenuBar: true, title: "DailyBean",
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, nodeIntegration: false
        }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    ensureDirectories(loadConfig().storagePath);
    createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('get-storage-path', () => { return loadConfig().storagePath; });

ipcMain.handle('select-storage-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'], title: "Select New Storage Drive or Folder" });
    if (!result.canceled && result.filePaths.length > 0) {
        const newPath = result.filePaths[0];
        const oldPath = loadConfig().storagePath;
        if (oldPath !== newPath) {
            ensureDirectories(newPath);
            try {
                if (fs.existsSync(path.join(oldPath, 'entries'))) fs.cpSync(path.join(oldPath, 'entries'), path.join(newPath, 'entries'), { recursive: true });
                if (fs.existsSync(path.join(oldPath, 'media'))) fs.cpSync(path.join(oldPath, 'media'), path.join(newPath, 'media'), { recursive: true });
            } catch(e) { console.error("Error migrating:", e); }
            saveConfig({ storagePath: newPath });
            return newPath;
        }
    }
    return null;
});

// NEW: Export Backup
ipcMain.handle('export-backup', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'], title: "Select Destination to Save Backup" });
    if (!result.canceled && result.filePaths.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const dest = path.join(result.filePaths[0], `DailyBean_Backup_${today}`);
        fs.cpSync(loadConfig().storagePath, dest, { recursive: true });
        return dest;
    }
    return null;
});

// NEW: Import Backup
ipcMain.handle('import-backup', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: "Select your DailyBean Backup Folder" });
    if (!result.canceled && result.filePaths.length > 0) {
        const src = result.filePaths[0];
        const dest = loadConfig().storagePath;
        // Validate if it's a real backup folder
        if (fs.existsSync(path.join(src, 'entries'))) {
            fs.cpSync(src, dest, { recursive: true });
            return true;
        } else {
            return false; // Not a valid backup folder
        }
    }
    return null;
});

ipcMain.handle('save-entry', async (event, entry) => {
    const cfg = loadConfig();
    ensureDirectories(cfg.storagePath);
    const mediaDir = path.join(cfg.storagePath, 'media');
    const entriesDir = path.join(cfg.storagePath, 'entries');

    const processedMedia = [];
    if (entry.media) {
        for (const item of entry.media) {
            if (item.dataUrl && item.dataUrl.startsWith('data:')) {
                const matches = item.dataUrl.match(/^data:(.+);base64,(.+)$/);
                if (matches) {
                    const ext = matches[1].split('/')[1] || 'bin';
                    const fileName = `${entry.date}_${item.id}.${ext}`;
                    const filePath = path.join(mediaDir, fileName);
                    fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
                    processedMedia.push({ id: item.id, type: item.type, fileName: fileName, src: `file://${filePath.replace(/\\/g, '/')}` });
                    continue;
                }
            }
            processedMedia.push(item);
        }
    }

    const fileData = { date: entry.date, mood: entry.mood, text: entry.text, media: processedMedia, timestamp: Date.now() };
    fs.writeFileSync(path.join(entriesDir, `${entry.date}.json`), JSON.stringify(fileData, null, 2));
    return { success: true };
});

ipcMain.handle('get-entry', async (event, date) => {
    const filePath = path.join(loadConfig().storagePath, 'entries', `${date}.json`);
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return null;
});

ipcMain.handle('get-all-entries', async () => {
    const entriesDir = path.join(loadConfig().storagePath, 'entries');
    if (!fs.existsSync(entriesDir)) return [];
    return fs.readdirSync(entriesDir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(entriesDir, f), 'utf8')));
});