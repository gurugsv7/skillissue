// renderer.js
const { ipcRenderer } = require('electron');

let mediaStream = null;
let screenshotInterval = null;
let audioContext = null;
let audioProcessor = null;
let micAudioProcessor = null;
let audioBuffer = [];
const SAMPLE_RATE = 24000;
const AUDIO_CHUNK_DURATION = 0.1; // seconds
const BUFFER_SIZE = 4096; // Increased buffer size for smoother audio

let hiddenVideo = null;
let offscreenCanvas = null;
let offscreenContext = null;
let currentImageQuality = 'medium'; // Store current image quality for manual screenshots
let pendingDualScreenshotBase64List = [];
let dualScreenshotTimeoutHandle = null;
let dualScreenshotRequestInFlight = false;
let providerSecretsCache = null;
let providerSecretsToken = '';
let providerSecretsResolvedAt = 0;
const PROVIDER_SECRETS_CACHE_TTL_MS = 30 * 60 * 1000;
const DUAL_SCREENSHOT_WAIT_MS = 20000;
const MAX_DUAL_SCREENSHOT_IMAGES = 3;
let lastInitErrorMessage = '';

const isLinux = process.platform === 'linux';
const isMacOS = process.platform === 'darwin';

// ============ STORAGE API ============
// Wrapper for IPC-based storage access
const storage = {
    // Config
    async getConfig() {
        const result = await ipcRenderer.invoke('storage:get-config');
        return result.success ? result.data : {};
    },
    async setConfig(config) {
        return ipcRenderer.invoke('storage:set-config', config);
    },
    async updateConfig(key, value) {
        return ipcRenderer.invoke('storage:update-config', key, value);
    },

    // Credentials
    async getCredentials() {
        const result = await ipcRenderer.invoke('storage:get-credentials');
        return result.success ? result.data : {};
    },
    async setCredentials(credentials) {
        return ipcRenderer.invoke('storage:set-credentials', credentials);
    },
    async clearProviderSecrets() {
        providerSecretsCache = null;
        providerSecretsToken = '';
        providerSecretsResolvedAt = 0;
        return ipcRenderer.invoke('storage:clear-provider-secrets');
    },
    async getAccessToken() {
        const creds = await this.getCredentials();
        return creds.cloudToken || '';
    },
    async setAccessToken(accessToken) {
        const creds = await this.getCredentials();
        providerSecretsCache = null;
        providerSecretsToken = '';
        providerSecretsResolvedAt = 0;
        return this.setCredentials({ ...creds, cloudToken: accessToken });
    },
    async getApiKey() {
        const result = await ipcRenderer.invoke('storage:get-api-key');
        return result.success ? result.data : '';
    },
    async setApiKey(apiKey) {
        return ipcRenderer.invoke('storage:set-api-key', apiKey);
    },
    async getGroqApiKey() {
        const result = await ipcRenderer.invoke('storage:get-groq-api-key');
        return result.success ? result.data : '';
    },
    async setGroqApiKey(groqApiKey) {
        return ipcRenderer.invoke('storage:set-groq-api-key', groqApiKey);
    },

    // Azure
    async getAzureApiKey() {
        const result = await ipcRenderer.invoke('storage:get-azure-api-key');
        return result.success ? result.data : '';
    },
    async setAzureApiKey(azureApiKey) {
        return ipcRenderer.invoke('storage:set-azure-api-key', azureApiKey);
    },
    async getAzureEndpoint() {
        const result = await ipcRenderer.invoke('storage:get-azure-endpoint');
        return result.success ? result.data : '';
    },
    async setAzureEndpoint(azureEndpoint) {
        return ipcRenderer.invoke('storage:set-azure-endpoint', azureEndpoint);
    },
    async getAzureDeployment() {
        const result = await ipcRenderer.invoke('storage:get-azure-deployment');
        return result.success ? result.data : '';
    },
    async setAzureDeployment(azureDeployment) {
        return ipcRenderer.invoke('storage:set-azure-deployment', azureDeployment);
    },

    // Preferences
    async getPreferences() {
        const result = await ipcRenderer.invoke('storage:get-preferences');
        return result.success ? result.data : {};
    },
    async setPreferences(preferences) {
        return ipcRenderer.invoke('storage:set-preferences', preferences);
    },
    async updatePreference(key, value) {
        return ipcRenderer.invoke('storage:update-preference', key, value);
    },

    // Keybinds
    async getKeybinds() {
        const result = await ipcRenderer.invoke('storage:get-keybinds');
        return result.success ? result.data : null;
    },
    async setKeybinds(keybinds) {
        return ipcRenderer.invoke('storage:set-keybinds', keybinds);
    },

    // Sessions (History)
    async getAllSessions() {
        const result = await ipcRenderer.invoke('storage:get-all-sessions');
        return result.success ? result.data : [];
    },
    async getSession(sessionId) {
        const result = await ipcRenderer.invoke('storage:get-session', sessionId);
        return result.success ? result.data : null;
    },
    async saveSession(sessionId, data) {
        return ipcRenderer.invoke('storage:save-session', sessionId, data);
    },
    async deleteSession(sessionId) {
        return ipcRenderer.invoke('storage:delete-session', sessionId);
    },
    async deleteAllSessions() {
        return ipcRenderer.invoke('storage:delete-all-sessions');
    },

    // Clear all
    async clearAll() {
        return ipcRenderer.invoke('storage:clear-all');
    },

    // Voice profile
    async getVoiceProfile() {
        const result = await ipcRenderer.invoke('storage:get-voice-profile');
        return result.success ? result.data : null;
    },
    async saveVoiceProfile(profile) {
        return ipcRenderer.invoke('storage:save-voice-profile', profile);
    },
    async deleteVoiceProfile() {
        return ipcRenderer.invoke('storage:delete-voice-profile');
    },

    // Limits
    async getTodayLimits() {
        const result = await ipcRenderer.invoke('storage:get-today-limits');
        return result.success ? result.data : { flash: { count: 0 }, flashLite: { count: 0 } };
    },
};

// Cache for preferences to avoid async calls in hot paths
let preferencesCache = null;

async function loadPreferencesCache() {
    preferencesCache = await storage.getPreferences();
    return preferencesCache;
}

// Initialize preferences cache
loadPreferencesCache();

function convertFloat32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        // Improved scaling to prevent clipping
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function buildCombinedContext(prefs) {
    const custom = (prefs.customPrompt || '').trim();
    const resume = (prefs.resumeText || '').trim();
    if (custom && resume) return `${custom}\n\n--- Resume ---\n${resume}`;
    if (resume) return `--- Resume ---\n${resume}`;
    return custom;
}

