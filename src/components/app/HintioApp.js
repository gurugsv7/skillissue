import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { MainView } from '../views/MainView.js';
import { ResizeHandles } from './ResizeHandles.js';
import { CustomizeView } from '../views/CustomizeView.js';
import { HelpView } from '../views/HelpView.js';
import { HistoryView } from '../views/HistoryView.js';
import { AssistantView } from '../views/AssistantView.js';
import { OnboardingView } from '../views/OnboardingView.js';
import { AICustomizeView } from '../views/AICustomizeView.js';
import { FeedbackView } from '../views/FeedbackView.js';
import { CalibrationView } from '../views/CalibrationView.js';

export class HintioApp extends LitElement {
    static DEFAULT_SESSION_LIMIT_MS = 15 * 60 * 1000;

    static styles = css`
        * {
            box-sizing: border-box;
            font-family: var(--font);
            margin: 0;
            padding: 0;
            cursor: default;
            user-select: none;
        }

        /* ── Animations ── */

        @keyframes status-pulse {
            0%,100% { opacity: 1; }
            50%      { opacity: 0.4; }
        }

        /* ── Host — re-declare all tokens so shadow DOM can resolve them ── */

        :host {
            --accent:         #6366F1;
            --accent-hover:   #4F46E5;
            --accent-glow:    rgba(99, 102, 241, 0.25);
            --bg-app:         #09090B;
            --bg-surface:     #0F0F12;
            --bg-elevated:    #18181B;
            --bg-hover:       #1E1E24;
            --text-primary:   #FAFAFA;
            --text-secondary: #A1A1AA;
            --text-muted:     #52525B;
            --border:         #27272A;
            --border-strong:  #3F3F46;
            --success:        #22C55E;
            --warning:        #F59E0B;
            --danger:         #EF4444;
            --radius-sm:      6px;
            --radius-md:      10px;
            --radius-lg:      16px;
            --transition:     160ms ease;
            --font:           'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            --font-mono:      'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
            --font-size-xs:   11px;
            --font-size-sm:   13px;
            --font-size-base: 14px;

            display: block;
            width: 100%;
            height: 100vh;
            background: var(--bg-app);
            color: var(--text-primary);
        }

        /* ── App shell: top-nav + content (vertical stack) ── */

        .app-shell {
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
        }

        /* ── Top navigation bar ── */

        .top-nav {
            display: flex;
            align-items: center;
            gap: 0;
            padding: 0 12px;
            height: 44px;
            min-height: 44px;
            background: rgba(9, 9, 11, 0.97);
            border-bottom: 1px solid var(--border);
            -webkit-app-region: drag;
            flex-shrink: 0;
            position: relative;
            z-index: 100;
        }

        .top-nav.hidden {
            display: none;
        }

        /* ── Brand ── */

        .nav-brand {
            display: flex;
            align-items: center;
            gap: 7px;
            -webkit-app-region: no-drag;
            margin-right: 4px;
            flex-shrink: 0;
        }

        .nav-brand-mark {
            width: 26px;
            height: 26px;
            border-radius: 7px;
            background: #6366F1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            color: #fff;
            letter-spacing: -0.03em;
            flex-shrink: 0;
            box-shadow: 0 0 0 1px rgba(99,102,241,0.5), 0 2px 8px rgba(99,102,241,0.3);
        }

        .nav-brand-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary);
            letter-spacing: -0.01em;
        }

        /* ── Nav items ── */

        .nav-items {
            display: flex;
            align-items: center;
            gap: 1px;
            flex: 0 1 auto;
            -webkit-app-region: no-drag;
            padding: 0 8px;
        }

        .nav-drag-spacer {
            flex: 1;
            min-width: 24px;
            height: 100%;
            -webkit-app-region: drag;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 5px 10px;
            border-radius: var(--radius-sm);
            border: none;
            background: none;
            color: var(--text-muted);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: color var(--transition), background var(--transition);
            white-space: nowrap;
            position: relative;
        }

        /* Material Symbols inside nav items */
        .nav-item .icon {
            font-family: 'Material Symbols Rounded';
            font-size: 16px;
            font-weight: normal;
            font-style: normal;
            line-height: 1;
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20;
            flex-shrink: 0;
        }

        .nav-item.active .icon {
            font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20;
        }

        .nav-item:hover {
            color: var(--text-secondary);
            background: var(--bg-elevated);
        }

        .nav-item.active {
            color: var(--text-primary);
            background: rgba(99, 102, 241, 0.12);
        }

        .nav-item.active::after {
            content: '';
            position: absolute;
            bottom: -1px;
            left: 50%;
            transform: translateX(-50%);
            width: 20px;
            height: 2px;
            background: #6366F1;
            border-radius: 2px 2px 0 0;
        }

        /* ── Nav end: version + window controls ── */

        .nav-end {
            display: flex;
            align-items: center;
            gap: 6px;
            -webkit-app-region: no-drag;
            margin-left: 4px;
            flex-shrink: 0;
        }

        .version-tag {
            font-size: 10px;
            color: var(--text-muted);
            font-family: var(--font-mono);
        }

        /* ── Main content area ── */
        /* ── Window control buttons ── */

        .wc-btn {
            width: 26px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 5px;
            border: 1px solid var(--border);
            background: transparent;
            cursor: pointer;
            transition: all var(--transition);
        }

        .wc-btn.minimize {
            color: rgba(255,255,255,0.3);
        }

        .wc-btn.minimize:hover {
            color: var(--text-secondary);
            background: var(--bg-elevated);
            border-color: var(--border-strong);
        }

        .wc-btn.close {
            color: rgba(255,255,255,0.3);
        }

        .wc-btn.close:hover {
            color: #ff5f57;
            border-color: rgba(239,68,68,0.5);
            background: rgba(239,68,68,0.1);
        }

        .update-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--danger);
            box-shadow: 0 0 6px rgba(239,68,68,0.7);
            animation: status-pulse 2s ease-in-out infinite;
        }

        .content {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            background: var(--bg-app);
            position: relative;
        }

        /* ── Live mode top bar ── */

        .live-bar {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            background: rgba(8,8,10,0.96);
            border-bottom: 1px solid rgba(0,212,255,0.12);
            height: 34px;
            -webkit-app-region: drag;
            flex-shrink: 0;
        }

        .live-bar-left {
            display: flex;
            align-items: center;
            gap: 10px;
            -webkit-app-region: no-drag;
            z-index: 1;
        }

        .live-bar-back {
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            cursor: pointer;
            background: none;
            border: 1px solid var(--border);
            padding: 3px 10px;
            border-radius: var(--radius-sm);
            transition: all var(--transition);
            font-size: 10px;
            font-family: var(--font-mono);
            letter-spacing: 0.06em;
            text-transform: uppercase;
            gap: 4px;
        }

        .live-bar-back:hover {
            color: var(--danger);
            border-color: rgba(239,68,68,0.5);
            background: rgba(239,68,68,0.08);
        }

        .live-bar-back svg {
            width: 12px;
            height: 12px;
        }

        .live-profile-tag {
            font-size: 10px;
            font-family: var(--font-mono);
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 2px 8px;
        }

        .live-bar-center {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 6px;
            pointer-events: none;
        }

        .live-session-dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--success);
            box-shadow: 0 0 6px rgba(34,197,94,0.6);
            animation: status-pulse 2s ease-in-out infinite;
        }

        .live-session-label {
            font-size: 10px;
            font-family: var(--font-mono);
            color: rgba(34,197,94,0.7);
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .live-bar-right {
            display: flex;
            align-items: center;
            gap: 12px;
            -webkit-app-region: no-drag;
            z-index: 1;
        }

        .live-bar-text {
            font-size: 10px;
            color: var(--text-muted);
            font-family: var(--font-mono);
            white-space: nowrap;
        }

        .live-bar-text.hot {
            color: var(--accent);
        }

        .live-bar-text.warn {
            color: var(--warning);
        }

        .live-bar-text.clickable {
            cursor: pointer;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 2px 8px;
            transition: all var(--transition);
        }

        .live-bar-text.clickable:hover {
            color: var(--text-secondary);
            border-color: var(--border-strong);
            background: var(--bg-elevated);
        }

        /* ── Content inner ── */

        .content-inner {
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .content-inner > * {
            flex: 1;
            min-height: 0;
        }

        .content-inner.live {
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        /* ── Onboarding fullscreen ── */

        .fullscreen {
            position: fixed;
            inset: 0;
            z-index: 100;
            background: var(--bg-app);
        }

        /* ── Scrollbar ── */

        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
            background: var(--border-strong);
            border-radius: 2px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #52525B;
        }
    `;

