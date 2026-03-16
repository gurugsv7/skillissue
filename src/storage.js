const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    isPlainObject,
    ensurePlainObject,
    sanitizeText,
    ensureBoolean,
    ensureNumber,
    ensureIntegerString,
    ensureLanguageCode,
    ensureSafeUrl,
    ensureProfile,
} = require('./utils/inputValidation');

const CONFIG_VERSION = 1;

// Default values
const DEFAULT_CONFIG = {
    configVersion: CONFIG_VERSION,
    onboarded: false,
    layout: 'normal',
};

const DEFAULT_CREDENTIALS = {
    apiKey: '',
    groqApiKey: '',
    azureApiKey: '',
    azureEndpoint: '',
    azureDeployment: '',
    cloudToken: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
};

const DEFAULT_PREFERENCES = {
    customPrompt: '',
    resumeText: '',
    resumeFileName: '',
    selectedProfile: 'interview',
    selectedLanguage: 'en-US',
    selectedScreenshotInterval: '5',
    selectedImageQuality: 'medium',
    advancedMode: false,
    audioMode: 'speaker_only',
    fontSize: 'medium',
    backgroundTransparency: 0.8,
    googleSearchEnabled: false,
    ollamaHost: 'http://127.0.0.1:11434',
    ollamaModel: 'llama3.1',
    whisperModel: 'Xenova/whisper-small',
    skipVoiceCalibration: false,
};

const DEFAULT_KEYBINDS = null; // null means use system defaults

const DEFAULT_LIMITS = {
    data: [], // Array of { date: 'YYYY-MM-DD', flash: { count }, flashLite: { count }, groq: { 'qwen3-32b': { chars, limit }, 'gpt-oss-120b': { chars, limit }, 'gpt-oss-20b': { chars, limit } }, gemini: { 'gemma-3-27b-it': { chars } } }
};

// Get the config directory path based on OS
function getConfigDir() {
    const platform = os.platform();
    let configDir;

    if (platform === 'win32') {
        configDir = path.join(os.homedir(), 'AppData', 'Roaming', 'hintio-config');
    } else if (platform === 'darwin') {
        configDir = path.join(os.homedir(), 'Library', 'Application Support', 'hintio-config');
    } else {
        configDir = path.join(os.homedir(), '.config', 'hintio-config');
    }

    return configDir;
}

// File paths
function getConfigPath() {
    return path.join(getConfigDir(), 'config.json');
}

function getCredentialsPath() {
    return path.join(getConfigDir(), 'credentials.json');
}

function getPreferencesPath() {
    return path.join(getConfigDir(), 'preferences.json');
}

function getKeybindsPath() {
    return path.join(getConfigDir(), 'keybinds.json');
}

function getLimitsPath() {
    return path.join(getConfigDir(), 'limits.json');
}

function getHistoryDir() {
    return path.join(getConfigDir(), 'history');
}

function getVoiceProfilePath() {
    return path.join(getConfigDir(), 'voice-profile.json');
}

// Helper to read JSON file safely
function readJsonFile(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.warn(`Error reading ${filePath}:`, error.message);
    }
    return defaultValue;
}

// Helper to write JSON file safely
function writeJsonFile(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error.message);
        return false;
    }
}

// Check if we need to reset (no configVersion or wrong version)
function needsReset() {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
        return true;
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return !config.configVersion || config.configVersion !== CONFIG_VERSION;
    } catch {
        return true;
    }
}

// Wipe and reinitialize the config directory
function resetConfigDir() {
    const configDir = getConfigDir();

    console.log('Resetting config directory...');

    // Remove existing directory if it exists
    if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true, force: true });
    }

    // Create fresh directory structure
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(getHistoryDir(), { recursive: true });

    // Initialize with defaults
    writeJsonFile(getConfigPath(), DEFAULT_CONFIG);
    writeJsonFile(getCredentialsPath(), DEFAULT_CREDENTIALS);
    writeJsonFile(getPreferencesPath(), DEFAULT_PREFERENCES);

    console.log('Config directory initialized with defaults');
}