async function initializeAzure(profile = 'interview', language = 'en-US') {
    const accessToken = await storage.getAccessToken();
    if (!accessToken || !accessToken.trim()) {
        lastInitErrorMessage = 'Access token is required.';
        hintio.setStatus('error');
        return false;
    }

    const preflight = await getProviderSecrets(accessToken.trim(), { consume: false });
    if (!preflight?.success) {
        lastInitErrorMessage = parseAccessTokenErrorMessage(preflight?.error);
        hintio.setStatus(lastInitErrorMessage);
        return false;
    }

    const prefs = await storage.getPreferences();
    const initResult = await ipcRenderer.invoke('initialize-azure', accessToken.trim(), buildCombinedContext(prefs), profile, language);
    const success = initResult === true || initResult?.success === true;
    if (success) {
        lastInitErrorMessage = '';
        hintio.setStatus('Live');
        return true;
    }

    const runtimeError = typeof initResult === 'object' ? (initResult.error || '') : '';
    if (runtimeError) {
        lastInitErrorMessage = parseAccessTokenErrorMessage(runtimeError);
    }

    if (!lastInitErrorMessage) {
        lastInitErrorMessage = 'Unable to start session with this access token.';
    }
    hintio.setStatus('error');
    return false;
}

function parseAccessTokenErrorMessage(errorText = '') {
    const normalized = String(errorText || '').toLowerCase();
    if (normalized.includes('usage limit') || normalized.includes('interviews used') || normalized.includes('exhausted')) {
        return 'Access token usage limit reached.';
    }
    if (normalized.includes('invalid or expired access token')) {
        return 'Access token is invalid or expired.';
    }
    if (normalized.includes('access token is required') || normalized.includes('missing access token')) {
        return 'Access token is required.';
    }
    if (normalized.includes('azure openai credentials are not configured')) {
        return 'Service is not configured right now. Please try again shortly.';
    }
    if (normalized.includes('groq stt key not configured')) {
        return 'Speech service is not configured right now. Please try again shortly.';
    }
    if (normalized.includes('secret resolution failed (403)')) {
        return 'Access token is invalid or expired.';
    }
    if (normalized.includes('supabase runtime is not configured') || normalized.includes('supabase unavailable')) {
        return 'Token validation service is unavailable right now.';
    }
    return 'Unable to validate access token. Please try again.';
}

function getLastInitError() {
    return lastInitErrorMessage || '';
}

async function clearSessionProviderSecrets() {
    try {
        const creds = await storage.getCredentials();
        const token = (creds.cloudToken || '').trim();
        if (!token) return { success: true, skipped: true };

        await storage.clearProviderSecrets();
        await ipcRenderer.invoke('clear-runtime-provider-secrets').catch(() => ({ success: false }));
        lastInitErrorMessage = '';
        return { success: true };
    } catch (error) {
        console.error('Error clearing session provider secrets:', error);
        return { success: false, error: error.message };
    }
}

async function getProviderSecrets(accessToken = null, options = {}) {
    const consume = Boolean(options.consume);
    const resolvedAccessToken = accessToken || (await storage.getAccessToken());
    if (!resolvedAccessToken || !resolvedAccessToken.trim()) {
        return { success: false, error: 'Missing access token' };
    }

    const token = resolvedAccessToken.trim();
    const now = Date.now();
    if (
        !consume
        && providerSecretsCache
        && providerSecretsToken === token
        && (now - providerSecretsResolvedAt) < PROVIDER_SECRETS_CACHE_TTL_MS
    ) {
        return { success: true, data: providerSecretsCache, cached: true };
    }

    const resolved = await ipcRenderer.invoke('resolve-provider-secrets', token, { consume });
    if (resolved?.success && resolved?.data) {
        providerSecretsCache = resolved.data;
        providerSecretsToken = token;
        providerSecretsResolvedAt = now;
    }

    return resolved;
}

async function initializeLocal(profile = 'interview') {
    hintio.setStatus('Access token mode only');
    return false;
}

async function initializeCloud(profile = 'interview') {
    hintio.setStatus('Access token mode only');
    return false;
}

// Listen for status updates
ipcRenderer.on('update-status', (event, status) => {
    console.log('Status update:', status);
    hintio.setStatus(status);
});

async function startCapture(screenshotIntervalSeconds = 5, imageQuality = 'medium') {
    // Store the image quality for manual screenshots
    currentImageQuality = imageQuality;

    // Refresh preferences cache
    await loadPreferencesCache();
    const audioMode = preferencesCache.audioMode || 'speaker_only';

    if (audioMode === 'none') {
        // Only screenshots, no audio capture at all
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                frameRate: 1,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
            },
            audio: false,
        });
        console.log('No Audio mode: only screenshots will be captured');
        return;
    }

    try {
        if (isMacOS) {
            // On macOS, use SystemAudioDump for audio and getDisplayMedia for screen
            console.log('Starting macOS capture with SystemAudioDump...');

            // Start macOS audio capture
            const audioResult = await ipcRenderer.invoke('start-macos-audio');
            if (!audioResult.success) {
                throw new Error('Failed to start macOS audio capture: ' + audioResult.error);
            }

            // Get screen capture for screenshots
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: 1,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio: false, // Don't use browser audio on macOS
            });

            console.log('macOS screen capture started - audio handled by SystemAudioDump');

            if (audioMode === 'mic_only' || audioMode === 'both') {
                let micStream = null;
                try {
                    micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            sampleRate: SAMPLE_RATE,
                            channelCount: 1,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                        video: false,
                    });
                    console.log('macOS microphone capture started');
                    setupLinuxMicProcessing(micStream);
                } catch (micError) {
                    console.warn('Failed to get microphone access on macOS:', micError);
                }
            }
        } else if (isLinux) {
            // Linux - use display media for screen capture and try to get system audio
            try {
                // First try to get system audio via getDisplayMedia (works on newer browsers)
                mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        frameRate: 1,
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: {
                        sampleRate: SAMPLE_RATE,
                        channelCount: 1,
                        echoCancellation: false, // Don't cancel system audio
                        noiseSuppression: false,
                        autoGainControl: false,
                    },
                });

                console.log('Linux system audio capture via getDisplayMedia succeeded');

                // Setup audio processing for Linux system audio
                setupLinuxSystemAudioProcessing();
            } catch (systemAudioError) {
                console.warn('System audio via getDisplayMedia failed, trying screen-only capture:', systemAudioError);

                // Fallback to screen-only capture
                mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        frameRate: 1,
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false,
                });
            }

            // Additionally get microphone input for Linux based on audio mode
            if (audioMode === 'mic_only' || audioMode === 'both') {
                let micStream = null;
                try {
                    micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            sampleRate: SAMPLE_RATE,
                            channelCount: 1,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                        video: false,
                    });

                    console.log('Linux microphone capture started');

                    // Setup audio processing for microphone on Linux
                    setupLinuxMicProcessing(micStream);
                } catch (micError) {
                    console.warn('Failed to get microphone access on Linux:', micError);
                    // Continue without microphone if permission denied
                }
            }

            console.log('Linux capture started - system audio:', mediaStream.getAudioTracks().length > 0, 'microphone mode:', audioMode);
        } else {
            // Windows - use display media with loopback for system audio
            mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: 1,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio: {
                    sampleRate: SAMPLE_RATE,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            console.log('Windows capture started with loopback audio');

            // Setup audio processing for Windows loopback audio only
            setupWindowsLoopbackProcessing();

            if (audioMode === 'mic_only' || audioMode === 'both') {
                let micStream = null;
                try {
                    micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            sampleRate: SAMPLE_RATE,
                            channelCount: 1,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                        video: false,
                    });
                    console.log('Windows microphone capture started');
                    setupLinuxMicProcessing(micStream);
                } catch (micError) {
                    console.warn('Failed to get microphone access on Windows:', micError);
                }
            }
        }

        console.log('MediaStream obtained:', {
            hasVideo: mediaStream.getVideoTracks().length > 0,
            hasAudio: mediaStream.getAudioTracks().length > 0,
            videoTrack: mediaStream.getVideoTracks()[0]?.getSettings(),
        });

        // Manual mode only - screenshots captured on demand via shortcut
        console.log('Manual mode enabled - screenshots will be captured on demand only');
    } catch (err) {
        console.error('Error starting capture:', err);
        hintio.setStatus('error');
    }
}

