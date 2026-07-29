const { GoogleGenAI, Modality } = require('@google/genai');
const { BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const { saveDebugAudio } = require('../audioUtils');
const { getSystemPrompt } = require('./prompts');
const {
    getAvailableModel,
    incrementLimitCount,
    getApiKey,
    getGroqApiKey,
    getAzureApiKey,
    getAzureEndpoint,
    getAzureDeployment,
    getCredentials,
    incrementCharUsage,
    getModelForToday,
} = require('../storage');
const supabaseConfig = require('./supabaseConfig');
const { connectCloud, sendCloudAudio, sendCloudText, sendCloudImage, closeCloud, isCloudActive, setOnTurnComplete } = require('./cloud');
const azureStt = require('./azureStt');
const speechStt = require('./speechStt');
const { enforceIpcRateLimit, enforceNamedRateLimit, ensureStringWithinLimit, hashValue } = require('./abuseProtection');

// Lazy-loaded to avoid circular dependency (localai.js imports from providerRuntime.js)
let _localai = null;
function getLocalAi() {
    if (!_localai) _localai = require('./localai');
    return _localai;
}

// Provider mode: token-only
let currentProviderMode = 'token';

// Groq conversation history for context
let groqConversationHistory = [];

// Conversation tracking variables
let currentSessionId = null;
let currentTranscription = '';
let conversationHistory = [];
let screenAnalysisHistory = [];
let currentProfile = null;
let currentCustomPrompt = null;
let isInitializingSession = false;
let currentSystemPrompt = null;
let currentVoiceProfile = null;
let runtimeProviderSecrets = null;
let runtimeSecretsToken = '';
let runtimeSecretsResolvedAt = 0;
let lastAcceptedTranscriptNormalized = '';
let lastAcceptedTranscriptAt = 0;
let isAzureResponseInFlight = false;
let pendingInterviewerTranscript = '';
let trialSessionTimeoutHandle = null;
let isTrialSessionTimedOut = false;

const PROVIDER_SECRETS_CACHE_TTL_MS = 30 * 60 * 1000;
const THREE_USAGE_SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const FAST_INTERVIEW_CUSTOM_CONTEXT_MAX_CHARS = 1400;
const FAST_INTERVIEW_GROQ_HISTORY_TURNS = 4;
const FAST_INTERVIEW_GEMMA_HISTORY_CHARS = 8000;
const FAST_INTERVIEW_MAX_OUTPUT_TOKENS = 420;
const MIN_TURN_WORDS = 4;
const DUPLICATE_TRANSCRIPT_WINDOW_MS = 25000;
const MIN_MEANINGFUL_WORDS = 2;
const QUESTION_LEAD_PATTERN = /^(what|why|how|when|where|who|which|can|could|would|do|does|did|is|are|was|were)\b/;
const PROMPT_LEAD_PATTERN = /^(tell me|walk me through|explain|describe|compare|implement|write|build|design|solve|give me|can you|could you|would you)\b/;
function getAzureReasoningEffort(azureDeployment = '') {
    const deployment = String(azureDeployment || '').toLowerCase();

    if (deployment.includes('gpt-5')) {
        return 'medium';
    }

    return undefined;
}

const COMPARISON_STYLE_PATTERNS = [
    /\b(flexbox|grid)\b.*\b(vs|versus|or)\b.*\b(flexbox|grid)\b/,
    /\b(which one|which)\b.*\b(better|best|prefer|recommended)\b/,
    /\b(when|where) (should|do) i use\b.*\b(flexbox|grid|memo|memoization|callback)\b/,
    /\b(difference between|compare|comparison between)\b/,
    /\b(choose|pick|use|go with|opt for)\b.*\b(flexbox|grid|memo|memoization|callback)\b/,
];
const DECISION_STYLE_PATTERNS = [
    /\b(which|what)\b.*\b(should|could|would|can)\b.*\b(i|we|you)\b/,
    /\b(should|could|would|can)\b.*\b(i|we|you)\b.*\b(choose|pick|use|go with|opt for|recommend|prefer)\b/,
    /\b(which|what)\b.*\b(better|best|recommended|prefer)\b/,
    /\b(compare|difference between|between|versus|vs)\b/,
    /\b(help me decide|suggest|recommend|advise)\b/,
];
const FILLER_WORDS = new Set([
    'um',
    'uh',
    'hmm',
    'huh',
    'mm',
    'mmm',
    'ah',
    'oh',
    'er',
    'erm',
    'hmmm',
    'yeah',
    'yep',
    'nope',
    'okay',
    'ok',
    'right',
    'hmmmmm',
]);
const RATE_LIMIT_POLICIES = {
    authResolve: {
        windowMs: 10 * 60 * 1000,
        max: 8,
        blockDurationMs: 15 * 60 * 1000,
        message: 'Too many login attempts. Please wait before trying again.',
    },
    calibrationTranscribe: {
        windowMs: 5 * 60 * 1000,
        max: 6,
        blockDurationMs: 10 * 60 * 1000,
        message: 'Too many calibration requests. Please try again in a few minutes.',
    },
    calibrationAnalyze: {
        windowMs: 5 * 60 * 1000,
        max: 10,
        blockDurationMs: 10 * 60 * 1000,
        message: 'Too many calibration analysis requests. Please try again shortly.',
    },
    initializeAzure: {
        windowMs: 10 * 60 * 1000,
        max: 5,
        blockDurationMs: 10 * 60 * 1000,
        message: 'Too many session start attempts. Please wait before retrying.',
    },
    sendText: {
        windowMs: 60 * 1000,
        max: 30,
        blockDurationMs: 2 * 60 * 1000,
        message: 'Too many text requests. Slow down and try again.',
    },
    sendImage: {
        windowMs: 60 * 1000,
        max: 20,
        blockDurationMs: 2 * 60 * 1000,
        message: 'Too many screenshot requests. Slow down and try again.',
    },
};

function enforceTokenScopedLimit(name, rawToken, policy) {
    const safeToken = ensureStringWithinLimit(rawToken || '', 256, 'Access token').trim();
    if (!safeToken) return;
    const tokenKey = hashValue(safeToken).slice(0, 24);
    enforceNamedRateLimit(name, tokenKey, policy);
}

function logLatencyStart(provider, metadata = {}) {
    const parts = Object.entries(metadata)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
    console.log(`[Latency][${provider}][Start] ${parts}`.trim());
}

function logLatencyError(provider, requestStartedAt, metadata = {}) {
    const totalMs = Math.max(0, Date.now() - Number(requestStartedAt || Date.now()));
    const parts = Object.entries({ totalMs, ...metadata })
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
    console.log(`[Latency][${provider}][Error] ${parts}`.trim());
}

function normalizeTranscriptForGate(text = '') {
    let normalized = String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s?]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) return '';

    const replacements = [
        [/\bflex board\b/g, 'flexbox'],
        [/\bflexboards\b/g, 'flexbox'],
        [/\bflexboard\b/g, 'flexbox'],
        [/\buse memo\b/g, 'usememo'],
        [/\buse effect\b/g, 'useeffect'],
        [/\buse callback\b/g, 'usecallback'],
        [/\breact memo\b/g, 'reactmemo'],
    ];

    for (const [pattern, replacement] of replacements) {
        normalized = normalized.replace(pattern, replacement);
    }

    return normalized;
}

function getGateWordStats(normalizedText = '') {
    const words = String(normalizedText || '').split(' ').filter(Boolean);
    const contentWords = words.filter((word) => /[a-z]/.test(word));
    const meaningfulWords = contentWords.filter((word) => word.length >= 3 && !FILLER_WORDS.has(word));
    const likelyNoiseTokens = meaningfulWords.filter((word) => word.length >= 5 && !/[aeiou]/.test(word));

    return {
        words,
        contentWords,
        meaningfulWords,
        likelyNoiseTokens,
    };
}

function isQuestionLikeTurn(normalizedText = '', stats = null) {
    if (!normalizedText) return false;

    const turnStats = stats || getGateWordStats(normalizedText);
    const wordCount = turnStats.words.length;
    const meaningfulCount = turnStats.meaningfulWords.length;
    const mostlyNoise = turnStats.meaningfulWords.length > 0 && (turnStats.likelyNoiseTokens.length / turnStats.meaningfulWords.length) >= 0.6;
    if (mostlyNoise) return false;

    if (wordCount < MIN_TURN_WORDS) return false;
    if (meaningfulCount < MIN_MEANINGFUL_WORDS) return false;

    const hasQuestionMark = normalizedText.includes('?');
    const startsWithQuestionCue = QUESTION_LEAD_PATTERN.test(normalizedText);
    const startsWithPromptCue = PROMPT_LEAD_PATTERN.test(normalizedText);
    const hasActionCue = /\b(explain|describe|compare|implement|write|build|design|solve|difference|between|approach|complexity|why|how|what|which)\b/.test(normalizedText);
    const hasComparisonCue = COMPARISON_STYLE_PATTERNS.some((pattern) => pattern.test(normalizedText));
    const hasDecisionCue = DECISION_STYLE_PATTERNS.some((pattern) => pattern.test(normalizedText));

    if (hasQuestionMark && (hasActionCue || hasDecisionCue || hasComparisonCue)) return true;
    if (startsWithQuestionCue || startsWithPromptCue) return true;
    return (hasDecisionCue && hasActionCue) || hasComparisonCue;
}

function shouldDispatchInterviewerTurn(transcription = '') {
    const normalized = normalizeTranscriptForGate(transcription);
    if (!normalized) return { accept: false, reason: 'empty', normalized };

    const stats = getGateWordStats(normalized);
    if (stats.words.length < MIN_TURN_WORDS) {
        return { accept: false, reason: 'too-short', normalized };
    }

    if (stats.meaningfulWords.length < MIN_MEANINGFUL_WORDS) {
        return { accept: false, reason: 'low-signal', normalized };
    }

    if (!isQuestionLikeTurn(normalized, stats)) {
        return { accept: false, reason: 'not-question-like', normalized };
    }

    const now = Date.now();
    const isDuplicate =
        lastAcceptedTranscriptNormalized
        && normalized === lastAcceptedTranscriptNormalized
        && (now - lastAcceptedTranscriptAt) < DUPLICATE_TRANSCRIPT_WINDOW_MS;

    if (isDuplicate) {
        return { accept: false, reason: 'duplicate', normalized };
    }

    lastAcceptedTranscriptNormalized = normalized;
    lastAcceptedTranscriptAt = now;
    return { accept: true, reason: 'accepted', normalized };
}

