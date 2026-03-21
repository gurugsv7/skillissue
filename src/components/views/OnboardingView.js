import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class OnboardingView extends LitElement {
    static styles = css`
        * {
            box-sizing: border-box;
            font-family: var(--font, 'Inter', -apple-system, sans-serif);
            cursor: default;
            user-select: none;
            margin: 0;
            padding: 0;
        }

        :host {
            display: block;
            height: 100%;
            width: 100%;
            position: fixed;
            top: 0;
            left: 0;
            overflow: hidden;
            background: #09090b;
            color: #FAFAFA;
        }

        .icon {
            font-family: 'Material Symbols Rounded';
            font-weight: normal;
            font-style: normal;
            line-height: 1;
            font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            vertical-align: middle;
        }

        .onboarding {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background-image: 
                radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.12) 0%, transparent 50%),
                linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            background-size: 100% 100%, 40px 40px, 40px 40px;
            background-position: top center, center center, center center;
            padding: 40px;
        }

        .card {
            width: 100%;
            max-width: 460px;
            background: #0f0f12;
            border: 1px solid #27272a;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
            animation: slideUpFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            position: relative;
        }

        @keyframes slideUpFade {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .step-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 24px;
        }

        .step-dot {
            height: 3px;
            flex: 1;
            background: #27272a;
            border-radius: 1.5px;
            transition: background 0.3s;
        }

        .step-dot.active {
            background: #6366f1;
        }

        .header-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 32px;
        }

        .title {
            font-size: 24px;
            font-weight: 600;
            letter-spacing: -0.02em;
            color: #fafafa;
        }

        .subtitle {
            font-size: 13px;
            line-height: 1.6;
            color: #a1a1aa;
        }

        .feature-list {
            display: flex;
            flex-direction: column;
            gap: 20px;
            margin-bottom: 40px;
        }

        .feature-item {
            display: flex;
            align-items: flex-start;
            gap: 12px;
        }

        .feature-icon-wrap {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: rgba(99, 102, 241, 0.1);
            color: #6366f1;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            border: 1px solid rgba(99, 102, 241, 0.2);
        }

        .feature-icon-wrap .icon {
            font-size: 18px;
        }

        .feature-text {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .feature-text strong {
            font-size: 13px;
            font-weight: 600;
            color: #fafafa;
        }

        .feature-text span {
            font-size: 12px;
            color: #a1a1aa;
            line-height: 1.5;
        }

        .context-input {
            width: 100%;
            height: 160px;
            padding: 14px;
            background: #09090b;
            border: 1px solid #27272a;
            border-radius: 8px;
            color: #fafafa;
            font-size: 13px;
            line-height: 1.6;
            resize: none;
            transition: border-color 0.2s;
            margin-bottom: 32px;
        }

        .context-input:focus {
            outline: none;
            border-color: #6366f1;
        }

        .context-input::placeholder {
            color: #52525b;
        }

        .actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding-top: 24px;
            border-top: 1px solid #27272a;
        }

        .btn-primary {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: #fafafa;
            color: #09090b;
            border: none;
            padding: 0 20px;
            height: 36px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s;
            margin-left: auto;
        }

        .btn-primary:hover {
            opacity: 0.9;
        }

        .btn-secondary {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: transparent;
            color: #a1a1aa;
            border: none;
            padding: 0 12px;
            height: 36px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: color 0.2s, background 0.2s;
            margin-left: -12px; /* Pull left to align text visually */
        }

        .btn-secondary:hover {
            color: #fafafa;
            background: #18181b;
        }

        .btn-secondary .icon {
            font-size: 16px;
        }

        .skip-hint {
            font-size: 12px;
            color: #52525b;
            margin-right: auto;
            margin-left: 12px;
        }
    `;

    static properties = {
        currentSlide: { type: Number },
        contextText: { type: String },
        onComplete: { type: Function },
    };

    constructor() {
        super();
        this.currentSlide = 0;
        this.contextText = '';
        this.onComplete = () => {};
    }

    _openHelpGuide() {
        const helpUrl = 'https://www.hintio.tech/help';
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.invoke('open-external', helpUrl).catch((error) => {
                console.error('Failed to open help guide:', error);
            });
            return;
        }
        window.open(helpUrl, '_blank', 'noopener,noreferrer');
    }

    handleContextInput(e) {
        this.contextText = e.target.value;
    }

    async completeOnboarding() {
        if (this.contextText.trim()) {
            await hintio.storage.updatePreference('customPrompt', this.contextText.trim());
        }
        await hintio.storage.updateConfig('onboarded', true);
        this.onComplete();
    }

    renderSlideOne() {
        return html`
            <div class="card">
                <div class="step-indicator">
                    <div class="step-dot active"></div>
                    <div class="step-dot"></div>
                    <div class="step-dot"></div>
                </div>
                
                <div class="header-group">
                    <div class="title">Welcome to Hintio</div>
                    <div class="subtitle">A precise, low-latency assistant designed to give you the competitive edge in high-stakes environments.</div>
                </div>

                <div class="feature-list">
                    <div class="feature-item">
                        <div class="feature-icon-wrap"><span class="icon">bolt</span></div>
                        <div class="feature-text">
                            <strong>Real-time analysis</strong>
                            <span>Processes screen and audio instantly without dropping performance.</span>
                        </div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon-wrap"><span class="icon">visibility_off</span></div>
                        <div class="feature-text">
                            <strong>Stealth UI</strong>
                            <span>Designed to remain undetectable and unobtrusive while active.</span>
                        </div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon-wrap"><span class="icon">tune</span></div>
                        <div class="feature-text">
                            <strong>Highly customizable</strong>
                            <span>Tune the assistant's context on-the-fly for specific scenarios.</span>
                        </div>
                    </div>
                </div>

                <div class="actions">
                    <button class="btn-primary" @click=${() => { this.currentSlide = 1; }}>
                        Configure Setup <span class="icon" style="font-size: 16px;">arrow_forward</span>
                    </button>
                </div>
            </div>
        `;
    }

    renderSlideTwo() {
        return html`
            <div class="card">
                <div class="step-indicator">
                    <div class="step-dot active"></div>
                    <div class="step-dot active"></div>
                    <div class="step-dot"></div>
                </div>

                <div class="header-group">
                    <div class="title">Set active context</div>
                    <div class="subtitle">Paste relevant materials so the assistant can provide perfectly targeted responses.</div>
                </div>

                <textarea
                    class="context-input"
                    placeholder="E.g., job descriptions, meeting agendas, your resume, or exam reference material..."
                    .value=${this.contextText}
                    @input=${this.handleContextInput}
                ></textarea>

                <div class="actions">
                    <button class="btn-secondary" @click=${() => { this.currentSlide = 0; }}>
                        <span class="icon">arrow_back</span> Back
                    </button>
                    ${!this.contextText.trim() ? html`<span class="skip-hint">You can add this later.</span>` : ''}
                    <button class="btn-primary" @click=${() => { this.currentSlide = 2; }}>
                        Continue
                    </button>
                </div>
            </div>
        `;
    }

    renderSlideThree() {
        return html`
            <div class="card">
                <div class="step-indicator">
                    <div class="step-dot active"></div>
                    <div class="step-dot active"></div>
                    <div class="step-dot active"></div>
                </div>

                <div class="header-group">
                    <div class="title">Read this before start</div>
                    <div class="subtitle">
                        Before using your access key, check this help guide for proper instructions on usage.
                    </div>
                </div>

                <div class="feature-list" style="margin-bottom: 28px;">
                    <div class="feature-item">
                        <div class="feature-icon-wrap"><span class="icon">menu_book</span></div>
                        <div class="feature-text">
                            <strong>Usage Help Guide</strong>
                            <span>Open the guide to avoid common mistakes and use your key correctly.</span>
                        </div>
                    </div>
                </div>

                <div class="actions">
                    <button class="btn-secondary" @click=${() => { this.currentSlide = 1; }}>
                        <span class="icon">arrow_back</span> Back
                    </button>
                    <button class="btn-secondary" @click=${() => this._openHelpGuide()}>
                        Open Help Guide
                    </button>
                    <button class="btn-primary" @click=${this.completeOnboarding}>
                        Go to Start Session
                    </button>
                </div>
            </div>
        `;
    }

    render() {
        return html`
            <div class="onboarding">
                ${this.currentSlide === 0
                    ? this.renderSlideOne()
                    : this.currentSlide === 1
                        ? this.renderSlideTwo()
                        : this.renderSlideThree()}
            </div>
        `;
    }
}

customElements.define('onboarding-view', OnboardingView);