function setupLinuxMicProcessing(micStream) {
    // Setup microphone audio processing for Linux
    const micAudioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const micSource = micAudioContext.createMediaStreamSource(micStream);
    const micProcessor = micAudioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let audioBuffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    micProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioBuffer.push(...inputData);

        // Process audio in chunks
        while (audioBuffer.length >= samplesPerChunk) {
            const chunk = audioBuffer.splice(0, samplesPerChunk);
            const pcmData16 = convertFloat32ToInt16(chunk);
            const base64Data = arrayBufferToBase64(pcmData16.buffer);

            await ipcRenderer.invoke('send-mic-audio-content', {
                data: base64Data,
                mimeType: 'audio/pcm;rate=24000',
            });
        }
    };

    micSource.connect(micProcessor);
    micProcessor.connect(micAudioContext.destination);

    // Store processor reference for cleanup
    micAudioProcessor = micProcessor;
}

function setupLinuxSystemAudioProcessing() {
    // Setup system audio processing for Linux (from getDisplayMedia)
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(mediaStream);
    audioProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let audioBuffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    audioProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioBuffer.push(...inputData);

        // Process audio in chunks
        while (audioBuffer.length >= samplesPerChunk) {
            const chunk = audioBuffer.splice(0, samplesPerChunk);
            const pcmData16 = convertFloat32ToInt16(chunk);
            const base64Data = arrayBufferToBase64(pcmData16.buffer);

            await ipcRenderer.invoke('send-audio-content', {
                data: base64Data,
                mimeType: 'audio/pcm;rate=24000',
            });
        }
    };

    source.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);
}

function setupWindowsLoopbackProcessing() {
    // Setup audio processing for Windows loopback audio only
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(mediaStream);
    audioProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    let audioBuffer = [];
    const samplesPerChunk = SAMPLE_RATE * AUDIO_CHUNK_DURATION;

    audioProcessor.onaudioprocess = async e => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioBuffer.push(...inputData);

        // Process audio in chunks
        while (audioBuffer.length >= samplesPerChunk) {
            const chunk = audioBuffer.splice(0, samplesPerChunk);
            const pcmData16 = convertFloat32ToInt16(chunk);
            const base64Data = arrayBufferToBase64(pcmData16.buffer);

            await ipcRenderer.invoke('send-audio-content', {
                data: base64Data,
                mimeType: 'audio/pcm;rate=24000',
            });
        }
    };

    source.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);
}

async function captureScreenshot(imageQuality = 'medium', isManual = false) {
    console.log(`Capturing ${isManual ? 'manual' : 'automated'} screenshot...`);
    if (!mediaStream) return;

    // Lazy init of video element
    if (!hiddenVideo) {
        hiddenVideo = document.createElement('video');
        hiddenVideo.srcObject = mediaStream;
        hiddenVideo.muted = true;
        hiddenVideo.playsInline = true;
        await hiddenVideo.play();

        await new Promise(resolve => {
            if (hiddenVideo.readyState >= 2) return resolve();
            hiddenVideo.onloadedmetadata = () => resolve();
        });

        // Lazy init of canvas based on video dimensions
        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = hiddenVideo.videoWidth;
        offscreenCanvas.height = hiddenVideo.videoHeight;
        offscreenContext = offscreenCanvas.getContext('2d');
    }

    // Check if video is ready
    if (hiddenVideo.readyState < 2) {
        console.warn('Video not ready yet, skipping screenshot');
        return;
    }

    offscreenContext.drawImage(hiddenVideo, 0, 0, offscreenCanvas.width, offscreenCanvas.height);

    // Check if image was drawn properly by sampling a pixel
    const imageData = offscreenContext.getImageData(0, 0, 1, 1);
    const isBlank = imageData.data.every((value, index) => {
        // Check if all pixels are black (0,0,0) or transparent
        return index === 3 ? true : value === 0;
    });

    if (isBlank) {
        console.warn('Screenshot appears to be blank/black');
    }

    let qualityValue;
    switch (imageQuality) {
        case 'high':
            qualityValue = 0.9;
            break;
        case 'medium':
            qualityValue = 0.7;
            break;
        case 'low':
            qualityValue = 0.5;
            break;
        default:
            qualityValue = 0.7; // Default to medium
    }

    offscreenCanvas.toBlob(
        async blob => {
            if (!blob) {
                console.error('Failed to create blob from canvas');
                return;
            }

            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64data = reader.result.split(',')[1];

                // Validate base64 data
                if (!base64data || base64data.length < 100) {
                    console.error('Invalid base64 data generated');
                    return;
                }

                const result = await ipcRenderer.invoke('send-image-content', {
                    data: base64data,
                });

                if (result.success) {
                    console.log(`Image sent successfully (${offscreenCanvas.width}x${offscreenCanvas.height})`);
                } else {
                    console.error('Failed to send image:', result.error);
                }
            };
            reader.readAsDataURL(blob);
        },
        'image/jpeg',
        qualityValue
    );
}