function getEffectiveApiKey() {
    return runtimeProviderSecrets?.geminiApiKey || getApiKey();
}

function getEffectiveGroqApiKey() {
    return runtimeProviderSecrets?.groqApiKey || getGroqApiKey();
}

function getEffectiveAzureApiKey() {
    return runtimeProviderSecrets?.azureApiKey || getAzureApiKey();
}

function getEffectiveAzureEndpoint() {
    return runtimeProviderSecrets?.azureEndpoint || getAzureEndpoint();
}

function getEffectiveAzureDeployment() {
    return runtimeProviderSecrets?.azureDeployment || getAzureDeployment();
}

function hasManagedCloudToken() {
    const cloudToken = runtimeProviderSecrets?.cloudToken || '';
    return !!cloudToken.trim();
}

function clearRuntimeProviderSecrets() {
    runtimeProviderSecrets = null;
    runtimeSecretsToken = '';
    runtimeSecretsResolvedAt = 0;
}

async function resolveProviderSecrets(accessToken, options = {}) {
    const token = (accessToken || '').trim();
    const consume = Boolean(options.consume);
    const internal = Boolean(options.internal);
    if (!token) {
        throw new Error('Access token is required');
    }

    const now = Date.now();
    if (
        !consume &&
        runtimeProviderSecrets
        && runtimeSecretsToken === token
        && (now - runtimeSecretsResolvedAt) < PROVIDER_SECRETS_CACHE_TTL_MS
    ) {
        return { success: true, data: runtimeProviderSecrets, cached: true };
    }

    const storedCreds = getCredentials();
    const supabaseUrl = (storedCreds.supabaseUrl || supabaseConfig.url || '').trim();
    const supabaseAnonKey = (storedCreds.supabaseAnonKey || supabaseConfig.anonKey || '').trim();
    const functionName = (supabaseConfig.resolveSecretsFunction || 'resolve-provider-secrets').trim();

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase runtime is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
    }

    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
        'x-client-intent': 'desktop-runtime',
    };

    if (internal) {
        const runtimeSecret = (process.env.HINTIO_INTERNAL_RUNTIME_SECRET || '').trim();
        if (!runtimeSecret) {
            throw new Error('HINTIO_INTERNAL_RUNTIME_SECRET is required for internal secret resolution');
        }
        headers['x-runtime-secret'] = runtimeSecret;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ accessToken: token, consume }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Secret resolution failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json();
    const data = payload?.data || payload;
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid secret response payload');
    }

    const resolvedSecrets = {
        geminiApiKey: data.geminiApiKey || '',
        groqApiKey: data.groqApiKey || '',
        azureApiKey: data.azureApiKey || '',
        azureEndpoint: data.azureEndpoint || '',
        azureDeployment: data.azureDeployment || '',
        cloudToken: data.cloudToken || '',
        providerMode: data.providerMode || '',
        expiresAt: data.expiresAt || '',
        metadata: data.metadata || {},
        maxInterviews: Number(data.maxInterviews || 0),
        interviewsUsed: Number(data.interviewsUsed || 0),
        interviewsRemaining: Number(data.interviewsRemaining || 0),
        creditConsumed: Boolean(data.creditConsumed),
        secretsIssued: Boolean(data.secretsIssued),
    };

    const shouldCacheSecrets = consume || data.secretsIssued === true;
    if (shouldCacheSecrets) {
        runtimeProviderSecrets = resolvedSecrets;
        runtimeSecretsToken = token;
        runtimeSecretsResolvedAt = now;
    }

    return { success: true, data: shouldCacheSecrets ? runtimeProviderSecrets : resolvedSecrets };
}

function formatSpeakerResults(results) {
    let text = '';
    for (const result of results) {
        if (result.transcript && result.speakerId) {
            const speakerLabel = result.speakerId === 1 ? 'Interviewer' : 'Candidate';
            text += `[${speakerLabel}]: ${result.transcript}\n`;
        }
    }
    return text;
}

module.exports.formatSpeakerResults = formatSpeakerResults;

// Audio capture variables
let systemAudioProc = null;
let messageBuffer = '';

// Reconnection variables
let isUserClosing = false;
let sessionParams = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

function sendToRenderer(channel, data) {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
    }
}

function clearTrialSessionTimeout() {
    if (trialSessionTimeoutHandle) {
        clearTimeout(trialSessionTimeoutHandle);
        trialSessionTimeoutHandle = null;
    }
    isTrialSessionTimedOut = false;
}

function startThreeUsageSessionTimeout(providerSessionRef) {
    clearTrialSessionTimeout();
    trialSessionTimeoutHandle = setTimeout(async () => {
        isTrialSessionTimedOut = true;
        pendingInterviewerTranscript = '';
        isAzureResponseInFlight = false;

        try {
            if (speechStt.isSpeechSTTActive()) {
                speechStt.stopSpeechSTT();
            }
        } catch (error) {
            console.warn('Failed stopping STT on timeout:', error.message);
        }

        if (providerSessionRef?.current) {
            try {
                await providerSessionRef.current.close();
            } catch (error) {
                console.warn('Failed closing provider session on timeout:', error.message);
            }
            providerSessionRef.current = null;
        }

        sendToRenderer('new-response', 'User timedout');
        sendToRenderer('update-status', 'User timedout');
    }, THREE_USAGE_SESSION_TIMEOUT_MS);
}

// Build context message for session restoration
function buildContextMessage() {
    const lastTurns = conversationHistory.slice(-20);
    const validTurns = lastTurns.filter(turn => turn.transcription?.trim() && turn.ai_response?.trim());

    if (validTurns.length === 0) return null;

    const contextLines = validTurns.map(turn => `[Interviewer]: ${turn.transcription.trim()}\n[Your answer]: ${turn.ai_response.trim()}`);

    return `Session reconnected. Here's the conversation so far:\n\n${contextLines.join('\n\n')}\n\nContinue from here.`;
}

// Conversation management functions
function initializeNewSession(profile = null, customPrompt = null) {
    currentSessionId = Date.now().toString();
    currentTranscription = '';
    conversationHistory = [];
    screenAnalysisHistory = [];
    groqConversationHistory = [];
    pendingInterviewerTranscript = '';
    clearTrialSessionTimeout();
    currentProfile = profile;
    currentCustomPrompt = customPrompt;
    console.log('New conversation session started:', currentSessionId, 'profile:', profile);

    // Save initial session with profile context
    if (profile) {
        sendToRenderer('save-session-context', {
            sessionId: currentSessionId,
            profile: profile,
            customPrompt: customPrompt || '',
        });
    }
}

function saveConversationTurn(transcription, aiResponse) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const conversationTurn = {
        timestamp: Date.now(),
        transcription: transcription.trim(),
        ai_response: aiResponse.trim(),
    };

    conversationHistory.push(conversationTurn);
    console.log('Saved conversation turn:', conversationTurn);

    // Send to renderer to save in IndexedDB
    sendToRenderer('save-conversation-turn', {
        sessionId: currentSessionId,
        turn: conversationTurn,
        fullHistory: conversationHistory,
    });
}

function updateLastConversationTurn(aiResponse) {
    if (!currentSessionId || !conversationHistory.length || !aiResponse) return;

    const lastIndex = conversationHistory.length - 1;
    conversationHistory[lastIndex] = {
        ...conversationHistory[lastIndex],
        timestamp: Date.now(),
        ai_response: aiResponse.trim(),
    };

    sendToRenderer('save-conversation-turn', {
        sessionId: currentSessionId,
        turn: conversationHistory[lastIndex],
        fullHistory: conversationHistory,
    });
}

function saveScreenAnalysis(prompt, response, model) {
    if (!currentSessionId) {
        initializeNewSession();
    }

    const analysisEntry = {
        timestamp: Date.now(),
        prompt: prompt,
        response: response.trim(),
        model: model,
    };

    screenAnalysisHistory.push(analysisEntry);
    console.log('Saved screen analysis:', analysisEntry);

    // Send to renderer to save
    sendToRenderer('save-screen-analysis', {
        sessionId: currentSessionId,
        analysis: analysisEntry,
        fullHistory: screenAnalysisHistory,
        profile: currentProfile,
        customPrompt: currentCustomPrompt,
    });
}

function updateLastScreenAnalysis(response) {
    if (!currentSessionId || !screenAnalysisHistory.length || !response) return;

    const lastIndex = screenAnalysisHistory.length - 1;
    screenAnalysisHistory[lastIndex] = {
        ...screenAnalysisHistory[lastIndex],
        timestamp: Date.now(),
        response: response.trim(),
    };

    sendToRenderer('save-screen-analysis', {
        sessionId: currentSessionId,
        analysis: screenAnalysisHistory[lastIndex],
        fullHistory: screenAnalysisHistory,
        profile: currentProfile,
        customPrompt: currentCustomPrompt,
    });
}

function resolveSelfHealProvider(preferredProvider = null) {
    if (preferredProvider === 'azure' || preferredProvider === 'groq') {
        return preferredProvider;
    }
    if (hasAzureKey()) return 'azure';
    if (hasGroqKey()) return 'groq';
    return null;
}

async function schedulePostAnswerSelfHeal({
    transcription,
    response,
    provider = null,
    persistType = null,
}) {
    const baseText = String(response || '').trim();
    if (!baseText) return;
    if (!isLikelyCodingPrompt(transcription || '', baseText)) return;

    const healProvider = resolveSelfHealProvider(provider);
    if (!healProvider) return;

    setTimeout(async () => {
        try {
            const healed = await maybeHumanizeCodeResponse(transcription || '', baseText, healProvider);
            const healedText = String(healed || '').trim();
            if (!healedText || healedText === baseText) return;

            sendToRenderer('update-response', healedText);

            if (persistType === 'conversation') {
                updateLastConversationTurn(healedText);
            } else if (persistType === 'screen') {
                updateLastScreenAnalysis(healedText);
            }
        } catch (error) {
            console.warn('Post-answer self-heal skipped:', error.message);
        }
    }, 1000);
}

function getCurrentSessionData() {
    return {
        sessionId: currentSessionId,
        history: conversationHistory,
    };
}