// Initialize storage - call this on app startup
function initializeStorage() {
    if (needsReset()) {
        resetConfigDir();
    } else {
        // Ensure history directory exists
        const historyDir = getHistoryDir();
        if (!fs.existsSync(historyDir)) {
            fs.mkdirSync(historyDir, { recursive: true });
        }
    }
}

const CONFIG_KEYS = {
    onboarded: value => ensureBoolean(value, 'config.onboarded'),
    layout: value => {
        const normalized = sanitizeText(value, { fieldName: 'config.layout', maxLength: 20, multiline: false });
        if (!['normal', 'minimal', 'compact'].includes(normalized)) {
            throw new Error('config.layout must be one of: normal, minimal, compact');
        }
        return normalized;
    },
};

function sanitizeConfigPatch(configPatch) {
    ensurePlainObject(configPatch, 'config');
    const sanitized = {};
    for (const [key, value] of Object.entries(configPatch)) {
        if (key === 'configVersion') continue;
        const validator = CONFIG_KEYS[key];
        if (!validator) {
            throw new Error(`Unknown config key: ${key}`);
        }
        sanitized[key] = validator(value);
    }
    return sanitized;
}

function sanitizeCredentialsPatch(credentialsPatch) {
    ensurePlainObject(credentialsPatch, 'credentials');
    const sanitized = {};
    const tokenRegex = /^SKI-[A-Za-z0-9_-]{20,252}$/;

    for (const [key, value] of Object.entries(credentialsPatch)) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_CREDENTIALS, key)) {
            throw new Error(`Unknown credentials key: ${key}`);
        }

        if (value === null || value === undefined) {
            sanitized[key] = '';
            continue;
        }

        if (key === 'azureEndpoint' || key === 'supabaseUrl') {
            const textValue = sanitizeText(String(value), { fieldName: `credentials.${key}`, maxLength: 1024, multiline: false });
            sanitized[key] = textValue ? ensureSafeUrl(textValue, { fieldName: `credentials.${key}`, protocols: ['https:'] }) : '';
            continue;
        }

        if (key === 'cloudToken') {
            const tokenValue = sanitizeText(String(value), { fieldName: 'credentials.cloudToken', maxLength: 256, multiline: false });
            if (tokenValue && !tokenRegex.test(tokenValue)) {
                throw new Error('credentials.cloudToken has invalid format');
            }
            sanitized[key] = tokenValue;
            continue;
        }

        sanitized[key] = sanitizeText(String(value), {
            fieldName: `credentials.${key}`,
            maxLength: key === 'supabaseAnonKey' ? 4096 : 2048,
            multiline: false,
        });
    }

    return sanitized;
}