const MANUAL_SCREENSHOT_PROMPT = `Analyze the screenshot and detect questions accurately.

QUESTION DETECTION RULES (CRITICAL):
1) If a screenshot shows ONE coding problem statement followed by multiple "Input/Output/Example/Explanation" blocks, treat it as ONE question only.
2) Treat examples, sample I/O, constraints, and hints as supporting details for that same primary problem — NOT separate questions.
3) Only treat content as MULTIPLE questions when they are clearly independent (e.g., explicit Q1/Q2 numbering or unrelated stems).
4) If there is ambiguity, prefer a single primary-question interpretation.

**IMPORTANT — NO INTERVIEWER IS PRESENT:** This is a silent screen analysis. The user is NOT speaking to anyone right now. Go CODE-FIRST: provide working, complete code immediately with NO introductory sentences, NO "Sure!", NO "Here's the code:", NO preamble whatsoever. Just the answer or code block directly.

Format:
- Output exactly one Q/ANS pair for a single primary problem, OR multiple Q/ANS pairs only when truly independent questions are visible.
- MCQ: "Q1: [question]" then "ANS: [correct option letter]) [option text]" — identify which option letter (A/B/C/D/etc.) is actually correct and output that letter. NEVER default to A unless A is genuinely the right answer. Example: "ANS: C) Nominal Data"
- Math: "Q: [question]" then "ANS: [final answer]"
- Code: "Q: [question]" then "ANS: [working code — no preamble, start with the code block]"
- Text: "Q: [question]" then "ANS: [1-2 sentence answer]"

CODE TEMPLATE PRESERVATION (CRITICAL):
- If the screenshot shows starter/template code (e.g., LeetCode class + function signature), preserve that structure.
- Do NOT replace with a totally different file shape.
- Do NOT add top-level includes/imports/using statements unless they are already present in the visible starter.
- Prefer returning only the function/class body that matches the on-screen scaffold.

CODE ORIGINALITY RULES (ANTI-PLAGIARISM):
- Avoid textbook/canonical LeetCode editorial structure when a correct alternative exists.
- Use natural but less-generic variable names and slightly different control-flow/helper decomposition.
- Keep correctness and complexity class appropriate; do not degrade performance just to look different.
- Output should look like human-authored interview code, not template boilerplate.

If a question is partially visible, extract as much as possible and answer based on visible context.

NO introductions, NO "Certainly!", NO "Here is...", NO reasoning preamble, NO "the answer is". Only the extracted questions and their direct answers.

ADDITIONAL TASKS (append these at the very end of your response, each on its own line):

1. LAYOUT DETECTION: Analyze where the code editor, input area, or answer entry zone is positioned on screen. On its own line at the end, output exactly:
===LAYOUT:position===
where position is one of: left, right, center, top-left, top-right, bottom-left, bottom-right. This describes where the user's INPUT/CODE area is.

2. CODE ISSUE DETECTION: If you notice any bug, error, wrong logic, syntax issue, or mistake in code visible on screen, append:
===CODE_ISSUE_START===
[2-3 sentence description of the issue and the fix]
===CODE_ISSUE_END===
If no code issues are found, do NOT include the CODE_ISSUE markers at all.`;

const DUAL_SCREENSHOT_PROMPT_PREFIX = `You are receiving MULTIPLE screenshots (2 to 3) from the same coding question.
Treat all screenshots as a single combined context and answer based on the complete question across images.
If text is split across screenshots, merge it logically before answering.

`;

const DEBUG_SCREENSHOT_PROMPT = `You are debugging a coding interview failed test case from a screenshot.

GOAL:
- Focus on identifying the exact bug causing failure.
- Prefer minimal fixes, not full rewrites.
- If screenshot code is partial, use the previous AI-generated code context provided below.

OUTPUT RULES (STRICT):
1) Base every claim on visible evidence from screenshot or PREVIOUS_CODE_CONTEXT. Do not invent missing tokens/braces/operators.
2) If you cite a line, include the exact broken fragment from that line in backticks.
3) Prioritize compiler/runtime error text visible in screenshot; explain why that specific error happens.
4) Provide only the smallest changed snippet (not full solution), preserving existing structure.
5) If evidence is insufficient, say "Need more visible code context" instead of guessing.
6) Mark uncertainty explicitly; never present uncertain fixes as facts.
7) If code logic appears correct but compile/parser errors persist, treat it as a COMPATIBILITY issue and propose the smallest compiler-friendly rewrite.

COMPATIBILITY MODE (when compiler/toolchain is strict):
- Prefer tiny syntax/type-level rewrites before any logic rewrite.
- Keep algorithm and control-flow identical.
- Typical safe examples: add missing namespace qualification, make lambda return type explicit, simplify recursive callable signature/type, replace fragile expression forms with equivalent clearer form.
- Label this as "Compatibility workaround" (not "logic bug") unless evidence proves logic is wrong.
- Never claim "known compiler bug" as a fact unless error text/context explicitly supports it.

MANDATORY MARKER BLOCK:
===CODE_ISSUE_START===
- Line <n or approx n>
- Locate by search: \`<exact unique fragment to find in code>\`
- Replace:
    old: \`<exact old text>\`
    new: \`<exact new text>\`
- Classification: <Logic bug | Syntax error | Compatibility workaround>
- Why it fails: <reason>
- Fix: <smallest correction>
- Patched snippet:
\`\`\`
<only changed lines, include 1-2 surrounding lines for context>
\`\`\`
===CODE_ISSUE_END===

Do NOT replace the entire answer with a fresh full solution unless absolutely required.
Do NOT output unrelated optimizations.
Do NOT claim "missing brace/semicolon" unless you can point to the exact unmatched fragment in visible code.
Do NOT output vague advice. Every fix must include a concrete old->new replacement.
Do NOT force type changes (e.g., bool -> int) unless needed for compatibility with the shown error.
`;

function markScreenAnalysisTriggered(mode = 'manual') {
    const app = hintio.element?.();
    if (!app) return;
    app._awaitingScreenAnalysis = true;
    app._screenAnalysisMode = mode;
    app._layoutRepositioned = false;
    app._errorContent = '';
}

function extractLastCodeBlock(text = '') {
    const matches = [...String(text || '').matchAll(/```(?:[a-zA-Z0-9_+-]+)?\n([\s\S]*?)```/g)];
    if (!matches.length) return '';
    return (matches[matches.length - 1]?.[1] || '').trim();
}

function buildPreviousCodeContext() {
    const app = hintio.element?.();
    const responses = Array.isArray(app?.responses) ? app.responses : [];
    if (!responses.length) return '';

    let fallbackCode = '';
    for (let index = responses.length - 1; index >= 0; index -= 1) {
        const candidate = String(responses[index] || '');
        const codeBlock = extractLastCodeBlock(candidate);
        if (codeBlock) {
            fallbackCode = codeBlock;
            break;
        }
    }

    if (!fallbackCode) {
        fallbackCode = String(responses[responses.length - 1] || '');
    }

    if (!fallbackCode.trim()) return '';

    const MAX_CONTEXT_CHARS = 7000;
    const trimmed = fallbackCode.length > MAX_CONTEXT_CHARS
        ? fallbackCode.slice(fallbackCode.length - MAX_CONTEXT_CHARS)
        : fallbackCode;

    return `\n\nPREVIOUS_CODE_CONTEXT (use this if screenshot code is partial):\n\`\`\`\n${trimmed}\n\`\`\``;
}

function clearPendingDualScreenshotState() {
    if (dualScreenshotTimeoutHandle) {
        clearTimeout(dualScreenshotTimeoutHandle);
        dualScreenshotTimeoutHandle = null;
    }
    pendingDualScreenshotBase64List = [];
}

function armDualScreenshotTimeout() {
    if (dualScreenshotTimeoutHandle) {
        clearTimeout(dualScreenshotTimeoutHandle);
    }
    dualScreenshotTimeoutHandle = setTimeout(async () => {
        if (!pendingDualScreenshotBase64List.length || dualScreenshotRequestInFlight) {
            return;
        }

        if (pendingDualScreenshotBase64List.length >= 2) {
            await sendPendingDualScreenshots('timeout');
            return;
        }

        console.log('Dual screenshot timed out with only one capture');
        clearPendingDualScreenshotState();
        hintio.setStatus('Dual screenshot canceled (need at least 2 captures)');
    }, DUAL_SCREENSHOT_WAIT_MS);
}