// ── Intelligent auto-advance logic ──
/**
 * Determines if a new response should auto-advance the UI or stay on current response.
 * In speaker-only mode, prevents jumping to follow-up questions until user answers first.
 * @param {string} newResponse - The new AI response text
 * @returns {boolean} true if should auto-advance, false if should wait for user answer
 */
async function getEnabledTools() {
    const tools = [];

    // Check if Google Search is enabled (default: true)
    const googleSearchEnabled = await getStoredSetting('googleSearchEnabled', 'true');
    console.log('Google Search enabled:', googleSearchEnabled);

    if (googleSearchEnabled === 'true') {
        tools.push({ googleSearch: {} });
        console.log('Added Google Search tool');
    } else {
        console.log('Google Search tool disabled');
    }

    return tools;
}

async function getStoredSetting(key, defaultValue) {
    try {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            // Try to get setting from renderer process localStorage
            const value = await windows[0].webContents.executeJavaScript(`
                (function() {
                    try {
                        if (typeof localStorage === 'undefined') {
                            console.log('localStorage not available yet for ${key}');
                            return '${defaultValue}';
                        }
                        const stored = localStorage.getItem('${key}');
                        console.log('Retrieved setting ${key}:', stored);
                        return stored || '${defaultValue}';
                    } catch (e) {
                        console.error('Error accessing localStorage for ${key}:', e);
                        return '${defaultValue}';
                    }
                })()
            `);
            return value;
        }
    } catch (error) {
        console.error('Error getting stored setting for', key, ':', error.message);
    }
    console.log('Using default value for', key, ':', defaultValue);
    return defaultValue;
}

// helper to check if groq has been configured
function hasGroqKey() {
    const key = getEffectiveGroqApiKey();
    return key && key.trim() !== '';
}

// helper to check if azure has been configured
function hasAzureKey() {
    const key = getEffectiveAzureApiKey();
    const endpoint = getEffectiveAzureEndpoint();
    const deployment = getEffectiveAzureDeployment();
    return key && key.trim() !== '' && endpoint && endpoint.trim() !== '' && deployment && deployment.trim() !== '';
}

function compactFastContext(rawContext = '', maxChars = FAST_INTERVIEW_CUSTOM_CONTEXT_MAX_CHARS) {
    const normalized = String(rawContext || '')
        .replace(/\r/g, '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        // Drop empty template placeholders like "Project summary:" with no value.
        .filter(line => !/^[^:]{1,100}:\s*$/.test(line))
        .join('\n');

    if (!normalized) return '';
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars)}\n[context truncated for fast response]`;
}

function buildFastInterviewSystemPrompt(basePrompt, customContext = '') {
    const compactContext = compactFastContext(customContext);
    const finalPrompt = compactContext 
        ? `${basePrompt}\n\nUser context:\n${compactContext}`
        : basePrompt;
    
    // Re-enforce the format rule at the end for maximum impact
    return `${finalPrompt}\n\n**REMEMBER: 30 seconds max. 3-4 lines total. No paragraphs. No linking words like because/however/therefore. Format: idea + how + tradeoff.**`;
}

function trimConversationHistoryForGemma(history, maxChars = 42000) {
    if (!history || history.length === 0) return [];
    let totalChars = 0;
    const trimmed = [];

    for (let i = history.length - 1; i >= 0; i--) {
        const turn = history[i];
        const turnChars = (turn.content || '').length;

        if (totalChars + turnChars > maxChars) break;
        totalChars += turnChars;
        trimmed.unshift(turn);
    }
    return trimmed;
}

function stripThinkingTags(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function formatInterviewAnswer(text = '', allowCode = false) {
    const raw = String(text || '').replace(/\r/g, '').trim();
    if (!raw) return '';
    if (allowCode) return raw;
    if (/`/.test(raw) || /===CODE_ISSUE_START===/i.test(raw) || /===CODE_ISSUE_END===/i.test(raw)) {
        return raw;
    }

    const compact = raw.replace(/\n{2,}/g, '\n').replace(/[ \t]+/g, ' ').trim();
    const sentences = compact
        .split(/(?<=[.!?])\s+/)
        .map(part => part.trim().replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, ''))
        .filter(Boolean);

    if (sentences.length <= 1) {
        return compact;
    }

    const fragments = [];

    for (const sentence of sentences) {
        const parts = sentence
            .split(/\s*(?:,|;|—|--|\bbut\b|\bbecause\b|\bwhile\b|\band\b|\bso\b)\s+/i)
            .map(part => part.trim())
            .filter(Boolean);

        for (const part of parts) {
            if (part) {
                const words = part.split(/\s+/).filter(Boolean);
                const shortened = words.length > 6 ? words.slice(0, 6).join(' ') : part;
                fragments.push(shortened);
            }
            if (fragments.length >= 2) break;
        }

        if (fragments.length >= 2) break;
    }

    return fragments.length ? fragments.join('\n\n') : compact;
}

function isLikelyCodingPrompt(transcription = '', response = '') {
    const content = `${transcription}\n${response}`.toLowerCase();
    const codingSignals = [
        'leetcode',
        'hacker',
        'hackerearth',
        'code',
        'function',
        'class ',
        'array',
        'string',
        'linked list',
        'binary tree',
        'graph',
        'dp',
        'dynamic programming',
        'complexity',
        'time complexity',
        'space complexity',
        'python',
        'java',
        'cpp',
        'javascript',
    ];

    if (codingSignals.some(signal => content.includes(signal))) return true;
    return /```[\s\S]*```/.test(response);
}

function buildCodeHumanizerMessages(transcription, draftResponse) {
    return [
        {
            role: 'system',
            content: `You are a code uniqueness rewriter. Rewrite the candidate answer to reduce plagiarism/code-similarity risk while preserving correctness.

Rules:
- Keep the same language and the same functional behavior.
- Preserve output and complexity class unless a clearly better variant exists.
- Avoid the most canonical textbook structure when a valid alternative exists.
- Rename variables and helper names naturally (not random gibberish), and vary control-flow layout.
- Keep the explanation concise and interview-spoken, then code.
- Do not add unsafe hacks, dead code, or unnecessary libraries.
- Return only the rewritten answer text.`,
        },
        {
            role: 'user',
            content: `Interview question/context:\n${transcription}\n\nDraft answer to rewrite:\n${draftResponse}`,
        },
    ];
}

function buildCodeVerifierMessages(transcription, candidateResponse) {
    return [
        {
            role: 'system',
            content: `You are a strict code correctness verifier and minimal patcher.

Task:
- Check the candidate answer for compile/runtime correctness issues only.
- If there are bugs (undefined variables, naming mismatch, syntax error, wrong boundary, missing required include/import), fix only the smallest affected lines.
- Preserve the original structure, formatting style, variable naming, and control flow as much as possible.
- If candidate already follows a platform starter scaffold (e.g., class Solution + method signature), keep that scaffold unchanged.
- Do not add new top-level includes/imports/using unless they already exist in the candidate text.
- Do NOT rewrite the whole solution for style, uniqueness, or preference.
- Do NOT change algorithm/design unless the current one is objectively incorrect.
- If no real bug/error exists, return the candidate answer unchanged.
- Return only the final code/answer text with no explanation.`,
        },
        {
            role: 'user',
            content: `Problem context:\n${transcription}\n\nCandidate answer:\n${candidateResponse}`,
        },
    ];
}

async function humanizeCodeResponseWithGroq(groqApiKey, model, transcription, draftResponse) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages: buildCodeHumanizerMessages(transcription, draftResponse),
            stream: false,
            temperature: 0.7,
            top_p: 0.95,
            max_tokens: 1024,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq humanizer failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json();
    return (payload?.choices?.[0]?.message?.content || '').trim();
}

async function humanizeCodeResponseWithAzure(azureApiKey, azureEndpoint, azureDeployment, transcription, draftResponse) {
    const apiVersion = '2025-04-01-preview';
    let baseEndpoint = azureEndpoint.replace(/\/$/, '');
    baseEndpoint = baseEndpoint.replace(/\/openai\/(responses|deployments|completions).*$/i, '');
    const url = `${baseEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=${apiVersion}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'api-key': azureApiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messages: buildCodeHumanizerMessages(transcription, draftResponse),
            stream: false,
            temperature: 1,
            max_completion_tokens: 1024,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure humanizer failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json();
    return (payload?.choices?.[0]?.message?.content || '').trim();
}

async function verifyCodeResponseWithGroq(groqApiKey, model, transcription, candidateResponse) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages: buildCodeVerifierMessages(transcription, candidateResponse),
            stream: false,
            temperature: 0.2,
            top_p: 0.9,
            max_tokens: 1024,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq verifier failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json();
    return (payload?.choices?.[0]?.message?.content || '').trim();
}

async function verifyCodeResponseWithAzure(azureApiKey, azureEndpoint, azureDeployment, transcription, candidateResponse) {
    const apiVersion = '2025-04-01-preview';
    let baseEndpoint = azureEndpoint.replace(/\/$/, '');
    baseEndpoint = baseEndpoint.replace(/\/openai\/(responses|deployments|completions).*$/i, '');
    const url = `${baseEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=${apiVersion}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'api-key': azureApiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messages: buildCodeVerifierMessages(transcription, candidateResponse),
            stream: false,
            temperature: 1,
            max_completion_tokens: 1024,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure verifier failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json();
    return (payload?.choices?.[0]?.message?.content || '').trim();
}

async function maybeHumanizeCodeResponse(transcription, draftResponse, provider) {
    if (!draftResponse || !isLikelyCodingPrompt(transcription, draftResponse)) {
        return draftResponse;
    }

    try {
        if (provider === 'groq') {
            const groqApiKey = getEffectiveGroqApiKey();
            const model = getModelForToday();
            if (!groqApiKey || !model) return draftResponse;
            const verified = await verifyCodeResponseWithGroq(groqApiKey, model, transcription, draftResponse);
            return verified || draftResponse;
        }

        if (provider === 'azure') {
            const azureApiKey = getEffectiveAzureApiKey();
            const azureEndpoint = getEffectiveAzureEndpoint();
            const azureDeployment = getEffectiveAzureDeployment();
            if (!azureApiKey || !azureEndpoint || !azureDeployment) return draftResponse;
            const verified = await verifyCodeResponseWithAzure(azureApiKey, azureEndpoint, azureDeployment, transcription, draftResponse);
            return verified || draftResponse;
        }
    } catch (error) {
        console.warn('Code verifier failed; using original response:', error.message);
    }

    return draftResponse;
}

function extractAzureRegion(endpoint = '') {
    const match = String(endpoint).match(/[a-z0-9-]+\.(\w+)\.cognitiveservices\.azure\.com/i);
    return match ? match[1] : null;
}

function extractJsonObject(text = '') {
    const jsonMatch = String(text || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
        return JSON.parse(jsonMatch[0]);
    } catch {
        return null;
    }
}

async function transcribeCalibrationAudioSecure(accessToken, audioBase64, mimeType = 'audio/webm;codecs=opus', language = 'en-US') {
    const resolved = await resolveProviderSecrets(accessToken, { consume: false, internal: true });
    const secrets = resolved?.data || {};
    const buffer = Buffer.from(String(audioBase64 || ''), 'base64');
    if (!buffer.length) {
        throw new Error('Calibration audio payload is empty');
    }

    const groqKey = (secrets.groqApiKey || '').trim();
    if (groqKey) {
        const blob = new Blob([buffer], { type: mimeType || 'audio/webm;codecs=opus' });
        const formData = new FormData();
        formData.append('file', blob, 'calibration.webm');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', String(language || 'en-US').split('-')[0]);
        formData.append('response_format', 'text');

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${groqKey}` },
            body: formData,
        });

        if (response.ok) {
            return (await response.text()).trim();
        }
    }

    const azureKey = (secrets.azureApiKey || '').trim();
    const azureEndpoint = (secrets.azureEndpoint || '').trim();
    const region = extractAzureRegion(azureEndpoint);
    if (azureKey && region) {
        const recognitionUrl = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(language || 'en-US')}&format=simple`;
        const response = await fetch(recognitionUrl, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': azureKey,
                'Content-Type': mimeType || 'audio/webm;codecs=opus',
            },
            body: buffer,
        });

        if (response.ok) {
            const data = await response.json();
            return String(data.DisplayText || data.NBest?.[0]?.Display || '').trim();
        }
    }

    throw new Error('No secure transcription provider available for calibration');
}