    static properties = {
        currentView: { type: String },
        statusText: { type: String },
        startTime: { type: Number },
        isRecording: { type: Boolean },
        sessionActive: { type: Boolean },
        selectedProfile: { type: String },
        selectedLanguage: { type: String },
        responses: { type: Array },
        currentResponseIndex: { type: Number },
        selectedScreenshotInterval: { type: String },
        selectedImageQuality: { type: String },
        layoutMode: { type: String },
        _viewInstances: { type: Object, state: true },
        _isClickThrough: { state: true },
        _awaitingNewResponse: { state: true },
        shouldAnimateResponse: { type: Boolean },
        _storageLoaded: { state: true },
        _updateAvailable: { state: true },
        _whisperDownloading: { state: true },
        _awaitingScreenAnalysis: { state: true },
        _screenAnalysisMode: { state: true },
        _errorContent: { state: true },
        _hasVoiceProfile: { state: true },
        _calibrationSkipped: { state: true },
        sessionLimitMs: { state: true },
    };

    constructor() {
        super();
        this.currentView = 'main';
        this.statusText = '';
        this.startTime = null;
        this.isRecording = false;
        this.sessionActive = false;
        this.selectedProfile = 'interview';
        this.selectedLanguage = 'en-US';
        this.selectedScreenshotInterval = '5';
        this.selectedImageQuality = 'medium';
        this.layoutMode = 'normal';
        this.responses = [];
        this.currentResponseIndex = -1;
        this._viewInstances = new Map();
        this._isClickThrough = false;
        this._awaitingNewResponse = false;
        this._currentResponseIsComplete = true;
        this.shouldAnimateResponse = false;
        this._storageLoaded = false;
        this._timerInterval = null;
        this._updateAvailable = false;
        this._whisperDownloading = false;
        this._localVersion = '';
        this._awaitingScreenAnalysis = false;
        this._screenAnalysisMode = '';
        this._errorContent = '';
        this._hasVoiceProfile = false;
        this._calibrationSkipped = false;
        this._layoutRepositioned = false;
        this._sessionTimeoutHandled = false;
        this.sessionLimitMs = null;

        this._loadFromStorage();
        this._checkForUpdates();
    }