async function sendPendingDualScreenshots(trigger = 'manual') {
    if (dualScreenshotRequestInFlight) return;
    if (pendingDualScreenshotBase64List.length < 2) return;

    const imagesToSend = [...pendingDualScreenshotBase64List];
    clearPendingDualScreenshotState();
    dualScreenshotRequestInFlight = true;

    try {
        hintio.setStatus(`Analyzing ${imagesToSend.length} screenshots...`);

        const result = await ipcRenderer.invoke('send-image-content', {
            images: imagesToSend,
            prompt: `${DUAL_SCREENSHOT_PROMPT_PREFIX}${MANUAL_SCREENSHOT_PROMPT}`,
        });

        if (result.success) {
            console.log(`${trigger} multi-image response completed from ${result.model}`);
        } else {
            console.error('Failed to get multi-image response:', result.error);
            hintio.addNewResponse(`Error: ${result.error}`);
        }
    } finally {
        dualScreenshotRequestInFlight = false;
    }
}

async function captureFrameToBase64(imageQuality = null) {
    const quality = imageQuality || currentImageQuality;

    if (!mediaStream) {
        console.error('No media stream available');
        return null;
    }

    if (!hiddenVideo) {
        hiddenVideo = document.createElement('video');
        hiddenVideo.srcObject = mediaStream;
        hiddenVideo.muted = true;
        hiddenVideo.playsInline = true;
        await hiddenVideo.play();

        await new Promise(resolve => {
            if (hiddenVideo.readyState >= 2) return resolve();
            hiddenVideo.onloadedmetadata = () => resolve();
        });

        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = hiddenVideo.videoWidth;
        offscreenCanvas.height = hiddenVideo.videoHeight;
        offscreenContext = offscreenCanvas.getContext('2d');
    }

    if (hiddenVideo.readyState < 2) {
        console.warn('Video not ready yet, skipping screenshot');
        return null;
    }

    const MAX_WIDTH = 1280;
    const srcW = hiddenVideo.videoWidth;
    const srcH = hiddenVideo.videoHeight;
    let destW = srcW;
    let destH = srcH;
    if (srcW > MAX_WIDTH) {
        destW = MAX_WIDTH;
        destH = Math.round(srcH * (MAX_WIDTH / srcW));
    }
    offscreenCanvas.width = destW;
    offscreenCanvas.height = destH;
    offscreenContext.drawImage(hiddenVideo, 0, 0, destW, destH);

    let qualityValue;
    switch (quality) {
        case 'high':
            qualityValue = 0.85;
            break;
        case 'medium':
            qualityValue = 0.6;
            break;
        case 'low':
            qualityValue = 0.4;
            break;
        default:
            qualityValue = 0.6;
    }

    const base64data = await new Promise(resolve => {
        offscreenCanvas.toBlob(
            blob => {
                if (!blob) {
                    console.error('Failed to create blob from canvas');
                    return resolve(null);
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    const value = reader.result?.split(',')?.[1] || null;
                    resolve(value);
                };
                reader.readAsDataURL(blob);
            },
            'image/jpeg',
            qualityValue
        );
    });

    if (!base64data || base64data.length < 100) {
        console.error('Invalid base64 data generated');
        return null;
    }

    console.log(`Captured image: ${destW}x${destH}, ~${Math.round(base64data.length / 1024)}KB`);
    return base64data;
}

async function captureManualScreenshot(imageQuality = null) {
    console.log('Manual screenshot triggered');
    markScreenAnalysisTriggered('manual');

    const base64data = await captureFrameToBase64(imageQuality);
    if (!base64data) return;

    try {
        const saveResult = await ipcRenderer.invoke('save-debug-screenshot', {
            base64: base64data,
            mode: 'manual',
        });
        if (saveResult?.success && saveResult.filePath) {
            console.log('Saved manual screenshot locally:', saveResult.filePath);
        } else if (saveResult?.error) {
            console.warn('Failed to save manual screenshot locally:', saveResult.error);
        }
    } catch (error) {
        console.warn('Error invoking save-debug-screenshot:', error);
    }

    const result = await ipcRenderer.invoke('send-image-content', {
        data: base64data,
        prompt: MANUAL_SCREENSHOT_PROMPT,
    });

    if (result.success) {
        console.log(`Image response completed from ${result.model}`);
    } else {
        console.error('Failed to get image response:', result.error);
        hintio.addNewResponse(`Error: ${result.error}`);
    }
}

async function captureDualScreenshot(imageQuality = null) {
    console.log('Dual screenshot shortcut triggered');
    markScreenAnalysisTriggered('dual');

    if (dualScreenshotRequestInFlight) {
        console.log('Dual screenshot request already in-flight, ignoring trigger');
        return;
    }

    const image = await captureFrameToBase64(imageQuality);
    if (!image) return;

    pendingDualScreenshotBase64List.push(image);

    if (pendingDualScreenshotBase64List.length >= MAX_DUAL_SCREENSHOT_IMAGES) {
        await sendPendingDualScreenshots('max-captures');
        return;
    }

    armDualScreenshotTimeout();

    if (pendingDualScreenshotBase64List.length === 1) {
        hintio.setStatus('Captured 1/3 — press dual shortcut again for next page');
        return;
    }

    hintio.setStatus('Captured 2/3 — press again for page 3 or wait to auto-send');
}

async function finishDualScreenshotBatch() {
    if (dualScreenshotRequestInFlight) {
        hintio.setStatus('Dual screenshot request already in progress...');
        return;
    }

    if (pendingDualScreenshotBase64List.length < 2) {
        hintio.setStatus('Need at least 2 screenshots before finish');
        return;
    }

    await sendPendingDualScreenshots('manual-finish');
}

async function captureDebugScreenshot(imageQuality = null) {
    console.log('Debug screenshot shortcut triggered');
    markScreenAnalysisTriggered('debug');

    const base64data = await captureFrameToBase64(imageQuality);
    if (!base64data) return;

    hintio.setStatus('Analyzing failed test screenshot...');
    const prompt = `${DEBUG_SCREENSHOT_PROMPT}${buildPreviousCodeContext()}`;

    const result = await ipcRenderer.invoke('send-image-content', {
        data: base64data,
        prompt,
        mode: 'debug',
    });

    if (result.success) {
        console.log(`Debug screenshot response completed from ${result.model}`);
    } else {
        console.error('Failed to debug screenshot:', result.error);
        hintio.addNewResponse(`Error: ${result.error}`);
    }
}

// Expose functions to global scope for external access
window.captureManualScreenshot = captureManualScreenshot;