const PREFERENCE_KEYS = {
    customPrompt: value => sanitizeText(String(value), { fieldName: 'preferences.customPrompt', maxLength: 25000 }),
    resumeText: value => sanitizeText(String(value), { fieldName: 'preferences.resumeText', maxLength: 250000 }),
    resumeFileName: value => sanitizeText(String(value), { fieldName: 'preferences.resumeFileName', maxLength: 200, multiline: false }),
    selectedProfile: value => ensureProfile(String(value), 'preferences.selectedProfile'),
    selectedLanguage: value => ensureLanguageCode(String(value), 'preferences.selectedLanguage'),
    selectedScreenshotInterval: value => ensureIntegerString(value, { fieldName: 'preferences.selectedScreenshotInterval', min: 1, max: 60 }),
    selectedImageQuality: value => {
        const quality = sanitizeText(String(value), { fieldName: 'preferences.selectedImageQuality', maxLength: 16, multiline: false });
        if (!['high', 'medium', 'low'].includes(quality)) {
            throw new Error('preferences.selectedImageQuality must be high, medium, or low');
        }
        return quality;
    },
    advancedMode: value => ensureBoolean(value, 'preferences.advancedMode'),
    audioMode: value => {
        const mode = sanitizeText(String(value), { fieldName: 'preferences.audioMode', maxLength: 20, multiline: false });
        if (!['speaker_only', 'mic_only', 'both', 'none'].includes(mode)) {
            throw new Error('preferences.audioMode must be speaker_only, mic_only, both, or none');
        }
        return mode;
    },
    fontSize: value => {
        if (typeof value === 'number') {
            return ensureNumber(value, { fieldName: 'preferences.fontSize', min: 12, max: 36 });
        }
        const size = sanitizeText(String(value), { fieldName: 'preferences.fontSize', maxLength: 12, multiline: false });
        if (!['small', 'medium', 'large'].includes(size)) {
            throw new Error('preferences.fontSize must be a number (12-36) or one of: small, medium, large');
        }
        return size;
    },
    backgroundTransparency: value => ensureNumber(value, { fieldName: 'preferences.backgroundTransparency', min: 0, max: 1 }),
    googleSearchEnabled: value => ensureBoolean(value, 'preferences.googleSearchEnabled'),
    ollamaHost: value => ensureSafeUrl(String(value), {
        fieldName: 'preferences.ollamaHost',
        protocols: ['http:', 'https:'],
        allowLocalhost: true,
        maxLength: 512,
    }),
    ollamaModel: value => sanitizeText(String(value), { fieldName: 'preferences.ollamaModel', maxLength: 200, multiline: false }),
    whisperModel: value => sanitizeText(String(value), { fieldName: 'preferences.whisperModel', maxLength: 200, multiline: false }),
    skipVoiceCalibration: value => ensureBoolean(value, 'preferences.skipVoiceCalibration'),
};

function sanitizePreferencesPatch(preferencesPatch) {
    ensurePlainObject(preferencesPatch, 'preferences');
    const sanitized = {};
    for (const [key, value] of Object.entries(preferencesPatch)) {
        const validator = PREFERENCE_KEYS[key];
        if (!validator) {
            throw new Error(`Unknown preferences key: ${key}`);
        }
        sanitized[key] = validator(value);
    }
    return sanitized;
}

function sanitizeKeybinds(keybinds) {
    if (keybinds === null) return null;
    ensurePlainObject(keybinds, 'keybinds');
    const sanitized = {};
    const acceleratorRegex = /^[A-Za-z0-9+\-\s]{1,80}$/;
    for (const [action, combo] of Object.entries(keybinds)) {
        const safeAction = sanitizeText(action, { fieldName: 'keybind action', maxLength: 60, multiline: false });
        const safeCombo = sanitizeText(String(combo), { fieldName: `keybinds.${safeAction}`, maxLength: 80, multiline: false });
        if (!acceleratorRegex.test(safeCombo)) {
            throw new Error(`Invalid keybind format for action: ${safeAction}`);
        }
        sanitized[safeAction] = safeCombo;
    }
    return sanitized;
}

function sanitizeSessionId(sessionId) {
    const value = sanitizeText(String(sessionId), { fieldName: 'sessionId', maxLength: 32, multiline: false, allowEmpty: false });
    if (!/^\d{10,20}$/.test(value)) {
        throw new Error('sessionId must be a numeric timestamp-like string');
    }
    return value;
}

// ============ CONFIG ============

function getConfig() {
    return readJsonFile(getConfigPath(), DEFAULT_CONFIG);
}

function setConfig(config) {
    const safePatch = sanitizeConfigPatch(config);
    const current = getConfig();
    const updated = { ...current, ...safePatch, configVersion: CONFIG_VERSION };
    return writeJsonFile(getConfigPath(), updated);
}

