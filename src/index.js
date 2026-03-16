if (require('electron-squirrel-startup')) {
    process.exit(0);
}

const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createWindow, updateGlobalShortcuts } = require('./utils/window');
const { setupProviderRuntimeIpcHandlers, stopMacOSAudioCapture, sendToRenderer, clearRuntimeProviderSecrets } = require('./utils/providerRuntime');
const storage = require('./storage');
const { enforceIpcRateLimit } = require('./utils/abuseProtection');
const {
    sanitizeText,
    ensureSafeUrl,
    ensureFilePath,
    ensureSafeFilename,
    ensurePlainObject,
} = require('./utils/inputValidation');

let autoUpdater = null;
try {
    ({ autoUpdater } = require('electron-updater'));
} catch (error) {
    autoUpdater = null;
}

const providerSessionRef = { current: null };
let mainWindow = null;
const IPC_RATE_POLICIES = {
    historyRead: {
        windowMs: 60 * 1000,
        max: 45,
        blockDurationMs: 2 * 60 * 1000,
        message: 'Too many history requests. Please slow down.',
    },
    parseDocument: {
        windowMs: 60 * 1000,
        max: 12,
        blockDurationMs: 2 * 60 * 1000,
        message: 'Too many document parse requests. Please slow down.',
    },
    openFileDialog: {
        windowMs: 60 * 1000,
        max: 20,
        blockDurationMs: 60 * 1000,
        message: 'Too many file picker requests. Please slow down.',
    },
};

function createMainWindow() {
    mainWindow = createWindow(sendToRenderer, providerSessionRef);
    return mainWindow;
}

function setupAutoUpdates() {
    if (!app.isPackaged || !autoUpdater) {
        return;
    }

    const updateFeedUrl = process.env.AUTO_UPDATE_URL;
    if (!updateFeedUrl) {
        return;
    }

    try {
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.setFeedURL({ provider: 'generic', url: updateFeedUrl });

        autoUpdater.on('checking-for-update', () => sendToRenderer('update-status', 'Checking for updates...'));
        autoUpdater.on('update-available', () => sendToRenderer('update-status', 'Update available. Downloading...'));
        autoUpdater.on('update-not-available', () => sendToRenderer('update-status', 'App up to date'));
        autoUpdater.on('download-progress', () => sendToRenderer('update-status', 'Downloading update...'));
        autoUpdater.on('update-downloaded', () => sendToRenderer('update-status', 'Update downloaded. Will install on quit.'));
        autoUpdater.on('error', err => {
            console.error('Auto-update error:', err);
            sendToRenderer('update-status', 'Auto-update failed');
        });

        autoUpdater.checkForUpdates().catch(err => {
            console.error('Auto-update check failed:', err);
        });
    } catch (error) {
        console.error('Error configuring auto updates:', error);
    }
}

app.whenReady().then(async () => {
    // Initialize storage (checks version, resets if needed)
    storage.initializeStorage();

    // Trigger screen recording permission prompt on macOS if not already granted
    if (process.platform === 'darwin') {
        const { desktopCapturer } = require('electron');
        desktopCapturer.getSources({ types: ['screen'] }).catch(() => {});
    }

    createMainWindow();
    setupProviderRuntimeIpcHandlers(providerSessionRef);
    setupStorageIpcHandlers();
    setupGeneralIpcHandlers();
    setupAutoUpdates();
});