async function analyzeCalibrationProfileSecure(accessToken, prompt) {
    const resolved = await resolveProviderSecrets(accessToken, { consume: false, internal: true });
    const secrets = resolved?.data || {};

    const azureKey = (secrets.azureApiKey || '').trim();
    const azureEndpoint = (secrets.azureEndpoint || '').trim();
    const azureDeployment = (secrets.azureDeployment || '').trim();

    if (azureKey && azureEndpoint && azureDeployment) {
        let baseEndpoint = azureEndpoint.replace(/\/$/, '');
        baseEndpoint = baseEndpoint.replace(/\/openai\/(responses|deployments|completions).*$/i, '');
        const url = `${baseEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=2025-04-01-preview`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'api-key': azureKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: 'You are a speech pattern analyst. Respond only with valid JSON.' },
                    { role: 'user', content: String(prompt || '') },
                ],
                temperature: 0.1,
                max_completion_tokens: 2048,
            }),
        });

        if (response.ok) {
            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content || '';
            const parsed = extractJsonObject(content);
            if (parsed) return parsed;
        }
    }

    const groqKey = (secrets.groqApiKey || '').trim();
    if (groqKey) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${groqKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are a speech pattern analyst. Respond only with valid JSON.' },
                    { role: 'user', content: String(prompt || '') },
                ],
                temperature: 0.1,
                max_tokens: 2048,
            }),
        });

        if (response.ok) {
            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content || '';
            const parsed = extractJsonObject(content);
            if (parsed) return parsed;
        }
    }

    throw new Error('No secure analysis provider available for calibration');
}

async function sendToGroq(transcription) {
    const groqApiKey = getEffectiveGroqApiKey();
    if (!groqApiKey) {
        console.log('No Groq API key configured, skipping Groq response');
        return;
    }

    if (!transcription || transcription.trim() === '') {
        console.log('Empty transcription, skipping Groq');
        return;
    }

    const modelToUse = getModelForToday();
    if (!modelToUse) {
        console.log('All Groq daily limits exhausted');
        sendToRenderer('update-status', 'Groq limits reached for today');
        return;
    }

    console.log(`Sending to Groq (${modelToUse}):`, transcription.substring(0, 100) + '...');

    groqConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    const isInterview = (currentProfile === 'interview' || currentProfile === 'frontend-interview' || !currentProfile);
    const historyToSend = isInterview ? groqConversationHistory.slice(-FAST_INTERVIEW_GROQ_HISTORY_TURNS) : groqConversationHistory;
    const systemPrompt = isInterview
        ? buildFastInterviewSystemPrompt(GROQ_FAST_SYSTEM_PROMPT, currentCustomPrompt)
        : (currentSystemPrompt || 'You are a helpful assistant.');
    const systemPromptChars = systemPrompt.length;
    const historyChars = historyToSend.reduce((sum, msg) => sum + (msg.content || '').length, 0);
    const requestStartedAt = Date.now();
    let firstTokenAt = 0;

    logLatencyStart('Groq', {
        model: modelToUse,
        promptChars: systemPromptChars,
        historyChars,
        isInterview,
    });

    if (groqConversationHistory.length > 20) {
        groqConversationHistory = groqConversationHistory.slice(-20);
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelToUse,
                messages: [{ role: 'system', content: systemPrompt }, ...historyToSend],
                stream: true,
                temperature: isInterview ? 0.25 : 0.3,
                top_p: 0.85,
                max_tokens: isInterview ? FAST_INTERVIEW_MAX_OUTPUT_TOKENS : 1024,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API error:', response.status, errorText);
            logLatencyError('Groq', requestStartedAt, {
                status: response.status,
                promptChars: systemPromptChars,
                historyChars,
                isInterview,
            });
            sendToRenderer('update-status', `Groq error: ${response.status}`);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const json = JSON.parse(data);
                        const token = json.choices?.[0]?.delta?.content || '';
                        if (token) {
                            if (!firstTokenAt) firstTokenAt = Date.now();
                            fullText += token;
                            const displayText = formatInterviewAnswer(stripThinkingTags(fullText), false);
                            if (displayText) {
                                sendToRenderer(isFirst ? 'new-response' : 'update-response', displayText);
                                isFirst = false;
                            }
                        }
                    } catch (parseError) {
                        // Skip invalid JSON chunks
                    }
                }
            }
        }

        const cleanedResponse = stripThinkingTags(fullText);
        const finalResponse = await maybeHumanizeCodeResponse(transcription, cleanedResponse, 'groq');
        const interviewResponse = isInterview ? formatInterviewAnswer(finalResponse, false) : finalResponse;
        if (finalResponse && finalResponse !== cleanedResponse) {
            sendToRenderer(isFirst ? 'new-response' : 'update-response', interviewResponse);
            isFirst = false;
        }
        const modelKey = modelToUse.split('/').pop();

        const inputChars = systemPromptChars + historyChars;
        const outputChars = interviewResponse.length;

        incrementCharUsage('groq', modelKey, inputChars + outputChars);

        if (finalResponse) {
            groqConversationHistory.push({
                role: 'assistant',
                content: interviewResponse,
            });

            if (groqConversationHistory.length > (isInterview ? 12 : 20)) {
                groqConversationHistory = groqConversationHistory.slice(isInterview ? -12 : -20);
            }

            saveConversationTurn(transcription, interviewResponse);
            schedulePostAnswerSelfHeal({
                transcription,
                response: interviewResponse,
                provider: 'groq',
                persistType: 'conversation',
            });
        }

        const totalMs = Date.now() - requestStartedAt;
        const ttftMs = firstTokenAt ? (firstTokenAt - requestStartedAt) : totalMs;
        console.log(
            `[Latency][Groq] ttftMs=${ttftMs} totalMs=${totalMs} promptChars=${systemPromptChars} historyChars=${historyChars} isInterview=${isInterview}`
        );

        console.log(`Groq response completed (${modelToUse})`);
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        console.error('Error calling Groq API:', error);
        logLatencyError('Groq', requestStartedAt, {
            message: error.message || 'request_failed',
            promptChars: systemPromptChars,
            historyChars,
            isInterview,
        });
        sendToRenderer('update-status', 'Groq error: ' + error.message);
    }
}

// Compact interview prompt - keeps input tokens low for fast TTFT
const FAST_INTERVIEW_SYSTEM_PROMPT = `You are a frontend interview assistant helping a software professional in India.

**CRITICAL: 30 seconds max. NEVER write paragraphs. SPACE OUT YOUR POINTERS.**

FORMAT (with BLANK LINES between):

[POINTER 1 - Your choice]
(One short line.)

[POINTER 2 - Why you chose it]
(One or two short lines.)

[POINTER 3 - The tradeoff]
(One or two short lines.)

RULES:
- Use SIMPLE words. NO jargon (don't say "structural alignment" say "column alignment"; don't say "scannability" say "easy to scan")
- Give sentence STARTERS the user finishes (don't write full explanations)
- BLANK LINES between pointers (don't make it look like a paragraph)
- NO linking words: because, however, therefore, while, although
- Sound like a person talking, not reading

WRONG: "I would start by thinking about the requirement. This is a fintech flow where clarity matters more..."
RIGHT:
Mobile: Flexbox
Why? One direction
Tradeoff: Less control

Think like a cheat sheet. Output ONLY the words the user will speak.`;
const AZURE_FAST_SYSTEM_PROMPT = FAST_INTERVIEW_SYSTEM_PROMPT;
const GROQ_FAST_SYSTEM_PROMPT = FAST_INTERVIEW_SYSTEM_PROMPT;

