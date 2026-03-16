import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class MainView extends LitElement {
    static styles = css`
        * {
            font-family: var(--font);
            box-sizing: border-box;
            user-select: none;
        }

        /* Re-declare tokens — CSS variables don't auto-inherit into shadow DOM */
        :host {
            --accent:        #6366F1;
            --accent-hover:  #4F46E5;
            --bg-app:        #09090B;
            --bg-surface:    #0F0F12;
            --bg-elevated:   #18181B;
            --text-primary:  #FAFAFA;
            --text-secondary:#A1A1AA;
            --text-muted:    #52525B;
            --border:        #27272A;
            --border-strong: #3F3F46;
            --danger:        #EF4444;
            --radius-sm:     6px;
            --radius-lg:     16px;
            --font-weight-semibold: 600;
            --font: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;

            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            min-height: 0;
            padding: 24px;
            background: var(--bg-app);
            -webkit-app-region: no-drag;
            overflow-y: auto;
        }

        @keyframes fade-up {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        .card {
            width: 100%;
            max-width: 500px;
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            background: var(--bg-surface);
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.04) inset;
            padding: 30px 28px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            animation: fade-up 0.35s ease both;
        }

        .card-header {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding-bottom: 4px;
        }

        .brand-row {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }

        .brand-mark {
            width: 32px;
            height: 32px;
            border-radius: 9px;
            background: #6366F1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 700;
            color: #fff;
            flex-shrink: 0;
            box-shadow: 0 0 0 1px rgba(99,102,241,0.5), 0 4px 12px rgba(99,102,241,0.4);
        }

        .title {
            font-size: 22px;
            font-weight: var(--font-weight-semibold);
            color: var(--text-primary);
            letter-spacing: -0.02em;
            margin: 0;
        }

        .subtitle {
            font-size: 13px;
            color: var(--text-muted);
            margin: 0;
            line-height: 1.4;
        }

        .divider {
            height: 1px;
            background: var(--border);
            margin: 0 -28px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .form-label {
            font-size: 11px;
            font-weight: var(--font-weight-semibold);
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        input {
            -webkit-app-region: no-drag;
            width: 100%;
            background: var(--bg-elevated);
            color: var(--text-primary);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 10px 12px;
            font-size: 14px;
            font-family: var(--font);
            transition: border-color 150ms ease, box-shadow 150ms ease;
        }

        input::placeholder {
            color: var(--text-muted);
        }

        input:hover:not(:focus) {
            border-color: var(--border-strong);
        }

        input:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
            background: var(--bg-elevated);
        }

        input.error {
            border-color: rgba(239, 68, 68, 0.7);
            box-shadow: 0 0 0 2px rgba(239,68,68,0.15);
        }

        .hint {
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.45;
        }

        .error-alert {
            width: 100%;
            border: 1px solid rgba(239, 68, 68, 0.35);
            background: rgba(239, 68, 68, 0.08);
            color: #fca5a5;
            border-radius: var(--radius-sm);
            padding: 9px 12px;
            font-size: 12px;
            line-height: 1.45;
        }

        .actions {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding-top: 4px;
        }

        .start-button {
            -webkit-app-region: no-drag;
            width: 100%;
            border: none;
            border-radius: var(--radius-sm);
            background: #6366F1;
            color: #ffffff;
            font-size: 14px;
            font-weight: 600;
            padding: 12px 14px;
            cursor: pointer;
            transition: background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
            box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
            letter-spacing: -0.01em;
            font-family: var(--font);
        }

        .start-button:hover {
            background: #4F46E5;
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
        }

        .start-button:active {
            transform: translateY(0);
            box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
        }

        .start-button.disabled {
            opacity: 0.45;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
    `;

    static properties = {
        onStart: { type: Function },
        onExternalLink: { type: Function },
        selectedProfile: { type: String },
        onProfileChange: { type: Function },
        isInitializing: { type: Boolean },
        whisperDownloading: { type: Boolean },
        hasVoiceProfile: { type: Boolean },
        onResetVoiceProfile: { type: Function },
        onRecalibrate: { type: Function },
        _token: { state: true },
        _tokenErrorMessage: { state: true },
    };

    constructor() {
        super();
        this.onStart = () => {};
        this.onExternalLink = () => {};
        this.selectedProfile = 'interview';
        this.onProfileChange = () => {};
        this.isInitializing = false;
        this.whisperDownloading = false;
        this.hasVoiceProfile = false;
        this.onResetVoiceProfile = () => {};
        this.onRecalibrate = () => {};

        this._token = '';
        this._tokenErrorMessage = '';

        this.boundKeydownHandler = this._handleKeydown.bind(this);
        this._loadFromStorage();
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('keydown', this.boundKeydownHandler);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('keydown', this.boundKeydownHandler);
    }

    _handleKeydown(e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        if ((isMac ? e.metaKey : e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            this._handleStart();
        }
    }

    async _loadFromStorage() {
        try {
            const creds = await hintio.storage.getCredentials().catch(() => ({}));
            this._token = creds.cloudToken || '';
            this.requestUpdate();
        } catch (error) {
            console.error('Error loading MainView storage:', error);
        }
    }

    async _saveToken(val) {
        this._token = val;
        this._tokenErrorMessage = '';
        await hintio.storage.setAccessToken(val);
        this.requestUpdate();
    }

    _handleStart() {
        if (this.isInitializing) return;

        if (!this._token.trim()) {
            this._tokenErrorMessage = 'Access token is required.';
            this.requestUpdate();
            return;
        }

        this._startWithPersistedCredentials();
    }

    async _startWithPersistedCredentials() {
        try {
            const trimmedToken = this._token.trim();
            await hintio.storage.setAccessToken(trimmedToken);
            this.onStart(trimmedToken);
        } catch (error) {
            console.error('Failed to persist access token before start:', error);
            this._tokenErrorMessage = 'Failed to save access token. Please try again.';
            this.requestUpdate();
        }
    }

    triggerApiKeyError(message = 'Access token is invalid or expired.') {
        this._tokenErrorMessage = message;
        this.requestUpdate();
    }

    render() {
        return html`
            <div class="card">
                <div class="card-header">
                    <div class="brand-row">
                        <div class="brand-mark">G</div>
                    </div>
                    <h1 class="title">Start a session</h1>
                    <p class="subtitle">Enter your access token to connect to the AI assistant</p>
                </div>

                <div class="divider"></div>

                <div class="form-group">
                    <label class="form-label">Access Token</label>
                    <input
                        type="password"
                        placeholder="SKI-••••••••••••••••"
                        .value=${this._token}
                        @input=${e => this._saveToken(e.target.value)}
                        class=${this._tokenErrorMessage ? 'error' : ''}
                    />
                    <div class="hint">Use any valid SKI access token from your generated key list</div>
                </div>

                ${this._tokenErrorMessage ? html`<div class="error-alert">${this._tokenErrorMessage}</div>` : ''}

                <div class="actions">
                    <button class="start-button ${this.isInitializing ? 'disabled' : ''}" @click=${() => this._handleStart()}>
                        Start Session
                    </button>
                </div>
            </div>
        `;
    }
}

customElements.define('main-view', MainView);