function stopCapture() {
    clearPendingDualScreenshotState();
    dualScreenshotRequestInFlight = false;

    if (screenshotInterval) {
        clearInterval(screenshotInterval);
        screenshotInterval = null;
    }

    if (audioProcessor) {
        audioProcessor.disconnect();
        audioProcessor = null;
    }

    // Clean up microphone audio processor (Linux only)
    if (micAudioProcessor) {
        micAudioProcessor.disconnect();
        micAudioProcessor = null;
    }

    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    // Stop macOS audio capture if running
    if (isMacOS) {
        ipcRenderer.invoke('stop-macos-audio').catch(err => {
            console.error('Error stopping macOS audio:', err);
        });
    }

    // Clean up hidden elements
    if (hiddenVideo) {
        hiddenVideo.pause();
        hiddenVideo.srcObject = null;
        hiddenVideo = null;
    }
    offscreenCanvas = null;
    offscreenContext = null;
}

// Send text message via active provider runtime
async function sendTextMessage(text) {
    if (!text || text.trim().length === 0) {
        console.warn('Cannot send empty text message');
        return { success: false, error: 'Empty message' };
    }

    // Route typed messages to the correct profile.
    // Typed input is almost always a direct question to the AI, not interview audio
    // transcription — so default to 'exam' (general tutor) rather than 'interview'.
    let profile = window.hintio?.element()?.selectedProfile || 'interview';

    const codingPattern = /(code|function|algorithm|script|program|implement|debug|error|bug|fix|class|object|array|loop|recursion|sql|query|api|regex|json|html|css|javascript|python|java|typescript|react|node|express|django|flask|spring|bash|shell|git|docker|kubernetes|linux|terminal|database|http|async|promise|callback|lambda|deploy|build|compile|sort|search|binary|tree|graph|linked list|stack|queue|heap|hash|dynamic programming)/i;
    const directQuestionPattern = /^(give me|write|create|generate|show me|explain|what is|what are|how (do|does|can|to)|why (is|does|do|did)|when (is|was)|where (is|does)|who (is|are)|define|describe|list|compare|difference between|help me|can you|could you|i need|make me|build|design|calculate|solve|find|tell me|summarize)/i;
    const mcqPattern = /(following|choose|correct answer|option [abcd]|\d+\s*[\)\.]|A\)|B\)|C\)|D\)|which of the|select the|mark the)/i;

    if (mcqPattern.test(text) || codingPattern.test(text) || directQuestionPattern.test(text)) {
        profile = 'exam';
    }

    try {
        const result = await ipcRenderer.invoke('send-text-message', text, profile);
        if (result.success) {
            console.log('Text message sent successfully');
        } else {
            console.error('Failed to send text message:', result.error);
        }
        return result;
    } catch (error) {
        console.error('Error sending text message:', error);
        return { success: false, error: error.message };
    }
}

async function saveTextFile(text, defaultName = 'session-export.txt') {
    try {
        return await ipcRenderer.invoke('save-text-file', { text, defaultName });
    } catch (error) {
        console.error('Error invoking save-text-file:', error);
        return { success: false, error: error.message };
    }
}

// Listen for conversation data from main process and save to storage
ipcRenderer.on('save-conversation-turn', async (event, data) => {
    try {
        await storage.saveSession(data.sessionId, { conversationHistory: data.fullHistory });
        console.log('Conversation session saved:', data.sessionId);
    } catch (error) {
        console.error('Error saving conversation session:', error);
    }
});

// Listen for session context (profile info) when session starts
ipcRenderer.on('save-session-context', async (event, data) => {
    try {
        await storage.saveSession(data.sessionId, {
            profile: data.profile,
            customPrompt: data.customPrompt,
        });
        console.log('Session context saved:', data.sessionId, 'profile:', data.profile);
    } catch (error) {
        console.error('Error saving session context:', error);
    }
});

// Listen for screen analysis responses (from ctrl+enter)
ipcRenderer.on('save-screen-analysis', async (event, data) => {
    try {
        await storage.saveSession(data.sessionId, {
            screenAnalysisHistory: data.fullHistory,
            profile: data.profile,
            customPrompt: data.customPrompt,
        });
        console.log('Screen analysis saved:', data.sessionId);
    } catch (error) {
        console.error('Error saving screen analysis:', error);
    }
});

// Listen for emergency erase command from main process
ipcRenderer.on('clear-sensitive-data', async () => {
    console.log('Clearing all data...');
    await storage.clearAll();
});

// Listen for Telegram image analysis requests
ipcRenderer.on('telegram-image-received', async (event, data) => {
    try {
        const { base64, caption, metadata } = data;

        if (!base64) {
            console.error('No image data in telegram-image-received event');
            return;
        }

        console.log(`\n[TELEGRAM] Image received from Telegram`);
        console.log(`[TELEGRAM]   Caption: "${caption}"`);
        console.log(`[TELEGRAM]   Image Size: ${(base64.length / 1024).toFixed(2)} KB`);
        if (metadata?.userId) console.log(`[TELEGRAM]   From UserID: ${metadata.userId}`);
        if (metadata?.timestamp) console.log(`[TELEGRAM]   Timestamp: ${new Date(metadata.timestamp * 1000).toISOString()}`);

        // Convert Base64 to image list format expected by send-image-content
        const imageList = [
            {
                type: 'image_url',
                image_url: {
                    url: `data:image/jpeg;base64,${base64}`,
                },
            },
        ];

        const systemPrompt = caption || 'Analyze this image and provide detailed insights.';

        // Use the existing send-image-content pipeline
        const result = await ipcRenderer.invoke('send-image-content', {
            imageList,
            systemMessage: systemPrompt,
            metadata: { source: 'telegram', ...metadata },
        });

        if (!result.success) {
            console.error('Failed to process telegram image:', result.error);
        } else {
            console.log('[TELEGRAM] Image sent to Azure for analysis');
        }
    } catch (error) {
        console.error('Error handling telegram image:', error);
    }
});

// Listen for Telegram text message requests
ipcRenderer.on('telegram-text-received', async (event, data) => {
    try {
        const { text, metadata } = data;

        if (!text || text.trim().length === 0) {
            console.error('No text data in telegram-text-received event');
            return;
        }

        console.log(`\n[TELEGRAM] Text message received from Telegram`);
        console.log(`[TELEGRAM]   Text: "${text}"`);
        if (metadata?.userId) console.log(`[TELEGRAM]   From UserID: ${metadata.userId}`);
        if (metadata?.timestamp) console.log(`[TELEGRAM]   Timestamp: ${new Date(metadata.timestamp * 1000).toISOString()}`);

        // Use the existing send-text-message pipeline with automatic profile detection
        // This will route through the same system as user-typed text input
        const result = await ipcRenderer.invoke('send-text-message', text, null);

        if (!result?.success) {
            console.error('Failed to process telegram text:', result?.error);
        } else {
            console.log('[TELEGRAM] Text sent for AI analysis');
        }
    } catch (error) {
        console.error('Error handling telegram text:', error);
    }
});