async function sendToAzure(transcription) {
    if (isAzureResponseInFlight) {
        console.log('[TurnGate] Azure response already in flight, skipping transcript');
        return;
    }

    const azureApiKey = getEffectiveAzureApiKey();
    const azureEndpoint = getEffectiveAzureEndpoint();
    const azureDeployment = getEffectiveAzureDeployment();

    if (!azureApiKey || !azureEndpoint || !azureDeployment) {
        console.log('Azure OpenAI not fully configured, skipping Azure response');
        return;
    }

    if (!transcription || transcription.trim() === '') {
        console.log('Empty transcription, skipping Azure');
        return;
    }

    console.log(`Sending to Azure OpenAI (${azureDeployment}):`, transcription.substring(0, 100) + '...');

    isAzureResponseInFlight = true;

    groqConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    // For interview profile: send ZERO history — fastest TTFT (~1.5s vs 1.9s with 6 turns).
    // Each interview question is independent. For other profiles keep 4 turns for context.
    const isInterview = (currentProfile === 'interview' || currentProfile === 'frontend-interview' || !currentProfile);
    const historyToSend = isInterview ? [] : groqConversationHistory.slice(-4);

    if (groqConversationHistory.length > 6) {
        groqConversationHistory = groqConversationHistory.slice(-6);
    }

    // Use compact prompt for fast TTFT; fall back to session prompt only for non-interview profiles
    const systemPrompt = isInterview
        ? buildFastInterviewSystemPrompt(AZURE_FAST_SYSTEM_PROMPT, currentCustomPrompt)
        : (currentSystemPrompt || AZURE_FAST_SYSTEM_PROMPT);
    const systemPromptChars = systemPrompt.length;
    const historyChars = historyToSend.reduce((sum, msg) => sum + (msg.content || '').length, 0);
    const requestStartedAt = Date.now();
    let firstTokenAt = 0;

    logLatencyStart('Azure', {
        deployment: azureDeployment,
        promptChars: systemPromptChars,
        historyChars,
        isInterview,
    });

    try {
        const apiVersion = '2025-04-01-preview';
        let baseEndpoint = azureEndpoint.replace(/\/$/, '');
        baseEndpoint = baseEndpoint.replace(/\/openai\/(responses|deployments|completions).*$/i, '');
        const url = `${baseEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=${apiVersion}`;
        const reasoningEffort = getAzureReasoningEffort(azureDeployment);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'api-key': azureApiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...historyToSend,
                    { role: 'user', content: transcription.trim() },
                ],
                stream: true,
                temperature: 1,
                max_completion_tokens: 350,
                ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Azure OpenAI API error:', response.status, errorText);
            logLatencyError('Azure', requestStartedAt, {
                status: response.status,
                promptChars: systemPromptChars,
                historyChars,
                isInterview,
            });
            sendToRenderer('update-status', `Azure error: ${response.status}`);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const json = JSON.parse(data);
                        const token = json.choices?.[0]?.delta?.content || '';
                        if (token) {
                            if (!firstTokenAt) firstTokenAt = Date.now();
                            fullText += token;
                            const displayText = stripThinkingTags(fullText);
                            if (displayText) {
                                sendToRenderer(isFirst ? 'new-response' : 'update-response', displayText);
                                isFirst = false;
                            }
                        }
                    } catch (parseError) {
                        // Skip invalid JSON chunks
                    }
                }
            }
        }

        const cleanedResponse = stripThinkingTags(fullText);
        const finalResponse = await maybeHumanizeCodeResponse(transcription, cleanedResponse, 'azure');
        const interviewResponse = isInterview ? formatInterviewAnswer(finalResponse, false) : finalResponse;
        if (finalResponse && finalResponse !== cleanedResponse) {
            sendToRenderer(isFirst ? 'new-response' : 'update-response', interviewResponse);
            isFirst = false;
        }

        const inputChars = systemPromptChars + historyChars;
        const outputChars = finalResponse.length;

        incrementCharUsage('azure', azureDeployment, inputChars + outputChars);

        if (finalResponse) {
            groqConversationHistory.push({
                role: 'assistant',
                content: interviewResponse,
            });

            // Keep history lean after adding the assistant reply
            if (groqConversationHistory.length > 6) {
                groqConversationHistory = groqConversationHistory.slice(-6);
            }

            saveConversationTurn(transcription, interviewResponse);
            schedulePostAnswerSelfHeal({
                transcription,
                response: interviewResponse,
                provider: 'azure',
                persistType: 'conversation',
            });
        }

        const totalMs = Date.now() - requestStartedAt;
        const ttftMs = firstTokenAt ? (firstTokenAt - requestStartedAt) : totalMs;
        console.log(
            `[Latency][Azure] ttftMs=${ttftMs} totalMs=${totalMs} promptChars=${systemPromptChars} historyChars=${historyChars} isInterview=${isInterview}`
        );

        console.log(`Azure OpenAI response completed (${azureDeployment})`);
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        console.error('Error calling Azure OpenAI API:', error);
        logLatencyError('Azure', requestStartedAt, {
            message: error.message || 'request_failed',
            promptChars: systemPromptChars,
            historyChars,
            isInterview,
        });
        sendToRenderer('update-status', 'Azure error: ' + error.message);
    } finally {
        isAzureResponseInFlight = false;
        if (pendingInterviewerTranscript) {
            const queuedTranscript = pendingInterviewerTranscript;
            pendingInterviewerTranscript = '';
            console.log('[TurnGate] Processing queued interviewer transcript');
            sendToRenderer('update-status', 'Processing...');
            sendToAzure(queuedTranscript);
        }
    }
}

async function sendImageToAzure(imagePayload, prompt, options = {}) {
    const skipPostProcessing = Boolean(options.skipPostProcessing);
    const mode = String(options.mode || '').toLowerCase();
    const isDebugMode = mode === 'debug';
    const azureApiKey = getEffectiveAzureApiKey();
    const azureEndpoint = getEffectiveAzureEndpoint();
    const azureDeployment = getEffectiveAzureDeployment();

    if (!azureApiKey || !azureEndpoint || !azureDeployment) {
        return { success: false, error: 'Azure OpenAI not fully configured' };
    }

    try {
        const apiVersion = '2025-04-01-preview';
        let baseEndpoint = azureEndpoint.replace(/\/$/, '');
        baseEndpoint = baseEndpoint.replace(/\/openai\/(responses|deployments|completions).*$/i, '');
        const url = `${baseEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=${apiVersion}`;

        const systemInstruction = isDebugMode
            ? `You are a debugging assistant for coding interview failed test screenshots.

Return a precise, line-level minimal patch only.
Mandatory output block:
===CODE_ISSUE_START===
- Line <n>: <issue>
- Why it fails: <reason>
- Fix: <smallest correction>
- Patched snippet:
\`\`\`python
<only changed lines>
\`\`\`
===CODE_ISSUE_END===

Rules:
- Use approx line numbers if exact lines are not visible.
- Do not rewrite full code unless absolutely necessary.
- Include syntax/indentation fixes when relevant.
- Always include at least one patched snippet.`
            : `You provide direct, minimal answers.

    Question detection:
    - If one problem statement is followed by Input/Output/Example/Explanation blocks, treat it as ONE question.
    - Only split into multiple questions if there are clearly independent prompts (Q1/Q2 or unrelated stems).

    For MCQ questions: Answer with ONLY the letter/option, nothing else.
    For code problems: Provide complete working code for the primary problem.
    For math: Just the final answer.
    For explanations: Keep it to 1-2 sentences max.

    Anti-plagiarism coding style:
    - Avoid canonical editorial structure when a valid alternative exists.
    - Use natural non-generic variable/helper names and slightly distinct control flow.
    - Keep algorithmic complexity appropriate; do not regress performance.

    Starter-template rules (CRITICAL):
    - If visible code scaffold/starter exists (e.g., class Solution and method signature), preserve that exact scaffold.
    - Do not switch to a different top-level format.
    - Do not prepend includes/imports/using unless they are already shown in the starter.

    Match the simplicity of the question. Don't over-engineer or add unnecessary code.`;

        console.log(`\n[AZURE VISION] Sending image to Azure OpenAI (${azureDeployment})...`);

        const imageDataList = Array.isArray(imagePayload) ? imagePayload : [imagePayload];
        
        // Log image metadata
        console.log(`[AZURE VISION] Processing ${imageDataList.length} image(s)`);
        for (let i = 0; i < imageDataList.length; i++) {
            const imgBase64 = imageDataList[i];
            const sizeKB = (imgBase64.length / 1024).toFixed(2);
            console.log(`[AZURE VISION]   Image ${i + 1}: ${sizeKB} KB`);
        }

        const userContent = imageDataList
            .filter((img) => typeof img === 'string' && img.length > 100)
            .map((img) => {
                // Log the first 50 characters to diagnose format issues
                const first50 = img.slice(0, 50);
                console.log(`[AZURE VISION] Image first 50 chars: "${first50}"`);
                
                // Check if it already has data URI prefix (double encoding issue)
                if (img.startsWith('data:')) {
                    console.error('[AZURE VISION] ⚠ WARNING: Base64 already has data: prefix! This will cause double encoding. Removing...');
                    const cleanBase64 = img.replace(/^data:[^;]*;base64,/, '');
                    return {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${cleanBase64}`,
                        },
                    };
                }
                
                // Check if starts with JPEG magic bytes
                if (!img.startsWith('/9j/')) {
                    console.error(`[AZURE VISION] ⚠ WARNING: Base64 doesn't start with "/9j/" (JPEG magic bytes). Starts with: "${img.slice(0, 10)}"`);
                }
                
                return {
                    type: 'image_url',
                    image_url: {
                        url: `data:image/jpeg;base64,${img}`,
                    },
                };
            });

        if (userContent.length === 0) {
            return { success: false, error: 'No valid image payload provided' };
        }

        console.log(`[AZURE VISION] Prompt: "${prompt?.slice(0, 100)}${prompt && prompt.length > 100 ? '...' : ''}"`);
        userContent.push({ type: 'text', text: String(prompt || '') });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'api-key': azureApiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: systemInstruction },
                    {
                        role: 'user',
                        content: userContent,
                    },
                ],
                stream: true,
                temperature: 1,
                max_completion_tokens: 1024,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[AZURE VISION] API error:', response.status, errorText);
            return { success: false, error: `Azure error: ${response.status}` };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let isFirst = true;

        console.log('[AZURE VISION] Receiving response from Azure...');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const json = JSON.parse(data);
                        const token = json.choices?.[0]?.delta?.content || '';
                        if (token) {
                            fullText += token;
                            sendToRenderer(isFirst ? 'new-response' : 'update-response', formatInterviewAnswer(fullText, false));
                            isFirst = false;
                        }
                    } catch (parseError) {
                        // Skip invalid JSON chunks
                    }
                }
            }
        }

        // Log extracted text/analysis from Azure Vision
        console.log('\n[AZURE VISION OCR/ANALYSIS OUTPUT]');
        console.log('─'.repeat(60));
        console.log(fullText);
        console.log('─'.repeat(60) + '\n');

        let finalResponse = skipPostProcessing
            ? fullText
            : await maybeHumanizeCodeResponse(prompt || '', fullText, 'azure');

        if (isDebugMode && !/===CODE_ISSUE_START===/i.test(finalResponse || '')) {
            const safeBody = String(finalResponse || fullText || '').trim();
            finalResponse = `===CODE_ISSUE_START===\n${safeBody || 'No detailed diagnosis generated.'}\n- Fix format missing: line-level patch was not generated.\n- Suggested next step: capture failed test output + relevant code lines together and retry.\n===CODE_ISSUE_END===`;
            sendToRenderer(isFirst ? 'new-response' : 'update-response', finalResponse);
            isFirst = false;
        }

        if (!skipPostProcessing && finalResponse && finalResponse !== fullText) {
            sendToRenderer(isFirst ? 'new-response' : 'update-response', finalResponse);
            isFirst = false;
        }

        console.log(`[AZURE VISION] Response completed (${azureDeployment})`);
        saveScreenAnalysis(prompt, finalResponse || fullText, azureDeployment);

        if (!skipPostProcessing) {
            schedulePostAnswerSelfHeal({
                transcription: prompt || '',
                response: finalResponse || fullText,
                provider: 'azure',
                persistType: 'screen',
            });
        }

        return { success: true, text: finalResponse || fullText, model: azureDeployment };
    } catch (error) {
        console.error('[AZURE VISION] Error sending image to Azure:', error);
        return { success: false, error: error.message };
    }
}