function updateConfig(key, value) {
    const safeKey = sanitizeText(String(key), { fieldName: 'config key', maxLength: 80, multiline: false, allowEmpty: false });
    const validator = CONFIG_KEYS[safeKey];
    if (!validator) {
        throw new Error(`Unknown config key: ${safeKey}`);
    }
    const config = getConfig();
    config[safeKey] = validator(value);
    return writeJsonFile(getConfigPath(), config);
}

// ============ CREDENTIALS ============

function getCredentials() {
    return readJsonFile(getCredentialsPath(), DEFAULT_CREDENTIALS);
}

function setCredentials(credentials) {
    const safePatch = sanitizeCredentialsPatch(credentials);
    const current = getCredentials();
    const updated = { ...current, ...safePatch };
    return writeJsonFile(getCredentialsPath(), updated);
}

function getApiKey() {
    return getCredentials().apiKey || '';
}

function setApiKey(apiKey) {
    return setCredentials({ apiKey });
}

function getGroqApiKey() {
    return getCredentials().groqApiKey || '';
}

function setGroqApiKey(groqApiKey) {
    return setCredentials({ groqApiKey });
}

function getAzureApiKey() {
    return getCredentials().azureApiKey || '';
}

function setAzureApiKey(azureApiKey) {
    return setCredentials({ azureApiKey });
}

function getAzureEndpoint() {
    return getCredentials().azureEndpoint || '';
}

function setAzureEndpoint(azureEndpoint) {
    return setCredentials({ azureEndpoint });
}

function getAzureDeployment() {
    return getCredentials().azureDeployment || '';
}

function setAzureDeployment(azureDeployment) {
    return setCredentials({ azureDeployment });
}

function clearProviderSecrets() {
    return setCredentials({
        apiKey: '',
        groqApiKey: '',
        azureApiKey: '',
        azureEndpoint: '',
        azureDeployment: '',
    });
}

// ============ PREFERENCES ============

function getPreferences() {
    const saved = readJsonFile(getPreferencesPath(), {});
    return { ...DEFAULT_PREFERENCES, ...saved };
}

function setPreferences(preferences) {
    const safePatch = sanitizePreferencesPatch(preferences);
    const current = getPreferences();
    const updated = { ...current, ...safePatch };
    return writeJsonFile(getPreferencesPath(), updated);
}

function updatePreference(key, value) {
    const safeKey = sanitizeText(String(key), { fieldName: 'preferences key', maxLength: 100, multiline: false, allowEmpty: false });
    const validator = PREFERENCE_KEYS[safeKey];
    if (!validator) {
        throw new Error(`Unknown preferences key: ${safeKey}`);
    }
    const preferences = getPreferences();
    preferences[safeKey] = validator(value);
    return writeJsonFile(getPreferencesPath(), preferences);
}

// ============ KEYBINDS ============

function getKeybinds() {
    return readJsonFile(getKeybindsPath(), DEFAULT_KEYBINDS);
}

function setKeybinds(keybinds) {
    return writeJsonFile(getKeybindsPath(), sanitizeKeybinds(keybinds));
}

// ============ LIMITS (Rate Limiting) ============

function getLimits() {
    return readJsonFile(getLimitsPath(), DEFAULT_LIMITS);
}

function setLimits(limits) {
    return writeJsonFile(getLimitsPath(), limits);
}

function getTodayDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