// Handle shortcuts based on current view
function handleShortcut(shortcutKey) {
    const currentView = hintio.getCurrentView();

    if (shortcutKey === 'dual-screenshot') {
        if (currentView !== 'main') {
            captureDualScreenshot();
        }
        return;
    }

    if (shortcutKey === 'dual-screenshot-finish') {
        if (currentView !== 'main') {
            finishDualScreenshotBatch();
        }
        return;
    }

    if (shortcutKey === 'debug-screenshot') {
        if (currentView !== 'main') {
            captureDebugScreenshot();
        }
        return;
    }

    if (shortcutKey === 'ctrl+enter' || shortcutKey === 'cmd+enter') {
        if (currentView === 'main') {
            hintio.element().handleStart();
        } else {
            captureManualScreenshot();
        }
        return;
    }

    if (shortcutKey === 'coding-dock' || shortcutKey === 'dock-left') {
        const app = hintio.element();
        if (!app) return;

        // Switch to coding-oriented profile and persist preference.
        // In this app, 'exam' is the coding/exam assistant profile.
        app.selectedProfile = 'exam';
        if (typeof app.handleProfileChange === 'function') {
            app.handleProfileChange('exam').catch(() => {});
        } else {
            hintio.storage.updatePreference('selectedProfile', 'exam').catch(() => {});
        }

        // Default coding layout assumption: editor/input is on the right,
        // so dock overlay to the left full-height pane.
        if (typeof hintio.repositionWindow === 'function') {
            hintio.repositionWindow('right');
        }

        if (typeof app.requestUpdate === 'function') {
            app.requestUpdate();
        }
        return;
    }

    if (shortcutKey === 'dock-right') {
        if (typeof hintio.repositionWindow === 'function') {
            // Put overlay on right side full-height
            // (means input/editor area is likely on the left)
            hintio.repositionWindow('left');
        }
        return;
    }

    if (shortcutKey === 'dock-default') {
        if (typeof hintio.repositionWindow === 'function') {
            hintio.repositionWindow('default');
        }
        return;
    }

    if (shortcutKey === 'focus-text-input') {
        if (currentView === 'assistant') {
            const assistantView = document.querySelector('assistant-view');
            if (assistantView && typeof assistantView.toggleInputExpanded === 'function') {
                assistantView.toggleInputExpanded();
                console.log('Input expanded via keyboard shortcut');
            }
        }
        return;
    }

    if (shortcutKey === 'submit-text-input') {
        if (currentView === 'assistant') {
            const assistantView = document.querySelector('assistant-view');
            if (assistantView && typeof assistantView.handleSendText === 'function') {
                assistantView.handleSendText();
                if (typeof assistantView.closeInputExpanded === 'function') {
                    assistantView.closeInputExpanded();
                }
                console.log('Text submitted and input collapsed via keyboard shortcut');
            }
        }
        return;
    }
}

// Create reference to the main app element
const hintioApp = document.querySelector('hintio-app');