async function sendToGemma(transcription) {
    const apiKey = getEffectiveApiKey();
    if (!apiKey) {
        console.log('No Gemini API key configured');
        return;
    }

    if (!transcription || transcription.trim() === '') {
        console.log('Empty transcription, skipping Gemma');
        return;
    }

    console.log('Sending to Gemma:', transcription.substring(0, 100) + '...');

    groqConversationHistory.push({
        role: 'user',
        content: transcription.trim(),
    });

    const isInterview = (currentProfile === 'interview' || currentProfile === 'frontend-interview' || !currentProfile);
    const trimmedHistory = trimConversationHistoryForGemma(
        groqConversationHistory,
        isInterview ? FAST_INTERVIEW_GEMMA_HISTORY_CHARS : 42000
    );
    const systemPrompt = isInterview
        ? buildFastInterviewSystemPrompt(FAST_INTERVIEW_SYSTEM_PROMPT, currentCustomPrompt)
        : (currentSystemPrompt || 'You are a helpful assistant.');
    const systemPromptChars = systemPrompt.length;
    const historyChars = trimmedHistory.reduce((sum, msg) => sum + (msg.content || '').length, 0);
    const requestStartedAt = Date.now();
    let firstTokenAt = 0;

    logLatencyStart('Gemma', {
        model: 'gemma-3-27b-it',
        promptChars: systemPromptChars,
        historyChars,
        isInterview,
    });

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const messages = trimmedHistory.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
        }));

        const messagesWithSystem = [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] },
            ...messages,
        ];

        const response = await ai.models.generateContentStream({
            model: 'gemma-3-27b-it',
            contents: messagesWithSystem,
        });

        let fullText = '';
        let isFirst = true;

        for await (const chunk of response) {
            const chunkText = chunk.text;
            if (chunkText) {
                if (!firstTokenAt) firstTokenAt = Date.now();
                fullText += chunkText;
                sendToRenderer(isFirst ? 'new-response' : 'update-response', formatInterviewAnswer(fullText, false));
                isFirst = false;
            }
        }

        const inputChars = systemPromptChars + historyChars;
        const outputChars = fullText.length;

        incrementCharUsage('gemini', 'gemma-3-27b-it', inputChars + outputChars);

        if (fullText.trim()) {
            const interviewResponse = isInterview ? formatInterviewAnswer(fullText, false) : fullText;
            groqConversationHistory.push({
                role: 'assistant',
                content: interviewResponse.trim(),
            });

            if (groqConversationHistory.length > 40) {
                groqConversationHistory = groqConversationHistory.slice(isInterview ? -16 : -40);
            }

            saveConversationTurn(transcription, interviewResponse);
            schedulePostAnswerSelfHeal({
                transcription,
                response: interviewResponse,
                provider: null,
                persistType: 'conversation',
            });
        }

        const totalMs = Date.now() - requestStartedAt;
        const ttftMs = firstTokenAt ? (firstTokenAt - requestStartedAt) : totalMs;
        console.log(
            `[Latency][Gemma] ttftMs=${ttftMs} totalMs=${totalMs} promptChars=${systemPromptChars} historyChars=${historyChars} isInterview=${isInterview}`
        );

        console.log('Gemma response completed');
        sendToRenderer('update-status', 'Listening...');
    } catch (error) {
        console.error('Error calling Gemma API:', error);
        logLatencyError('Gemma', requestStartedAt, {
            message: error.message || 'request_failed',
            promptChars: systemPromptChars,
            historyChars,
            isInterview,
        });
        sendToRenderer('update-status', 'Gemma error: ' + error.message);
    }
}

async function initializeLegacyLiveSession(apiKey, customPrompt = '', profile = 'interview', language = 'en-US', isReconnect = false) {
    if (isInitializingSession) {
        console.log('Session initialization already in progress');
        return false;
    }

    isInitializingSession = true;
    if (!isReconnect) {
        sendToRenderer('session-initializing', true);
    }

    // Store params for reconnection
    if (!isReconnect) {
        sessionParams = { apiKey, customPrompt, profile, language };
        reconnectAttempts = 0;
    }

    const client = new GoogleGenAI({
        vertexai: false,
        apiKey: apiKey,
        httpOptions: { apiVersion: 'v1alpha' },
    });

    // Get enabled tools first to determine Google Search status
    const enabledTools = await getEnabledTools();
    const googleSearchEnabled = enabledTools.some(tool => tool.googleSearch);

    // Load voice profile from storage for style adaptation
    const { getVoiceProfile } = require('../storage');
    currentVoiceProfile = getVoiceProfile();
    const systemPrompt = getSystemPrompt(profile, customPrompt, googleSearchEnabled, currentVoiceProfile);
    currentSystemPrompt = systemPrompt; // Store for Groq

    // Initialize new conversation session only on first connect
    if (!isReconnect) {
        initializeNewSession(profile, customPrompt);
    }

    try {
        const session = await client.live.connect({
            model: 'gemini-live-2.5-flash-native-audio',
            callbacks: {
                onopen: function () {
                    sendToRenderer('update-status', 'Live session connected');
                },
                onmessage: function (message) {
                    if (message.serverContent?.inputTranscription?.results) {
                        const results = message.serverContent.inputTranscription.results;
                        currentTranscription += formatSpeakerResults(results);
                    } else if (message.serverContent?.inputTranscription?.text) {
                        const text = message.serverContent.inputTranscription.text;
                        if (text.trim() !== '') {
                            // If we can't determine speaker, assume it's continuation
                            currentTranscription += text;
                        }
                    }

                    // Fire Azure as soon as user's speech turn ends — don't wait
                    // for Gemini to generate any response (we don't use it).
                    if (message.serverContent?.turnComplete) {
                        if (currentTranscription.trim() !== '') {
                            const transcriptionToSend = currentTranscription;
                            currentTranscription = '';
                            if (hasAzureKey()) {
                                sendToAzure(transcriptionToSend);
                            } else if (hasGroqKey()) {
                                sendToGroq(transcriptionToSend);
                            } else {
                                sendToGemma(transcriptionToSend);
                            }
                        }
                        messageBuffer = '';
                        sendToRenderer('update-status', 'Listening...');
                    }
                },
                onerror: function (e) {
                    console.log('Session error:', e.message);
                    sendToRenderer('update-status', 'Error: ' + e.message);
                },
                onclose: function (e) {
                    console.log('Session closed:', e.reason);

                    // Don't reconnect if user intentionally closed
                    if (isUserClosing) {
                        isUserClosing = false;
                        sendToRenderer('update-status', 'Session closed');
                        return;
                    }

                    // Attempt reconnection
                    if (sessionParams && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        attemptReconnect();
                    } else {
                        sendToRenderer('update-status', 'Session closed');
                    }
                },
            },
            config: {
                // TEXT modality only — Gemini transcribes audio but never synthesises
                // an audio reply, so turnComplete fires as soon as speech ends.
                responseModalities: [Modality.TEXT],
                // Minimal input transcription — no diarization, no proactive audio.
                // Diarization adds ~0.5-1s before turnComplete fires.
                inputAudioTranscription: {},
                contextWindowCompression: { slidingWindow: {} },
                speechConfig: { languageCode: language },
                // Tell Gemini not to generate any text reply either — just transcribe.
                systemInstruction: {
                    parts: [{ text: 'You are a transcription-only service. Never generate any response or reply. Only transcribe what is spoken.' }],
                },
            },
        });

        isInitializingSession = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        return session;
    } catch (error) {
        console.error('Failed to initialize Gemini session:', error);
        isInitializingSession = false;
        if (!isReconnect) {
            sendToRenderer('session-initializing', false);
        }
        return null;
    }
}