function getTodayLimits() {
    const limits = getLimits();
    const today = getTodayDateString();

    // Find today's entry
    const todayEntry = limits.data.find(entry => entry.date === today);

    if (todayEntry) {
        // ensure new fields exist
        if (!todayEntry.groq) {
            todayEntry.groq = {
                'qwen3-32b': { chars: 0, limit: 1500000 },
                'gpt-oss-120b': { chars: 0, limit: 600000 },
                'gpt-oss-20b': { chars: 0, limit: 600000 },
                'kimi-k2-instruct': { chars: 0, limit: 600000 },
            };
        }
        if (!todayEntry.gemini) {
            todayEntry.gemini = {
                'gemma-3-27b-it': { chars: 0 },
            };
        }
        setLimits(limits);
        return todayEntry;
    }

    // No entry for today - clean old entries and create new one
    limits.data = limits.data.filter(entry => entry.date === today);
    const newEntry = {
        date: today,
        flash: { count: 0 },
        flashLite: { count: 0 },
        groq: {
            'qwen3-32b': { chars: 0, limit: 1500000 },
            'gpt-oss-120b': { chars: 0, limit: 600000 },
            'gpt-oss-20b': { chars: 0, limit: 600000 },
            'kimi-k2-instruct': { chars: 0, limit: 600000 },
        },
        gemini: {
            'gemma-3-27b-it': { chars: 0 },
        },
    };
    limits.data.push(newEntry);
    setLimits(limits);

    return newEntry;
}

function incrementLimitCount(model) {
    const limits = getLimits();
    const today = getTodayDateString();

    // Find or create today's entry
    let todayEntry = limits.data.find(entry => entry.date === today);

    if (!todayEntry) {
        // Clean old entries and create new one
        limits.data = [];
        todayEntry = {
            date: today,
            flash: { count: 0 },
            flashLite: { count: 0 },
        };
        limits.data.push(todayEntry);
    } else {
        // Clean old entries, keep only today
        limits.data = limits.data.filter(entry => entry.date === today);
    }

    // Increment the appropriate model count
    if (model === 'gemini-2.5-flash') {
        todayEntry.flash.count++;
    } else if (model === 'gemini-2.5-flash-lite') {
        todayEntry.flashLite.count++;
    }

    setLimits(limits);
    return todayEntry;
}

function incrementCharUsage(provider, model, charCount) {
    getTodayLimits();

    const limits = getLimits();
    const today = getTodayDateString();
    const todayEntry = limits.data.find(entry => entry.date === today);

    if (todayEntry[provider] && todayEntry[provider][model]) {
        todayEntry[provider][model].chars += charCount;
        setLimits(limits);
    }

    return todayEntry;
}

function getAvailableModel() {
    const todayLimits = getTodayLimits();

    // RPD limits: flash = 20, flash-lite = 20
    // After both exhausted, fall back to flash (for paid API users)
    if (todayLimits.flash.count < 20) {
        return 'gemini-2.5-flash';
    } else if (todayLimits.flashLite.count < 20) {
        return 'gemini-2.5-flash-lite';
    }

    return 'gemini-2.5-flash'; // Default to flash for paid API users
}

function getModelForToday() {
    const todayEntry = getTodayLimits();
    const groq = todayEntry.groq;

    if (groq['qwen3-32b'].chars < groq['qwen3-32b'].limit) {
        return 'qwen/qwen3-32b';
    }
    if (groq['gpt-oss-120b'].chars < groq['gpt-oss-120b'].limit) {
        return 'openai/gpt-oss-120b';
    }
    if (groq['gpt-oss-20b'].chars < groq['gpt-oss-20b'].limit) {
        return 'openai/gpt-oss-20b';
    }
    if (groq['kimi-k2-instruct'].chars < groq['kimi-k2-instruct'].limit) {
        return 'moonshotai/kimi-k2-instruct';
    }

    // All limits exhausted
    return null;
}

// ============ HISTORY ============

function getSessionPath(sessionId) {
    return path.join(getHistoryDir(), `${sanitizeSessionId(sessionId)}.json`);
}

function saveSession(sessionId, data) {
    if (!isPlainObject(data)) {
        throw new Error('session data must be an object');
    }
    const sessionPath = getSessionPath(sessionId);

    // Load existing session to preserve metadata
    const existingSession = readJsonFile(sessionPath, null);

    const sessionData = {
        sessionId,
        createdAt: existingSession?.createdAt || parseInt(sessionId),
        lastUpdated: Date.now(),
        // Profile context - set once when session starts
        profile: data.profile || existingSession?.profile || null,
        customPrompt: data.customPrompt || existingSession?.customPrompt || null,
        // Conversation data
        conversationHistory: data.conversationHistory || existingSession?.conversationHistory || [],
        screenAnalysisHistory: data.screenAnalysisHistory || existingSession?.screenAnalysisHistory || [],
    };
    return writeJsonFile(sessionPath, sessionData);
}