    async _checkForUpdates() {
        try {
            this._localVersion = await hintio.getVersion();
            this.requestUpdate();

            const res = await fetch('https://raw.githubusercontent.com/sohzm/hintio/refs/heads/master/package.json');
            if (!res.ok) return;
            const remote = await res.json();
            const remoteVersion = remote.version;

            const toNum = v => v.split('.').map(Number);
            const [rMaj, rMin, rPatch] = toNum(remoteVersion);
            const [lMaj, lMin, lPatch] = toNum(this._localVersion);

            if (rMaj > lMaj || (rMaj === lMaj && rMin > lMin) || (rMaj === lMaj && rMin === lMin && rPatch > lPatch)) {
                this._updateAvailable = true;
                this.requestUpdate();
            }
        } catch (e) {
            // silently ignore
        }
    }

    async _loadFromStorage() {
        try {
            const [config, prefs, voiceProfile] = await Promise.all([
                hintio.storage.getConfig(),
                hintio.storage.getPreferences(),
                hintio.storage.getVoiceProfile(),
            ]);

            this.currentView = config.onboarded ? 'main' : 'onboarding';
            this.selectedProfile = prefs.selectedProfile || 'interview';
            this.selectedLanguage = prefs.selectedLanguage || 'en-US';
            this.selectedScreenshotInterval = prefs.selectedScreenshotInterval || '5';
            this.selectedImageQuality = prefs.selectedImageQuality || 'medium';
            this.layoutMode = config.layout || 'normal';
            this._hasVoiceProfile = !!voiceProfile;
            this._calibrationSkipped = !!prefs.skipVoiceCalibration;

            this._storageLoaded = true;
            this.requestUpdate();
        } catch (error) {
            console.error('Error loading from storage:', error);
            this._storageLoaded = true;
            this.requestUpdate();
        }
    }