app.on('window-all-closed', () => {
    stopMacOSAudioCapture();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopMacOSAudioCapture();
    clearRuntimeProviderSecrets();
    try {
        const creds = storage.getCredentials();
        if ((creds.cloudToken || '').trim()) {
            storage.clearProviderSecrets();
        }
    } catch (error) {
        console.error('Failed to clear provider secrets on quit:', error);
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

function setupStorageIpcHandlers() {
    // ============ CONFIG ============
    ipcMain.handle('storage:get-config', async () => {
        try {
            return { success: true, data: storage.getConfig() };
        } catch (error) {
            console.error('Error getting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-config', async (event, config) => {
        try {
            storage.setConfig(config);
            return { success: true };
        } catch (error) {
            console.error('Error setting config:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-config', async (event, key, value) => {
        try {
            storage.updateConfig(key, value);
            return { success: true };
        } catch (error) {
            console.error('Error updating config:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CREDENTIALS ============
    ipcMain.handle('storage:get-credentials', async () => {
        try {
            return { success: true, data: storage.getCredentials() };
        } catch (error) {
            console.error('Error getting credentials:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-credentials', async (event, credentials) => {
        try {
            storage.setCredentials(credentials);
            return { success: true };
        } catch (error) {
            console.error('Error setting credentials:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:clear-provider-secrets', async () => {
        try {
            storage.clearProviderSecrets();
            return { success: true };
        } catch (error) {
            console.error('Error clearing provider secrets:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-api-key', async () => {
        try {
            return { success: true, data: storage.getApiKey() };
        } catch (error) {
            console.error('Error getting API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-api-key', async (event, apiKey) => {
        try {
            storage.setApiKey(apiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-groq-api-key', async () => {
        try {
            return { success: true, data: storage.getGroqApiKey() };
        } catch (error) {
            console.error('Error getting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-groq-api-key', async (event, groqApiKey) => {
        try {
            storage.setGroqApiKey(groqApiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting Groq API key:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ AZURE ============
    ipcMain.handle('storage:get-azure-api-key', async () => {
        try {
            return { success: true, data: storage.getAzureApiKey() };
        } catch (error) {
            console.error('Error getting Azure API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-azure-api-key', async (event, azureApiKey) => {
        try {
            storage.setAzureApiKey(azureApiKey);
            return { success: true };
        } catch (error) {
            console.error('Error setting Azure API key:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-azure-endpoint', async () => {
        try {
            return { success: true, data: storage.getAzureEndpoint() };
        } catch (error) {
            console.error('Error getting Azure endpoint:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-azure-endpoint', async (event, azureEndpoint) => {
        try {
            storage.setAzureEndpoint(azureEndpoint);
            return { success: true };
        } catch (error) {
            console.error('Error setting Azure endpoint:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-azure-deployment', async () => {
        try {
            return { success: true, data: storage.getAzureDeployment() };
        } catch (error) {
            console.error('Error getting Azure deployment:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-azure-deployment', async (event, azureDeployment) => {
        try {
            storage.setAzureDeployment(azureDeployment);
            return { success: true };
        } catch (error) {
            console.error('Error setting Azure deployment:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ PREFERENCES ============
    ipcMain.handle('storage:get-preferences', async () => {
        try {
            return { success: true, data: storage.getPreferences() };
        } catch (error) {
            console.error('Error getting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-preferences', async (event, preferences) => {
        try {
            storage.setPreferences(preferences);
            return { success: true };
        } catch (error) {
            console.error('Error setting preferences:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:update-preference', async (event, key, value) => {
        try {
            storage.updatePreference(key, value);
            return { success: true };
        } catch (error) {
            console.error('Error updating preference:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ KEYBINDS ============
    ipcMain.handle('storage:get-keybinds', async () => {
        try {
            return { success: true, data: storage.getKeybinds() };
        } catch (error) {
            console.error('Error getting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:set-keybinds', async (event, keybinds) => {
        try {
            storage.setKeybinds(keybinds);
            return { success: true };
        } catch (error) {
            console.error('Error setting keybinds:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ HISTORY ============
    ipcMain.handle('storage:get-all-sessions', async event => {
        try {
            enforceIpcRateLimit(event, 'storage.get-all-sessions', IPC_RATE_POLICIES.historyRead);
            return { success: true, data: storage.getAllSessions() };
        } catch (error) {
            console.error('Error getting sessions:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:get-session', async (event, sessionId) => {
        try {
            enforceIpcRateLimit(event, 'storage.get-session', IPC_RATE_POLICIES.historyRead);
            return { success: true, data: storage.getSession(sessionId) };
        } catch (error) {
            console.error('Error getting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:save-session', async (event, sessionId, data) => {
        try {
            storage.saveSession(sessionId, data);
            return { success: true };
        } catch (error) {
            console.error('Error saving session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-session', async (event, sessionId) => {
        try {
            storage.deleteSession(sessionId);
            return { success: true };
        } catch (error) {
            console.error('Error deleting session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-all-sessions', async () => {
        try {
            storage.deleteAllSessions();
            return { success: true };
        } catch (error) {
            console.error('Error deleting all sessions:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ LIMITS ============
    ipcMain.handle('storage:get-today-limits', async () => {
        try {
            return { success: true, data: storage.getTodayLimits() };
        } catch (error) {
            console.error('Error getting today limits:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ VOICE PROFILE ============
    ipcMain.handle('storage:get-voice-profile', async () => {
        try {
            return { success: true, data: storage.getVoiceProfile() };
        } catch (error) {
            console.error('Error getting voice profile:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:save-voice-profile', async (event, profile) => {
        try {
            storage.saveVoiceProfile(profile);
            return { success: true };
        } catch (error) {
            console.error('Error saving voice profile:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('storage:delete-voice-profile', async () => {
        try {
            storage.deleteVoiceProfile();
            return { success: true };
        } catch (error) {
            console.error('Error deleting voice profile:', error);
            return { success: false, error: error.message };
        }
    });

    // ============ CLEAR ALL ============
    ipcMain.handle('storage:clear-all', async () => {
        try {
            storage.clearAllData();
            return { success: true };
        } catch (error) {
            console.error('Error clearing all data:', error);
            return { success: false, error: error.message };
        }
    });
}

function setupGeneralIpcHandlers() {
    ipcMain.handle('get-app-version', async () => {
        return app.getVersion();
    });

    ipcMain.handle('quit-application', async event => {
        try {
            stopMacOSAudioCapture();
            app.quit();
            return { success: true };
        } catch (error) {
            console.error('Error quitting application:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('open-external', async (event, url) => {
        try {
            const safeUrl = ensureSafeUrl(url, {
                fieldName: 'external URL',
                protocols: ['https:', 'http:', 'mailto:'],
                allowLocalhost: true,
            });
            await shell.openExternal(safeUrl);
            return { success: true };
        } catch (error) {
            console.error('Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (mainWindow) {
            // Also save to storage
            storage.setKeybinds(newKeybinds);
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, providerSessionRef);
        }
    });

    // Debug logging from renderer
    ipcMain.on('log-message', (event, msg) => {
        const safeMessage = sanitizeText(String(msg || ''), {
            fieldName: 'log message',
            maxLength: 3000,
            allowEmpty: true,
        });
        console.log(safeMessage);
    });

    // Open a native file picker filtered to PDF / DOCX
    ipcMain.handle('open-file-dialog', async (event, options) => {
        enforceIpcRateLimit(event, 'system.open-file-dialog', IPC_RATE_POLICIES.openFileDialog);
        const safeOptions = {
            title: 'Select Document',
            filters: [{ name: 'Documents', extensions: ['pdf', 'docx'] }],
            properties: ['openFile'],
        };
        if (options && typeof options.title === 'string' && options.title.trim()) {
            safeOptions.title = sanitizeText(options.title, { fieldName: 'dialog title', maxLength: 80, multiline: false });
        }

        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, safeOptions);
        if (canceled || filePaths.length === 0) return null;
        return filePaths[0];
    });

    // Parse PDF or DOCX and return raw text
    ipcMain.handle('parse-document', async (event, filePath) => {
        enforceIpcRateLimit(event, 'system.parse-document', IPC_RATE_POLICIES.parseDocument);
        const safePath = ensureFilePath(filePath, {
            fieldName: 'document path',
            allowedExtensions: ['.pdf', '.docx'],
        });

        const stat = fs.statSync(safePath);
        const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
        if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_DOCUMENT_BYTES) {
            throw new Error('Invalid file size. Only PDF/DOCX files up to 10MB are allowed.');
        }

        const ext = path.extname(safePath).toLowerCase();
        if (ext === '.docx') {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ path: safePath });
            const text = sanitizeText(String(result.value || ''), { fieldName: 'docx text', maxLength: 250000, allowEmpty: true });
            return { text, fileName: path.basename(safePath) };
        } else if (ext === '.pdf') {
            const pdfParse = require('pdf-parse');
            const buffer = fs.readFileSync(safePath);
            if (buffer.length < 4 || buffer.subarray(0, 4).toString('utf8') !== '%PDF') {
                throw new Error('Invalid PDF file signature');
            }
            const result = await pdfParse(buffer);
            const text = sanitizeText(String(result.text || ''), { fieldName: 'pdf text', maxLength: 250000, allowEmpty: true });
            return { text, fileName: path.basename(safePath) };
        }
        throw new Error('Unsupported file type. Please use PDF or DOCX.');
    });

    ipcMain.handle('save-text-file', async (event, payload = {}) => {
        try {
            ensurePlainObject(payload, 'save-text-file payload');
            const text = sanitizeText(String(payload.text || ''), { fieldName: 'export text', maxLength: 2 * 1024 * 1024, allowEmpty: true });
            const defaultName = ensureSafeFilename(payload.defaultName, 'session-export.txt');

            const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
                title: 'Save Session Export',
                defaultPath: defaultName,
                filters: [
                    { name: 'Text Files', extensions: ['txt'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
                properties: ['createDirectory', 'showOverwriteConfirmation'],
            });

            if (canceled || !filePath) {
                return { success: false, canceled: true };
            }

            fs.writeFileSync(filePath, text, 'utf8');
            return { success: true, filePath };
        } catch (error) {
            console.error('Error saving text file:', error);
            return { success: false, error: error.message };
        }
    });
}