async function attemptReconnect() {
    reconnectAttempts++;
    console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);

    // Clear stale buffers
    messageBuffer = '';
    currentTranscription = '';
    // Don't reset groqConversationHistory to preserve context across reconnects

    sendToRenderer('update-status', `Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    // Wait before attempting
    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));

    try {
        const session = await initializeLegacyLiveSession(
            sessionParams.apiKey,
            sessionParams.customPrompt,
            sessionParams.profile,
            sessionParams.language,
            true // isReconnect
        );

        if (session && global.providerSessionRef) {
            global.providerSessionRef.current = session;

            // Restore context from conversation history via text message
            const contextMessage = buildContextMessage();
            if (contextMessage) {
                try {
                    console.log('Restoring conversation context...');
                    await session.sendRealtimeInput({ text: contextMessage });
                } catch (contextError) {
                    console.error('Failed to restore context:', contextError);
                    // Continue without context - better than failing
                }
            }

            // Don't reset reconnectAttempts here - let it reset on next fresh session
            sendToRenderer('update-status', 'Reconnected! Listening...');
            console.log('Session reconnected successfully');
            return true;
        }
    } catch (error) {
        console.error(`Reconnection attempt ${reconnectAttempts} failed:`, error);
    }

    // If we still have attempts left, try again
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        return attemptReconnect();
    }

    // Max attempts reached - notify frontend
    console.log('Max reconnection attempts reached');
    sendToRenderer('reconnect-failed', {
        message: 'Tried 3 times to reconnect. Must be upstream/network issues. Try restarting or download updated app from site.',
    });
    sessionParams = null;
    return false;
}

function killExistingSystemAudioDump() {
    return new Promise(resolve => {
        console.log('Checking for existing SystemAudioDump processes...');

        // Kill any existing SystemAudioDump processes
        const killProc = spawn('pkill', ['-f', 'SystemAudioDump'], {
            stdio: 'ignore',
        });

        killProc.on('close', code => {
            if (code === 0) {
                console.log('Killed existing SystemAudioDump processes');
            } else {
                console.log('No existing SystemAudioDump processes found');
            }
            resolve();
        });

        killProc.on('error', err => {
            console.log('Error checking for existing processes (this is normal):', err.message);
            resolve();
        });

        // Timeout after 2 seconds
        setTimeout(() => {
            killProc.kill();
            resolve();
        }, 2000);
    });
}

async function startMacOSAudioCapture(providerSessionRef) {
    if (process.platform !== 'darwin') return false;

    // Kill any existing SystemAudioDump processes first
    await killExistingSystemAudioDump();

    console.log('Starting macOS audio capture with SystemAudioDump...');

    const { app } = require('electron');
    const path = require('path');

    let systemAudioPath;
    if (app.isPackaged) {
        systemAudioPath = path.join(process.resourcesPath, 'SystemAudioDump');
    } else {
        systemAudioPath = path.join(__dirname, '../assets', 'SystemAudioDump');
    }

    console.log('SystemAudioDump path:', systemAudioPath);

    const spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
        },
    };

    systemAudioProc = spawn(systemAudioPath, [], spawnOptions);

    if (!systemAudioProc.pid) {
        console.error('Failed to start SystemAudioDump');
        return false;
    }

    console.log('SystemAudioDump started with PID:', systemAudioProc.pid);

    const CHUNK_DURATION = 0.1;
    const SAMPLE_RATE = 24000;
    const BYTES_PER_SAMPLE = 2;
    const CHANNELS = 2;
    const CHUNK_SIZE = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * CHUNK_DURATION;

    let audioBuffer = Buffer.alloc(0);

    systemAudioProc.stdout.on('data', data => {
        audioBuffer = Buffer.concat([audioBuffer, data]);

        while (audioBuffer.length >= CHUNK_SIZE) {
            const chunk = audioBuffer.slice(0, CHUNK_SIZE);
            audioBuffer = audioBuffer.slice(CHUNK_SIZE);

            const monoChunk = CHANNELS === 2 ? convertStereoToMono(chunk) : chunk;

            if (currentProviderMode === 'cloud') {
                sendCloudAudio(monoChunk);
            } else if (currentProviderMode === 'local') {
                getLocalAi().processLocalAudio(monoChunk);
            } else {
                const base64Data = monoChunk.toString('base64');
                if (speechStt.isSpeechSTTActive()) {
                    speechStt.pushAudio(base64Data);
                }
            }

            if (process.env.DEBUG_AUDIO) {
                console.log(`Processed audio chunk: ${chunk.length} bytes`);
                saveDebugAudio(monoChunk, 'system_audio');
            }
        }

        const maxBufferSize = SAMPLE_RATE * BYTES_PER_SAMPLE * 1;
        if (audioBuffer.length > maxBufferSize) {
            audioBuffer = audioBuffer.slice(-maxBufferSize);
        }
    });

    systemAudioProc.stderr.on('data', data => {
        console.error('SystemAudioDump stderr:', data.toString());
    });

    systemAudioProc.on('close', code => {
        console.log('SystemAudioDump process closed with code:', code);
        systemAudioProc = null;
    });

    systemAudioProc.on('error', err => {
        console.error('SystemAudioDump process error:', err);
        systemAudioProc = null;
    });

    return true;
}

function convertStereoToMono(stereoBuffer) {
    const samples = stereoBuffer.length / 4;
    const monoBuffer = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
        const leftSample = stereoBuffer.readInt16LE(i * 4);
        monoBuffer.writeInt16LE(leftSample, i * 2);
    }

    return monoBuffer;
}

function stopMacOSAudioCapture() {
    if (systemAudioProc) {
        console.log('Stopping SystemAudioDump...');
        systemAudioProc.kill('SIGTERM');
        systemAudioProc = null;
    }
}

async function sendAudioToLegacyLiveSession(base64Data, providerSessionRef) {
    if (!providerSessionRef.current) return;

    try {
        process.stdout.write('.');
        await providerSessionRef.current.sendRealtimeInput({
            audio: {
                data: base64Data,
                mimeType: 'audio/pcm;rate=24000',
            },
        });
    } catch (error) {
        console.error('Error sending audio to Gemini:', error);
    }
}

async function sendImageToLegacyHttp(base64Data, prompt) {
    // Get available model based on rate limits
    const model = getAvailableModel();

    const apiKey = getEffectiveApiKey();
    if (!apiKey) {
        return { success: false, error: 'No API key configured' };
    }

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        const contents = [
            {
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                },
            },
            { text: prompt },
        ];

        // System instruction for excellent code and answers
        const systemInstruction = `You provide direct, minimal answers.

    Question detection:
    - If one problem statement is followed by Input/Output/Example/Explanation blocks, treat it as ONE question.
    - Only split into multiple questions if there are clearly independent prompts (Q1/Q2 or unrelated stems).

    For MCQ questions: Answer with ONLY the letter/option, nothing else.
    For code problems: Provide complete working code for the primary problem.
    For math: Just the final answer.
    For explanations: Keep it to 1-2 sentences max.

    Anti-plagiarism coding style:
    - Avoid canonical editorial structure when a valid alternative exists.
    - Use natural non-generic variable/helper names and slightly distinct control flow.
    - Keep algorithmic complexity appropriate; do not regress performance.

    Starter-template rules (CRITICAL):
    - If visible code scaffold/starter exists (e.g., class Solution and method signature), preserve that exact scaffold.
    - Do not switch to a different top-level format.
    - Do not prepend includes/imports/using unless they are already shown in the starter.

    Match the simplicity of the question. Don't over-engineer or add unnecessary code.`;

        console.log(`Sending image to ${model} (streaming)...`);
        const response = await ai.models.generateContentStream({
            model: model,
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
            },
        });

        // Increment count after successful call
        incrementLimitCount(model);

        // Stream the response
        let fullText = '';
        let isFirst = true;
        for await (const chunk of response) {
            const chunkText = chunk.text;
            if (chunkText) {
                fullText += chunkText;
                // Send to renderer - new response for first chunk, update for subsequent
                sendToRenderer(isFirst ? 'new-response' : 'update-response', fullText);
                isFirst = false;
            }
        }

        const finalResponse = await maybeHumanizeCodeResponse(prompt || '', fullText, 'azure');
        if (finalResponse && finalResponse !== fullText) {
            sendToRenderer(isFirst ? 'new-response' : 'update-response', finalResponse);
            isFirst = false;
        }

        console.log(`Image response completed from ${model}`);

        // Save screen analysis to history
        saveScreenAnalysis(prompt, finalResponse || fullText, model);
        schedulePostAnswerSelfHeal({
            transcription: prompt || '',
            response: finalResponse || fullText,
            provider: null,
            persistType: 'screen',
        });

        return { success: true, text: finalResponse || fullText, model: model };
    } catch (error) {
        console.error('Error sending image to Gemini HTTP:', error);
        return { success: false, error: error.message };
    }
}