    connectedCallback() {
        super.connectedCallback();

        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.on('new-response', (_, response) => this.addNewResponse(response));
            ipcRenderer.on('update-response', (_, response) => this.updateCurrentResponse(response));
            ipcRenderer.on('update-status', (_, status) => this.setStatus(status));
            ipcRenderer.on('click-through-toggled', (_, isEnabled) => { this._isClickThrough = isEnabled; });
            ipcRenderer.on('reconnect-failed', (_, data) => this.addNewResponse(data.message));
            ipcRenderer.on('whisper-downloading', (_, downloading) => { this._whisperDownloading = downloading; });
            ipcRenderer.on('screen-analysis-triggered', () => {
                this._awaitingScreenAnalysis = true;
                this._screenAnalysisMode = 'manual';
                this._layoutRepositioned = false;
                this._errorContent = '';
            });
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopTimer();
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.removeAllListeners('new-response');
            ipcRenderer.removeAllListeners('update-response');
            ipcRenderer.removeAllListeners('update-status');
            ipcRenderer.removeAllListeners('click-through-toggled');
            ipcRenderer.removeAllListeners('reconnect-failed');
            ipcRenderer.removeAllListeners('whisper-downloading');
        }
    }

    // ── Timer ──

    _startTimer() {
        this._stopTimer();
        if (this.startTime) {
            this._timerInterval = setInterval(() => {
                if (this.currentView === 'assistant' && this._isSessionTimedOut()) {
                    this._handleSessionTimeout().catch((error) => {
                        console.error('Session timeout handling failed:', error);
                    });
                    return;
                }
                this.requestUpdate();
            }, 1000);
        }
    }

    _getActiveSessionLimitMs() {
        if (typeof this.sessionLimitMs === 'number' && Number.isFinite(this.sessionLimitMs) && this.sessionLimitMs > 0) {
            return this.sessionLimitMs;
        }
        return null;
    }

    _stopTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    getElapsedTime() {
        if (!this.startTime) return '0:00';
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        const pad = n => String(n).padStart(2, '0');
        if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
        return `${m}:${pad(s)}`;
    }

    getRemainingSessionTime() {
        const sessionLimitMs = this._getActiveSessionLimitMs();
        if (!sessionLimitMs) return '';

        const remainingMs = this.startTime
            ? Math.max(0, sessionLimitMs - (Date.now() - this.startTime))
            : sessionLimitMs;
        const remainingSeconds = Math.floor(remainingMs / 1000);
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    isSessionNearTimeout() {
        const sessionLimitMs = this._getActiveSessionLimitMs();
        if (!this.startTime || !sessionLimitMs) return false;
        const remainingMs = sessionLimitMs - (Date.now() - this.startTime);
        return remainingMs > 0 && remainingMs <= 60_000;
    }

    // ── Status & Responses ──

    setStatus(text) {
        this.statusText = text;
        if (text.includes('Ready') || text.includes('Listening') || text.includes('Error')) {
            this._currentResponseIsComplete = true;
        }
    }

    addNewResponse(response) {
        const wasOnLatest = this.currentResponseIndex === this.responses.length - 1;
        const cleaned = this._extractScreenAnalysisMarkers(response);
        this.responses = [...this.responses, cleaned];
        if (wasOnLatest || this.currentResponseIndex === -1) {
            this.currentResponseIndex = this.responses.length - 1;
        }
        
        this._awaitingNewResponse = false;
        this.requestUpdate();
    }

    updateCurrentResponse(response) {
        if (this.responses.length > 0) {
            const cleaned = this._extractScreenAnalysisMarkers(response);
            this.responses = [...this.responses.slice(0, -1), cleaned];
        } else {
            this.addNewResponse(response);
        }
        this.requestUpdate();
    }

    _extractScreenAnalysisMarkers(text) {
        let cleaned = text;

        // Always strip layout markers from displayed text; only act on the hint
        // when a screen analysis is in progress.
        const layoutMatch = cleaned.match(/===LAYOUT:(left|right|center|top-left|top-right|bottom-left|bottom-right)===/i);
        if (layoutMatch && this._awaitingScreenAnalysis && !this._layoutRepositioned) {
            this._layoutRepositioned = true;
            const hint = layoutMatch[1].toLowerCase();
            if (window.hintio?.repositionWindow) {
                window.hintio.repositionWindow(hint);
            }
        }
        cleaned = cleaned.replace(/\n?===LAYOUT:[a-z-]+===\n?/gi, '');

        // For debug screenshot mode, keep code-issue details inline so no popup click is required.
        // For all other modes, strip marker blocks from visible text.
        const issueRegex = /\n?===CODE_ISSUE_START===\n?([\s\S]*?)\n?===CODE_ISSUE_END===\n?/gi;
        const issueMatch = cleaned.match(/===CODE_ISSUE_START===\n?([\s\S]*?)\n?===CODE_ISSUE_END===/i);
        const isDebugAnalysis = this._screenAnalysisMode === 'debug';
        if (issueMatch && isDebugAnalysis) {
            const issueText = issueMatch[1].trim();
            this._errorContent = issueText;
            cleaned = cleaned.replace(issueRegex, `\n\nDebug Fix Details:\n${issueText}\n\n`);
        } else {
            cleaned = cleaned.replace(issueRegex, '');
        }

        // Once status goes to Listening/Ready, analysis is done
        if (this._awaitingScreenAnalysis && (this.statusText?.includes('Listening') || this.statusText?.includes('Ready'))) {
            this._awaitingScreenAnalysis = false;
        }

        return cleaned.trim();
    }

    // ── Navigation ──

    _isSessionTimedOut() {
        const sessionLimitMs = this._getActiveSessionLimitMs();
        if (!sessionLimitMs) return false;
        return Boolean(this.startTime) && Date.now() - this.startTime >= sessionLimitMs;
    }

    async _endSessionToHome() {
        hintio.stopCapture();
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('close-session');
        }
        if (window.hintio?.clearSessionProviderSecrets) {
            await window.hintio.clearSessionProviderSecrets();
        }
        this.sessionActive = false;
        this.startTime = null;
        this.sessionLimitMs = null;
        this._awaitingScreenAnalysis = false;
        this._screenAnalysisMode = '';
        this._errorContent = '';
        this._stopTimer();
        this.currentView = 'main';
        this.requestUpdate();
    }

    async _handleSessionTimeout() {
        if (this._sessionTimeoutHandled || this.currentView !== 'assistant') {
            return;
        }
        this._sessionTimeoutHandled = true;
        const sessionLimitMs = this._getActiveSessionLimitMs();
        const sessionLimitMinutes = sessionLimitMs ? Math.round(sessionLimitMs / 60000) : 15;
        this.setStatus(`Session timed out after ${sessionLimitMinutes} minutes. Returning to home.`);
        try {
            await this._endSessionToHome();
        } finally {
            this._sessionTimeoutHandled = false;
        }
    }

    navigate(view) {
        this.currentView = view;
        this.requestUpdate();
    }

    async handleClose() {
        if (this.currentView === 'assistant') {
            await this._endSessionToHome();
        } else if (this.currentView === 'calibration') {
            // Go back to main from calibration
            this.currentView = 'main';
        } else {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('quit-application');
            }
        }
    }

    async _handleMinimize() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('window-minimize');
        }
    }

    async handleHideToggle() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('toggle-window-visibility');
        }
    }

    // ── Session start ──

    async handleStart(accessToken = '') {
        const normalizedToken = String(accessToken || '').trim();
        if (normalizedToken) {
            await hintio.storage.setAccessToken(normalizedToken);
        }

        // If no voice profile, go to calibration first
        if (!this._hasVoiceProfile && !this._calibrationSkipped) {
            this.currentView = 'calibration';
            this.requestUpdate();
            return;
        }

        await this._startSession();
    }

    async handleCalibrationComplete(voiceProfile) {
        if (voiceProfile) {
            await hintio.storage.saveVoiceProfile(voiceProfile);
            this._hasVoiceProfile = true;
        }
        this._calibrationSkipped = false;
        await hintio.storage.updatePreference('skipVoiceCalibration', false);
        // Proceed to start session
        await this._startSession();
    }

    async handleCalibrationSkip() {
        this._calibrationSkipped = true;
        hintio.storage.updatePreference('skipVoiceCalibration', true).catch((error) => {
            console.warn('Failed to persist skipVoiceCalibration preference:', error);
        });
        // Navigate to main first so main-view is in the DOM before _startSession()
        // tries to show an API key error on it
        this.currentView = 'main';
        this.requestUpdate();
        // Allow the main view to render before attempting to start the session
        setTimeout(() => this._startSession(), 0);
    }

    async handleResetVoiceProfile() {
        await hintio.storage.deleteVoiceProfile();
        this._hasVoiceProfile = false;
        this._calibrationSkipped = false;
        await hintio.storage.updatePreference('skipVoiceCalibration', false);
        this.requestUpdate();
    }

    _showMainViewTokenError(message) {
        const showError = () => {
            const mainView = this.shadowRoot.querySelector('main-view');
            if (mainView && mainView.triggerApiKeyError) {
                mainView.triggerApiKeyError(message);
            }
        };

        if (this.currentView !== 'main') {
            this.currentView = 'main';
            this.requestUpdate();
            setTimeout(showError, 0);
            return;
        }

        showError();
    }

    async _startSession() {
        this._awaitingScreenAnalysis = false;
        this._screenAnalysisMode = '';
        this._errorContent = '';

        const creds = await hintio.storage.getCredentials();
        const accessToken = (creds.cloudToken || '').trim();
        if (!accessToken) {
            this._showMainViewTokenError('Access token is required.');
            return;
        }

        const success = await hintio.initializeAzure(this.selectedProfile, this.selectedLanguage);
        if (!success) {
            const initError = typeof hintio.getLastInitError === 'function' ? hintio.getLastInitError() : '';
            this._showMainViewTokenError(initError || 'Access token is invalid or expired.');
            return;
        }

        hintio.startCapture(this.selectedScreenshotInterval, this.selectedImageQuality);
        this.responses = [];
        this.currentResponseIndex = -1;
        this.startTime = Date.now();
        this.sessionLimitMs = (typeof hintio.getSessionLimitMs === 'function')
            ? (hintio.getSessionLimitMs() ?? null)
            : HintioApp.DEFAULT_SESSION_LIMIT_MS;
        this._sessionTimeoutHandled = false;
        this.sessionActive = true;
        this.currentView = 'assistant';
        this._startTimer();
    }

    async handleAPIKeyHelp() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('open-external', 'https://hintio.com/help/api-key');
        }
    }

    async handleGroqAPIKeyHelp() {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('open-external', 'https://console.groq.com/keys');
        }
    }

    // ── Settings handlers ──

    async handleProfileChange(profile) {
        this.selectedProfile = profile;
        await hintio.storage.updatePreference('selectedProfile', profile);
    }

    async handleLanguageChange(language) {
        this.selectedLanguage = language;
        await hintio.storage.updatePreference('selectedLanguage', language);
    }

    async handleScreenshotIntervalChange(interval) {
        this.selectedScreenshotInterval = interval;
        await hintio.storage.updatePreference('selectedScreenshotInterval', interval);
    }

    async handleImageQualityChange(quality) {
        this.selectedImageQuality = quality;
        await hintio.storage.updatePreference('selectedImageQuality', quality);
    }

    async handleLayoutModeChange(layoutMode) {
        this.layoutMode = layoutMode;
        await hintio.storage.updateConfig('layout', layoutMode);
        if (window.require) {
            try {
                const { ipcRenderer } = window.require('electron');
                await ipcRenderer.invoke('update-sizes');
            } catch (error) {
                console.error('Failed to update sizes:', error);
            }
        }
        this.requestUpdate();
    }

    async handleExternalLinkClick(url) {
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            await ipcRenderer.invoke('open-external', url);
        }
    }

    async handleSendText(message) {
        if (this.currentView === 'assistant' && this._isSessionTimedOut()) {
            await this._handleSessionTimeout();
            return;
        }

        this._awaitingScreenAnalysis = false;
        this._screenAnalysisMode = '';

        const result = await window.hintio.sendTextMessage(message);
        if (!result.success) {
            this.setStatus('Error sending message: ' + result.error);
        } else {
            this.setStatus('Message sent...');
            this._awaitingNewResponse = true;
        }
    }

    handleResponseIndexChanged(e) {
        this.currentResponseIndex = e.detail.index;
        this.shouldAnimateResponse = false;
        this.requestUpdate();
    }

    handleOnboardingComplete() {
        this.currentView = 'main';
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has('currentView') && window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('view-changed', this.currentView);
        }
    }

    // ── Helpers ──

    _isLiveMode() {
        return this.currentView === 'assistant';
    }

    // ── Render ──

    renderCurrentView() {
        switch (this.currentView) {
            case 'onboarding':
                return html`
                    <onboarding-view
                        .onComplete=${() => this.handleOnboardingComplete()}
                        .onClose=${() => this.handleClose()}
                    ></onboarding-view>
                `;

            case 'main':
                return html`
                    <main-view
                        .selectedProfile=${this.selectedProfile}
                        .onProfileChange=${p => this.handleProfileChange(p)}
                        .onStart=${token => this.handleStart(token)}
                        .onExternalLink=${url => this.handleExternalLinkClick(url)}
                        .whisperDownloading=${this._whisperDownloading}
                        .hasVoiceProfile=${this._hasVoiceProfile}
                        .onResetVoiceProfile=${() => this.handleResetVoiceProfile()}
                        .onRecalibrate=${() => { this.currentView = 'calibration'; this.requestUpdate(); }}
                    ></main-view>
                `;

            case 'calibration':
                return html`
                    <calibration-view
                        .language=${this.selectedLanguage}
                        .onComplete=${(profile) => this.handleCalibrationComplete(profile)}
                        .onSkip=${() => this.handleCalibrationSkip()}
                    ></calibration-view>
                `;

            case 'ai-customize':
                return html`
                    <ai-customize-view
                        .selectedProfile=${this.selectedProfile}
                        .onProfileChange=${p => this.handleProfileChange(p)}
                    ></ai-customize-view>
                `;

            case 'customize':
                return html`
                    <customize-view
                        .selectedProfile=${this.selectedProfile}
                        .selectedLanguage=${this.selectedLanguage}
                        .selectedScreenshotInterval=${this.selectedScreenshotInterval}
                        .selectedImageQuality=${this.selectedImageQuality}
                        .layoutMode=${this.layoutMode}
                        .onProfileChange=${p => this.handleProfileChange(p)}
                        .onLanguageChange=${l => this.handleLanguageChange(l)}
                        .onScreenshotIntervalChange=${i => this.handleScreenshotIntervalChange(i)}
                        .onImageQualityChange=${q => this.handleImageQualityChange(q)}
                        .onLayoutModeChange=${lm => this.handleLayoutModeChange(lm)}
                    ></customize-view>
                `;

            case 'feedback':
                return html`<feedback-view></feedback-view>`;

            case 'help':
                return html`<help-view .onExternalLinkClick=${url => this.handleExternalLinkClick(url)}></help-view>`;

            case 'history':
                return html`<history-view></history-view>`;

            case 'assistant':
                return html`
                    <assistant-view
                        .responses=${this.responses}
                        .currentResponseIndex=${this.currentResponseIndex}
                        .selectedProfile=${this.selectedProfile}
                        .onSendText=${msg => this.handleSendText(msg)}
                        .shouldAnimateResponse=${this.shouldAnimateResponse}
                        .errorContent=${this._errorContent}
                        @response-index-changed=${this.handleResponseIndexChanged}
                        @response-animation-complete=${() => {
                            this.shouldAnimateResponse = false;
                            this._currentResponseIsComplete = true;
                            this.requestUpdate();
                        }}
                        @screen-analysis-triggered=${() => {
                            this._awaitingScreenAnalysis = true;
                            this._screenAnalysisMode = 'manual';
                            this._layoutRepositioned = false;
                            this._errorContent = '';
                        }}
                        @dismiss-error-panel=${() => {
                            this._errorContent = '';
                            this.requestUpdate();
                        }}
                    ></assistant-view>
                `;

            default:
                return html`<div>Unknown view: ${this.currentView}</div>`;
        }
    }

    renderSidebar() {
        const items = [
            {
                id: 'main',
                label: 'Home',
                icon: html`<span class="icon">home</span>`,
            },
            {
                id: 'ai-customize',
                label: 'AI Context',
                icon: html`<span class="icon">psychology</span>`,
            },
            {
                id: 'history',
                label: 'History',
                icon: html`<span class="icon">history</span>`,
            },
            {
                id: 'customize',
                label: 'Settings',
                icon: html`<span class="icon">tune</span>`,
            },
            {
                id: 'feedback',
                label: 'Feedback',
                icon: html`<span class="icon">rate_review</span>`,
            },
            {
                id: 'help',
                label: 'Help',
                icon: html`<span class="icon">help</span>`,
            },
        ];

        return html`
            <div class="top-nav ${this._isLiveMode() ? 'hidden' : ''}">
                <!-- Brand -->
                <div class="nav-brand">
                    <div class="nav-brand-mark">G</div>
                    <span class="nav-brand-name">Hintio</span>
                </div>

                <!-- Nav items -->
                <nav class="nav-items">
                    ${items.map(item => html`
                        <button
                            class="nav-item ${this.currentView === item.id ? 'active' : ''}"
                            @click=${() => this.navigate(item.id)}
                        >${item.icon}${item.label}</button>
                    `)}
                </nav>

                <div class="nav-drag-spacer" aria-hidden="true"></div>

                <!-- End: version tag + wc buttons -->
                <div class="nav-end">
                    ${this._updateAvailable ? html`<div class="update-dot" title="Update available"></div>` : ''}
                    ${this._localVersion ? html`<span class="version-tag">v${this._localVersion}</span>` : ''}
                    <button class="wc-btn minimize" @click=${() => this._handleMinimize()} title="Minimise">
                        <span class="icon" style="font-size:14px; position:relative; top:-2px">minimize</span>
                    </button>
                    <button class="wc-btn close" @click=${() => this.handleClose()} title="Close">
                        <span class="icon" style="font-size:14px">close</span>
                    </button>
                </div>
            </div>
        `;
    }

    renderLiveBar() {
        if (!this._isLiveMode()) return '';
        const remainingSessionTime = this.getRemainingSessionTime();
        const remainingTimeClass = this.isSessionNearTimeout() ? 'warn' : '';
        const hasSessionLimit = Boolean(this._getActiveSessionLimitMs());

        const profileLabels = {
            interview: 'Interview',
            sales: 'Sales Call',
            meeting: 'Meeting',
            presentation: 'Presentation',
            negotiation: 'Negotiation',
            exam: 'Exam',
        };

        return html`
            <div class="live-bar">
                <div class="live-bar-left">
                    <button class="live-bar-back" @click=${() => this.handleClose()} title="End session">
                        ← END
                    </button>
                    <span class="live-profile-tag">${profileLabels[this.selectedProfile] || 'Session'}</span>
                </div>
                <div class="live-bar-center">
                    <span class="live-session-dot"></span>
                    <span class="live-session-label">LIVE</span>
                </div>
                <div class="live-bar-right">
                    ${this.statusText ? html`<span class="live-bar-text hot">${this.statusText}</span>` : ''}
                    ${hasSessionLimit ? html`<span class="live-bar-text ${remainingTimeClass}">Left ${remainingSessionTime}</span>` : ''}
                    <span class="live-bar-text">${this.getElapsedTime()}</span>
                    ${this._isClickThrough ? html`<span class="live-bar-text">[pass-thru]</span>` : ''}
                    <span class="live-bar-text clickable" @click=${() => this.handleHideToggle()}>[hide]</span>
                </div>
            </div>
        `;
    }

    render() {
        // Onboarding is fullscreen, no nav
        if (this.currentView === 'onboarding') {
            return html`
                <div class="fullscreen">
                    ${this.renderCurrentView()}
                </div>
            `;
        }

        const isLive = this._isLiveMode();
        const showResizeHandles = this.currentView === 'assistant';

        return html`
            <div class="app-shell">
                <!-- Top navigation bar -->
                ${this.renderSidebar()}

                <div class="content">
                    ${isLive ? this.renderLiveBar() : ''}
                    <div class="content-inner ${isLive ? 'live' : ''}">
                        ${this.renderCurrentView()}
                        ${showResizeHandles ? html`<resize-handles></resize-handles>` : ''}
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('hintio-app', HintioApp);