// ============ THEME SYSTEM ============
const theme = {
    themes: {
        dark: {
            background: '#101010',
            text: '#e0e0e0',
            textSecondary: '#a0a0a0',
            textMuted: '#6b6b6b',
            border: '#2a2a2a',
            accent: '#ffffff',
            btnPrimaryBg: '#ffffff',
            btnPrimaryText: '#000000',
            btnPrimaryHover: '#e0e0e0',
            tooltipBg: '#1a1a1a',
            tooltipText: '#ffffff',
            keyBg: 'rgba(255,255,255,0.1)',
        },
        light: {
            background: '#ffffff',
            text: '#1a1a1a',
            textSecondary: '#555555',
            textMuted: '#888888',
            border: '#e0e0e0',
            accent: '#000000',
            btnPrimaryBg: '#1a1a1a',
            btnPrimaryText: '#ffffff',
            btnPrimaryHover: '#333333',
            tooltipBg: '#1a1a1a',
            tooltipText: '#ffffff',
            keyBg: 'rgba(0,0,0,0.1)',
        },
        midnight: {
            background: '#0d1117',
            text: '#c9d1d9',
            textSecondary: '#8b949e',
            textMuted: '#6e7681',
            border: '#30363d',
            accent: '#58a6ff',
            btnPrimaryBg: '#58a6ff',
            btnPrimaryText: '#0d1117',
            btnPrimaryHover: '#79b8ff',
            tooltipBg: '#161b22',
            tooltipText: '#c9d1d9',
            keyBg: 'rgba(88,166,255,0.15)',
        },
        sepia: {
            background: '#f4ecd8',
            text: '#5c4b37',
            textSecondary: '#7a6a56',
            textMuted: '#998875',
            border: '#d4c8b0',
            accent: '#8b4513',
            btnPrimaryBg: '#5c4b37',
            btnPrimaryText: '#f4ecd8',
            btnPrimaryHover: '#7a6a56',
            tooltipBg: '#5c4b37',
            tooltipText: '#f4ecd8',
            keyBg: 'rgba(92,75,55,0.15)',
        },
        catppuccin: {
            background: '#1e1e2e',
            text: '#cdd6f4',
            textSecondary: '#a6adc8',
            textMuted: '#585b70',
            border: '#313244',
            accent: '#cba6f7',
            btnPrimaryBg: '#cba6f7',
            btnPrimaryText: '#1e1e2e',
            btnPrimaryHover: '#b4befe',
            tooltipBg: '#313244',
            tooltipText: '#cdd6f4',
            keyBg: 'rgba(203,166,247,0.12)',
        },
        gruvbox: {
            background: '#1d2021',
            text: '#ebdbb2',
            textSecondary: '#a89984',
            textMuted: '#665c54',
            border: '#3c3836',
            accent: '#fe8019',
            btnPrimaryBg: '#fe8019',
            btnPrimaryText: '#1d2021',
            btnPrimaryHover: '#fabd2f',
            tooltipBg: '#3c3836',
            tooltipText: '#ebdbb2',
            keyBg: 'rgba(254,128,25,0.12)',
        },
        rosepine: {
            background: '#191724',
            text: '#e0def4',
            textSecondary: '#908caa',
            textMuted: '#6e6a86',
            border: '#26233a',
            accent: '#ebbcba',
            btnPrimaryBg: '#ebbcba',
            btnPrimaryText: '#191724',
            btnPrimaryHover: '#f6c177',
            tooltipBg: '#26233a',
            tooltipText: '#e0def4',
            keyBg: 'rgba(235,188,186,0.12)',
        },
        solarized: {
            background: '#002b36',
            text: '#93a1a1',
            textSecondary: '#839496',
            textMuted: '#586e75',
            border: '#073642',
            accent: '#2aa198',
            btnPrimaryBg: '#2aa198',
            btnPrimaryText: '#002b36',
            btnPrimaryHover: '#268bd2',
            tooltipBg: '#073642',
            tooltipText: '#93a1a1',
            keyBg: 'rgba(42,161,152,0.12)',
        },
        tokyonight: {
            background: '#1a1b26',
            text: '#c0caf5',
            textSecondary: '#9aa5ce',
            textMuted: '#565f89',
            border: '#292e42',
            accent: '#7aa2f7',
            btnPrimaryBg: '#7aa2f7',
            btnPrimaryText: '#1a1b26',
            btnPrimaryHover: '#bb9af7',
            tooltipBg: '#292e42',
            tooltipText: '#c0caf5',
            keyBg: 'rgba(122,162,247,0.12)',
        },
    },

    current: 'dark',

    get(name) {
        return this.themes[name] || this.themes.dark;
    },

    getAll() {
        const names = {
            dark: 'Dark',
            light: 'Light',
            midnight: 'Midnight Blue',
            sepia: 'Sepia',
            catppuccin: 'Catppuccin Mocha',
            gruvbox: 'Gruvbox Dark',
            rosepine: 'Ros\u00e9 Pine',
            solarized: 'Solarized Dark',
            tokyonight: 'Tokyo Night',
        };
        return Object.keys(this.themes).map(key => ({
            value: key,
            name: names[key] || key,
            colors: this.themes[key],
        }));
    },

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16),
              }
            : { r: 30, g: 30, b: 30 };
    },

    lightenColor(rgb, amount) {
        return {
            r: Math.min(255, rgb.r + amount),
            g: Math.min(255, rgb.g + amount),
            b: Math.min(255, rgb.b + amount),
        };
    },

    darkenColor(rgb, amount) {
        return {
            r: Math.max(0, rgb.r - amount),
            g: Math.max(0, rgb.g - amount),
            b: Math.max(0, rgb.b - amount),
        };
    },

    applyBackgrounds(backgroundColor, alpha = 0.8) {
        const root = document.documentElement;
        const baseRgb = this.hexToRgb(backgroundColor);

        // For light themes, darken; for dark themes, lighten
        const isLight = (baseRgb.r + baseRgb.g + baseRgb.b) / 3 > 128;
        const adjust = isLight ? this.darkenColor.bind(this) : this.lightenColor.bind(this);

        const secondary = adjust(baseRgb, 10);
        const tertiary = adjust(baseRgb, 22);
        const hover = adjust(baseRgb, 28);

        const bgBase = `rgba(${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b}, ${alpha})`;
        const bgSurface = `rgba(${secondary.r}, ${secondary.g}, ${secondary.b}, ${alpha})`;
        const bgElevated = `rgba(${tertiary.r}, ${tertiary.g}, ${tertiary.b}, ${alpha})`;
        const bgHover = `rgba(${hover.r}, ${hover.g}, ${hover.b}, ${alpha})`;

        // New design tokens (used by components)
        root.style.setProperty('--bg-app', bgBase);
        root.style.setProperty('--bg-surface', bgSurface);
        root.style.setProperty('--bg-elevated', bgElevated);
        root.style.setProperty('--bg-hover', bgHover);

        // Legacy aliases
        root.style.setProperty('--header-background', bgBase);
        root.style.setProperty('--main-content-background', bgBase);
        root.style.setProperty('--bg-primary', bgBase);
        root.style.setProperty('--bg-secondary', bgSurface);
        root.style.setProperty('--bg-tertiary', bgElevated);
        root.style.setProperty('--input-background', bgElevated);
        root.style.setProperty('--input-focus-background', bgElevated);
        root.style.setProperty('--hover-background', bgHover);
        root.style.setProperty('--scrollbar-background', bgBase);
    },

    apply(themeName, alpha = 0.8) {
        const colors = this.get(themeName);
        this.current = themeName;
        const root = document.documentElement;

        // New design tokens (used by components)
        root.style.setProperty('--text-primary', colors.text);
        root.style.setProperty('--text-secondary', colors.textSecondary);
        root.style.setProperty('--text-muted', colors.textMuted);
        root.style.setProperty('--border', colors.border);
        root.style.setProperty('--border-strong', colors.accent);
        root.style.setProperty('--accent', colors.btnPrimaryBg);
        root.style.setProperty('--accent-hover', colors.btnPrimaryHover);

        // Legacy aliases
        root.style.setProperty('--text-color', colors.text);
        root.style.setProperty('--border-color', colors.border);
        root.style.setProperty('--border-default', colors.accent);
        root.style.setProperty('--placeholder-color', colors.textMuted);
        root.style.setProperty('--scrollbar-thumb', colors.border);
        root.style.setProperty('--scrollbar-thumb-hover', colors.textMuted);
        root.style.setProperty('--key-background', colors.keyBg);
        // Primary button
        root.style.setProperty('--btn-primary-bg', colors.btnPrimaryBg);
        root.style.setProperty('--btn-primary-text', colors.btnPrimaryText);
        root.style.setProperty('--btn-primary-hover', colors.btnPrimaryHover);
        // Start button (same as primary)
        root.style.setProperty('--start-button-background', colors.btnPrimaryBg);
        root.style.setProperty('--start-button-color', colors.btnPrimaryText);
        root.style.setProperty('--start-button-hover-background', colors.btnPrimaryHover);
        // Tooltip
        root.style.setProperty('--tooltip-bg', colors.tooltipBg);
        root.style.setProperty('--tooltip-text', colors.tooltipText);
        // Error color (stays constant)
        root.style.setProperty('--error-color', '#f14c4c');
        root.style.setProperty('--success-color', '#4caf50');

        // Also apply background colors from theme
        this.applyBackgrounds(colors.background, alpha);
    },

    async load() {
        try {
            const prefs = await storage.getPreferences();
            const themeName = prefs.theme || 'dark';
            const alpha = prefs.backgroundTransparency ?? 0.8;
            this.apply(themeName, alpha);
            return themeName;
        } catch (err) {
            this.apply('dark');
            return 'dark';
        }
    },

    async save(themeName) {
        await storage.updatePreference('theme', themeName);
        this.apply(themeName);
    },
};

// Consolidated hintio object - all functions in one place
const hintio = {
    // App version
    getVersion: async () => ipcRenderer.invoke('get-app-version'),

    // Element access
    element: () => hintioApp,
    e: () => hintioApp,

    // App state functions - access properties directly from the app element
    getCurrentView: () => hintioApp.currentView,
    getLayoutMode: () => hintioApp.layoutMode,

    // Status and response functions
    setStatus: text => hintioApp.setStatus(text),
    addNewResponse: response => hintioApp.addNewResponse(response),
    updateCurrentResponse: response => hintioApp.updateCurrentResponse(response),

    // Core functionality
    initializeAzure,
    startCapture,
    stopCapture,
    sendTextMessage,
    getProviderSecrets,
    getLastInitError,
    clearSessionProviderSecrets,
    handleShortcut,
    saveTextFile,
    repositionWindow: async (hint) => ipcRenderer.invoke('reposition-window', hint),

    // Storage API
    storage,

    // Theme API
    theme,

    // Refresh preferences cache (call after updating preferences)
    refreshPreferencesCache: loadPreferencesCache,

    // Platform detection
    isLinux: isLinux,
    isMacOS: isMacOS,
};

// Make it globally available
window.hintio = hintio;

// Load theme after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => theme.load());
} else {
    theme.load();
}