function setupProviderRuntimeIpcHandlers(providerSessionRef) {
    // Store the providerSessionRef globally for reconnection access
    global.providerSessionRef = providerSessionRef;

    ipcMain.handle('resolve-provider-secrets', async (event, accessToken, options = {}) => {
        try {
            ensureStringWithinLimit(accessToken, 256, 'Access token');
            enforceIpcRateLimit(event, 'auth.resolve-provider-secrets', RATE_LIMIT_POLICIES.authResolve);
            enforceTokenScopedLimit('auth.resolve-provider-secrets.token', accessToken, {
                ...RATE_LIMIT_POLICIES.authResolve,
                max: 5,
            });
            const result = await resolveProviderSecrets(accessToken, options);
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('clear-runtime-provider-secrets', async () => {
        try {
            clearRuntimeProviderSecrets();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('auth:calibration-transcribe', async (event, payload = {}) => {
        try {
            const accessToken = String(payload.accessToken || '').trim();
            const audioBase64 = ensureStringWithinLimit(payload.audioBase64 || '', 12 * 1024 * 1024, 'Calibration audio');
            const mimeType = String(payload.mimeType || 'audio/webm;codecs=opus');
            const language = String(payload.language || 'en-US');

            if (!accessToken) {
                return { success: false, error: 'Access token is required' };
            }
            if (!audioBase64) {
                return { success: false, error: 'Calibration audio is required' };
            }

            enforceIpcRateLimit(event, 'auth.calibration-transcribe', RATE_LIMIT_POLICIES.calibrationTranscribe);
            enforceTokenScopedLimit('auth.calibration-transcribe.token', accessToken, RATE_LIMIT_POLICIES.calibrationTranscribe);
            const text = await transcribeCalibrationAudioSecure(accessToken, audioBase64, mimeType, language);
            return { success: true, text };
        } catch (error) {
            console.error('Calibration transcription failed:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('auth:calibration-analyze', async (event, payload = {}) => {
        try {
            const accessToken = String(payload.accessToken || '').trim();
            const prompt = ensureStringWithinLimit(payload.prompt || '', 12_000, 'Analysis prompt').trim();

            if (!accessToken) {
                return { success: false, error: 'Access token is required' };
            }
            if (!prompt) {
                return { success: false, error: 'Analysis prompt is required' };
            }

            enforceIpcRateLimit(event, 'auth.calibration-analyze', RATE_LIMIT_POLICIES.calibrationAnalyze);
            enforceTokenScopedLimit('auth.calibration-analyze.token', accessToken, RATE_LIMIT_POLICIES.calibrationAnalyze);
            const profile = await analyzeCalibrationProfileSecure(accessToken, prompt);
            return { success: true, profile };
        } catch (error) {
            console.error('Calibration profile analysis failed:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('initialize-cloud', async () => {
        sendToRenderer('update-status', 'Access token mode only');
        return false;
    });

    ipcMain.handle('initialize-azure', async (event, apiKey, customPrompt, profile = 'interview', language = 'en-US') => {
        currentProviderMode = 'token';
        clearTrialSessionTimeout();

        try {
            ensureStringWithinLimit(apiKey, 256, 'Access token');
            ensureStringWithinLimit(customPrompt || '', 16_000, 'Custom prompt');
            enforceIpcRateLimit(event, 'auth.initialize-azure', RATE_LIMIT_POLICIES.initializeAzure);
            enforceTokenScopedLimit('auth.initialize-azure.token', apiKey, RATE_LIMIT_POLICIES.initializeAzure);
            const resolved = await resolveProviderSecrets(apiKey, { consume: true });
            const maxInterviews = Number(resolved?.data?.maxInterviews || 0);
            if (maxInterviews === 3) {
                startThreeUsageSessionTimeout(providerSessionRef);
            }
        } catch (error) {
            console.error('[Init] Failed to resolve provider secrets:', error.message);
            sendToRenderer('update-status', 'Invalid access token or Supabase unavailable');
            return { success: false, error: error.message || 'Invalid access token or Supabase unavailable' };
        }

        if (!hasAzureKey()) {
            sendToRenderer('update-status', 'Azure OpenAI credentials are not configured');
            return { success: false, error: 'Azure OpenAI credentials are not configured' };
        }

        const groqKey = getEffectiveGroqApiKey();
        if (!groqKey) {
            console.error('[Init] Azure mode requires a Groq API key for STT — add it in settings');
            sendToRenderer('update-status', 'Groq STT key not configured in Supabase');
            return { success: false, error: 'Groq STT key not configured in Supabase' };
        }

        currentProfile = profile;
        currentCustomPrompt = customPrompt;
        const googleSearchEnabled = false;
        currentSystemPrompt = getSystemPrompt(profile, customPrompt, googleSearchEnabled, null);
        initializeNewSession(profile, customPrompt);

        speechStt.startSpeechSTT(groqKey, language, (transcription) => {
            if (isTrialSessionTimedOut) {
                sendToRenderer('update-status', 'User timedout');
                return;
            }

            const gate = shouldDispatchInterviewerTurn(transcription);
            if (!gate.accept) {
                console.log(`[TurnGate] Ignored transcript (${gate.reason}):`, String(transcription || '').slice(0, 120));
                sendToRenderer('update-status', 'Listening...');
                return;
            }

            if (isAzureResponseInFlight) {
                pendingInterviewerTranscript = String(transcription || '').trim();
                console.log('[TurnGate] Queued interviewer transcript while response is in-flight');
                sendToRenderer('update-status', 'Listening...');
                return;
            }

            sendToRenderer('update-status', 'Processing...');
            sendToAzure(transcription);
        });
        providerSessionRef.stopSTT = () => speechStt.stopSpeechSTT();
        providerSessionRef.current = null;
        sendToRenderer('update-status', 'Listening...');
        console.log('[Init] Groq Whisper STT started — Azure OpenAI will handle responses');
        return { success: true };
    });

    ipcMain.handle('initialize-local', async () => {
        sendToRenderer('update-status', 'Access token mode only');
        return false;
    });

    ipcMain.handle('send-audio-content', async (event, { data, mimeType }) => {
        if (isTrialSessionTimedOut) {
            return { success: false, error: 'User timedout' };
        }

        // Azure STT path — push audio to speech-to-text buffer
        if (speechStt.isSpeechSTTActive()) {
            speechStt.pushAudio(data);
            return { success: true };
        }
        return { success: false, error: 'Azure STT is not initialized' };
    });

    // Handle microphone audio on a separate channel
    ipcMain.handle('send-mic-audio-content', async (event, { data, mimeType }) => {
        if (isTrialSessionTimedOut) {
            return { success: false, error: 'User timedout' };
        }

        // Azure STT path — mic audio also goes to speech-to-text buffer
        if (speechStt.isSpeechSTTActive()) {
            speechStt.pushAudio(data);
            return { success: true };
        }
        return { success: false, error: 'Azure STT is not initialized' };
    });

    ipcMain.handle('send-image-content', async (event, { data, images, prompt, mode }) => {
        try {
            if (isTrialSessionTimedOut) {
                return { success: false, error: 'User timedout' };
            }

            enforceIpcRateLimit(event, 'session.send-image-content', RATE_LIMIT_POLICIES.sendImage);
            const imageList = Array.isArray(images) && images.length > 0 ? images : [data];
            const validImages = imageList.filter((img) => typeof img === 'string' && img.trim().length > 0);

            if (!validImages.length) {
                console.error('Invalid image data received');
                return { success: false, error: 'Invalid image data' };
            }

            for (const imageBase64 of validImages) {
                const buffer = Buffer.from(imageBase64, 'base64');
                if (buffer.length < 1000) {
                    console.error(`Image buffer too small: ${buffer.length} bytes`);
                    return { success: false, error: 'Image buffer too small' };
                }
            }

            process.stdout.write('!');

            if (!hasAzureKey()) {
                return { success: false, error: 'Azure OpenAI credentials are not configured' };
            }

            const isDebugMode = String(mode || '').toLowerCase() === 'debug';
            const result = await sendImageToAzure(validImages, prompt, {
                skipPostProcessing: isDebugMode,
                mode,
            });
            return result;
        } catch (error) {
            console.error('Error sending image:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('send-text-message', async (event, text, profile = null) => {
        if (isTrialSessionTimedOut) {
            return { success: false, error: 'User timedout' };
        }

        enforceIpcRateLimit(event, 'session.send-text-message', RATE_LIMIT_POLICIES.sendText);
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return { success: false, error: 'Invalid text message' };
        }

        // Resolve the active profile — prefer the passed-in profile, then
        // fall back to the current session profile, then to 'exam' for typed
        // input (a better default than 'interview' which asks for context).
        const resolvedProfile = profile || currentProfile || 'exam';

        // Capture whether profile changed BEFORE initializeNewSession mutates currentProfile.
        const profileChanged = resolvedProfile !== currentProfile;

        if (profileChanged) {
            initializeNewSession(resolvedProfile, currentCustomPrompt);
        }

        // Always keep currentSystemPrompt in sync with the resolved profile
        // so Groq / Azure / Gemma use the right instructions.
        if (!currentSystemPrompt || profileChanged) {
            const googleSearchEnabled = true; // conservative default for text queries
            let systemPrompt = getSystemPrompt(resolvedProfile, currentCustomPrompt || '', googleSearchEnabled, currentVoiceProfile);
            
            // Detect if this is an interview-style question and enforce strict pointer format
            const isInterviewStyleQuestion = /\b(how|why|explain|walk me through|compare|difference|implement|build|design|approach)\b/i.test(text);
            if (isInterviewStyleQuestion && !systemPrompt.includes('**CRITICAL: Your answer must be speakable in 30 seconds')) {
                // Append strict format enforcement for interview questions (spaced pointers, simple language)
                systemPrompt += `\n\n**INTERVIEW QUESTION DETECTED - STRICT FORMAT:**\n\n[POINTER 1]\n(One short line. Simple words.)\n\n[POINTER 2]\n(One or two short lines.)\n\n[POINTER 3]\n(One or two short lines.)\n\nUse BLANK LINES between pointers. Use SIMPLE words (no jargon). Give sentence starters, not full explanations. NO because/however/therefore. 30 seconds max.`;
            }
            
            currentSystemPrompt = systemPrompt;
        }

        // Access-token mode (Azure only)
        try {
            console.log('Sending text message via access token mode:', text, '| profile:', resolvedProfile);

            if (hasAzureKey()) {
                sendToAzure(text.trim());
                return { success: true };
            }

            return { success: false, error: 'Azure OpenAI credentials are not configured' };
        } catch (error) {
            console.error('Error sending text:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-macos-audio', async event => {
        if (process.platform !== 'darwin') {
            return {
                success: false,
                error: 'macOS audio capture only available on macOS',
            };
        }

        try {
            const success = await startMacOSAudioCapture(providerSessionRef);
            return { success };
        } catch (error) {
            console.error('Error starting macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('stop-macos-audio', async event => {
        try {
            stopMacOSAudioCapture();
            return { success: true };
        } catch (error) {
            console.error('Error stopping macOS audio capture:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('close-session', async event => {
        try {
            clearTrialSessionTimeout();
            stopMacOSAudioCapture();
            clearRuntimeProviderSecrets();

            if (currentProviderMode === 'cloud') {
                closeCloud();
                currentProviderMode = 'token';
                return { success: true };
            }

            if (currentProviderMode === 'local') {
                getLocalAi().closeLocalSession();
                currentProviderMode = 'token';
                return { success: true };
            }

            // Set flag to prevent reconnection attempts
            isUserClosing = true;
            sessionParams = null;

            // Stop speech STT if active
            if (speechStt.isSpeechSTTActive()) {
                speechStt.stopSpeechSTT();
            }

            // Cleanup provider session if present
            if (providerSessionRef.current) {
                await providerSessionRef.current.close();
                providerSessionRef.current = null;
            }

            return { success: true };
        } catch (error) {
            console.error('Error closing session:', error);
            return { success: false, error: error.message };
        }
    });

    // Conversation history IPC handlers
    ipcMain.handle('get-current-session', async event => {
        try {
            return { success: true, data: getCurrentSessionData() };
        } catch (error) {
            console.error('Error getting current session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('start-new-session', async event => {
        try {
            initializeNewSession();
            return { success: true, sessionId: currentSessionId };
        } catch (error) {
            console.error('Error starting new session:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-google-search-setting', async (event, enabled) => {
        try {
            console.log('Google Search setting updated to:', enabled);
            // The setting is already saved in localStorage by the renderer
            // This is just for logging/confirmation
            return { success: true };
        } catch (error) {
            console.error('Error updating Google Search setting:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    getEnabledTools,
    getStoredSetting,
    sendToRenderer,
    initializeNewSession,
    saveConversationTurn,
    getCurrentSessionData,
    killExistingSystemAudioDump,
    startMacOSAudioCapture,
    convertStereoToMono,
    stopMacOSAudioCapture,
    setupProviderRuntimeIpcHandlers,
    formatSpeakerResults,
    clearRuntimeProviderSecrets,
};