function getSession(sessionId) {
    return readJsonFile(getSessionPath(sessionId), null);
}

function getAllSessions() {
    const historyDir = getHistoryDir();

    try {
        if (!fs.existsSync(historyDir)) {
            return [];
        }

        const files = fs
            .readdirSync(historyDir)
            .filter(f => f.endsWith('.json'))
            .sort((a, b) => {
                // Sort by timestamp descending (newest first)
                const tsA = parseInt(a.replace('.json', ''));
                const tsB = parseInt(b.replace('.json', ''));
                return tsB - tsA;
            });

        return files
            .map(file => {
                const sessionId = file.replace('.json', '');
                const data = readJsonFile(path.join(historyDir, file), null);
                if (data) {
                    return {
                        sessionId,
                        createdAt: data.createdAt,
                        lastUpdated: data.lastUpdated,
                        messageCount: data.conversationHistory?.length || 0,
                        screenAnalysisCount: data.screenAnalysisHistory?.length || 0,
                        profile: data.profile || null,
                        customPrompt: data.customPrompt || null,
                    };
                }
                return null;
            })
            .filter(Boolean);
    } catch (error) {
        console.error('Error reading sessions:', error.message);
        return [];
    }
}

function deleteSession(sessionId) {
    const sessionPath = getSessionPath(sessionId);
    try {
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
            return true;
        }
    } catch (error) {
        console.error('Error deleting session:', error.message);
    }
    return false;
}

function deleteAllSessions() {
    const historyDir = getHistoryDir();
    try {
        if (fs.existsSync(historyDir)) {
            const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
            files.forEach(file => {
                fs.unlinkSync(path.join(historyDir, file));
            });
        }
        return true;
    } catch (error) {
        console.error('Error deleting all sessions:', error.message);
        return false;
    }
}

// ============ VOICE PROFILE ============

function getVoiceProfile() {
    return readJsonFile(getVoiceProfilePath(), null);
}

function saveVoiceProfile(profile) {
    return writeJsonFile(getVoiceProfilePath(), profile);
}

function deleteVoiceProfile() {
    try {
        const profilePath = getVoiceProfilePath();
        if (fs.existsSync(profilePath)) {
            fs.unlinkSync(profilePath);
        }
        return true;
    } catch (error) {
        console.error('Error deleting voice profile:', error.message);
        return false;
    }
}

// ============ CLEAR ALL DATA ============

function clearAllData() {
    resetConfigDir();
    return true;
}

module.exports = {
    // Initialization
    initializeStorage,
    getConfigDir,

    // Config
    getConfig,
    setConfig,
    updateConfig,

    // Credentials
    getCredentials,
    setCredentials,
    getApiKey,
    setApiKey,
    getGroqApiKey,
    setGroqApiKey,
    getAzureApiKey,
    setAzureApiKey,
    getAzureEndpoint,
    setAzureEndpoint,
    getAzureDeployment,
    setAzureDeployment,
    clearProviderSecrets,

    // Preferences
    getPreferences,
    setPreferences,
    updatePreference,

    // Keybinds
    getKeybinds,
    setKeybinds,

    // Limits (Rate Limiting)
    getLimits,
    setLimits,
    getTodayLimits,
    incrementLimitCount,
    getAvailableModel,
    incrementCharUsage,
    getModelForToday,

    // History
    saveSession,
    getSession,
    getAllSessions,
    deleteSession,
    deleteAllSessions,

    // Voice profile
    getVoiceProfile,
    saveVoiceProfile,
    deleteVoiceProfile,

    // Clear all
    clearAllData,
};
