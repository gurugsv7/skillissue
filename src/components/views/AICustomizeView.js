import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

export class AICustomizeView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .unified-page {
                height: 100%;
            }
            .unified-wrap {
                height: 100%;
            }
            section.surface {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            .form-grid {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            .form-group.vertical {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            textarea.control {
                flex: 1;
                resize: none;
                overflow-y: auto;
                min-height: 0;
            }

            /* ── Profile selector tabs ── */
            .profile-tabs {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 4px;
            }

            .profile-tab {
                padding: 5px 14px;
                border-radius: 999px;
                border: 1px solid rgba(0, 212, 255, 0.2);
                background: rgba(0, 212, 255, 0.04);
                color: rgba(0, 212, 255, 0.5);
                font-size: 11px;
                font-family: var(--font-mono);
                text-transform: uppercase;
                letter-spacing: 0.08em;
                cursor: pointer;
                transition: all 0.18s ease;
                user-select: none;
            }

            .profile-tab:hover {
                border-color: rgba(0, 212, 255, 0.55);
                color: rgba(0, 212, 255, 0.9);
                background: rgba(0, 212, 255, 0.1);
                box-shadow: 0 0 10px rgba(0, 212, 255, 0.12);
            }

            .profile-tab.active {
                border-color: rgba(0, 212, 255, 0.85);
                background: rgba(0, 212, 255, 0.14);
                color: #00d4ff;
                box-shadow:
                    0 0 14px rgba(0, 212, 255, 0.2),
                    inset 0 0 6px rgba(0, 212, 255, 0.06);
            }

            /* ── Header banner ── */
            .ai-header-banner {
                position: relative;
                overflow: hidden;
                border: 1px solid rgba(127, 90, 240, 0.25);
                border-radius: var(--radius-md);
                padding: 18px 20px;
                background: linear-gradient(135deg, rgba(127, 90, 240, 0.08) 0%, rgba(0, 212, 255, 0.06) 100%);
                display: flex;
                align-items: center;
                gap: 14px;
            }

            .ai-header-banner::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: repeating-linear-gradient(
                    90deg,
                    transparent,
                    transparent 60px,
                    rgba(127, 90, 240, 0.04) 60px,
                    rgba(127, 90, 240, 0.04) 61px
                );
                pointer-events: none;
            }

            .ai-icon-ring {
                position: relative;
                width: 44px;
                height: 44px;
                border-radius: 50%;
                border: 1px solid rgba(127, 90, 240, 0.5);
                background: rgba(127, 90, 240, 0.1);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                flex-shrink: 0;
                box-shadow: 0 0 16px rgba(127, 90, 240, 0.2);
            }

            .ai-header-text {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .ai-header-title {
                font-size: var(--font-size-base);
                font-weight: var(--font-weight-semibold);
                color: #e8e8e8;
                letter-spacing: -0.01em;
            }

            .ai-header-sub {
                font-size: 11px;
                color: rgba(127, 90, 240, 0.8);
                font-family: var(--font-mono);
                letter-spacing: 0.04em;
            }

            .ai-status-dot {
                margin-left: auto;
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 10px;
                font-family: var(--font-mono);
                color: rgba(34, 197, 94, 0.7);
                flex-shrink: 0;
            }

            .ai-status-dot::before {
                content: '';
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #22c55e;
                box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
                animation: status-blink 2.4s ease-in-out infinite;
            }

            @keyframes status-blink {
                0%,
                100% {
                    opacity: 1;
                }
                50% {
                    opacity: 0.3;
                }
            }

            /* ── Section label override ── */
            .section-label {
                font-size: 10px;
                font-family: var(--font-mono);
                text-transform: uppercase;
                letter-spacing: 0.12em;
                color: rgba(0, 212, 255, 0.6);
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .section-label::after {
                content: '';
                flex: 1;
                height: 1px;
                background: linear-gradient(90deg, rgba(0, 212, 255, 0.25), transparent);
            }

            /* ── Resume upload zone ── */
            .resume-zone {
                position: relative;
                margin-bottom: 2px;
                border: 1.5px dashed rgba(0, 212, 255, 0.3);
                border-radius: var(--radius-md);
                background: rgba(0, 212, 255, 0.025);
                padding: 16px 18px;
                display: flex;
                align-items: center;
                gap: 14px;
                cursor: pointer;
                transition:
                    border-color 0.2s,
                    background 0.2s,
                    box-shadow 0.2s;
                overflow: hidden;
            }

            .resume-zone:hover {
                border-color: rgba(0, 212, 255, 0.6);
                background: rgba(0, 212, 255, 0.05);
                box-shadow: 0 0 16px rgba(0, 212, 255, 0.08);
            }

            .resume-zone.has-file {
                border-style: solid;
                border-color: rgba(0, 212, 255, 0.45);
                background: rgba(0, 212, 255, 0.04);
            }

            .resume-zone.parsing {
                border-color: rgba(127, 90, 240, 0.5);
                background: rgba(127, 90, 240, 0.04);
                animation: parse-pulse 1.4s ease-in-out infinite;
            }

            @keyframes parse-pulse {
                0%,
                100% {
                    box-shadow: 0 0 0 rgba(127, 90, 240, 0);
                }
                50% {
                    box-shadow: 0 0 18px rgba(127, 90, 240, 0.2);
                }
            }

            .resume-icon {
                width: 36px;
                height: 36px;
                border-radius: var(--radius-sm);
                border: 1px solid rgba(0, 212, 255, 0.25);
                background: rgba(0, 212, 255, 0.06);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                flex-shrink: 0;
            }

            .resume-zone.parsing .resume-icon {
                border-color: rgba(127, 90, 240, 0.4);
                background: rgba(127, 90, 240, 0.08);
                animation: spin-icon 1.2s linear infinite;
            }

            @keyframes spin-icon {
                from {
                    transform: rotate(0deg);
                }
                to {
                    transform: rotate(360deg);
                }
            }

            .resume-info {
                flex: 1;
                min-width: 0;
            }

            .resume-title {
                font-size: var(--font-size-sm);
                color: #e8e8e8;
                font-weight: var(--font-weight-medium);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .resume-sub {
                margin-top: 2px;
                font-size: 10px;
                font-family: var(--font-mono);
                color: rgba(0, 212, 255, 0.5);
            }

            .resume-zone.parsing .resume-sub {
                color: rgba(127, 90, 240, 0.7);
            }

            .resume-badge {
                font-size: 10px;
                font-family: var(--font-mono);
                padding: 3px 8px;
                border-radius: 999px;
                border: 1px solid rgba(34, 197, 94, 0.4);
                color: rgba(34, 197, 94, 0.9);
                background: rgba(34, 197, 94, 0.06);
                white-space: nowrap;
                flex-shrink: 0;
            }

            .resume-badge.error {
                border-color: rgba(239, 68, 68, 0.4);
                color: rgba(239, 68, 68, 0.9);
                background: rgba(239, 68, 68, 0.06);
            }

            .resume-clear {
                width: 22px;
                height: 22px;
                border-radius: 50%;
                border: 1px solid rgba(239, 68, 68, 0.35);
                background: transparent;
                color: rgba(239, 68, 68, 0.6);
                font-size: 12px;
                line-height: 1;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: all 0.15s;
            }

            .resume-clear:hover {
                background: rgba(239, 68, 68, 0.1);
                border-color: rgba(239, 68, 68, 0.7);
                color: #ef4444;
            }
        `,
    ];

    static properties = {
        selectedProfile: { type: String },
        onProfileChange: { type: Function },
        _context: { state: true },
        _resumeFileName: { state: true },
        _resumeParsing: { state: true },
        _resumeError: { state: true },
        _domain: { state: true },
    };

    constructor() {
        super();
        this.selectedProfile = 'interview';
        this.onProfileChange = () => {};
        this._context = '';
        this._domain = '';
        this._resumeFileName = '';
        this._resumeParsing = false;
        this._resumeError = '';
        this._loadFromStorage();
    }

    async _loadFromStorage() {
        try {
            const prefs = await hintio.storage.getPreferences();
            this._context = prefs.customPrompt || '';
            this._domain = prefs.interviewDomain || '';
            this._resumeFileName = prefs.resumeFileName || '';
            // resumeText is stored separately — never shown in the textarea
            this.requestUpdate();
        } catch (error) {
            console.error('Error loading AI customize storage:', error);
        }
    }

    _handleProfileChange(e) {
        this.onProfileChange(e.target.value);
    }

    async _saveContext(val) {
        this._context = val;
        await hintio.storage.updatePreference('customPrompt', val);
    }

    // The field the interview is in. Everything terminology-sensitive keys off
    // this, so it is worth asking for directly rather than inferring.
    async _saveDomain(val) {
        this._domain = val;
        await hintio.storage.updatePreference('interviewDomain', val);
    }

    async _handleResumeUpload() {
        if (this._resumeParsing) return;
        try {
            const ipcRenderer = window.electronAPI;
            const filePath = await ipcRenderer.invoke('open-file-dialog', {
                title: 'Select Resume',
                filters: [{ name: 'Documents', extensions: ['pdf', 'docx'] }],
                properties: ['openFile'],
            });
            if (!filePath) return;

            this._resumeParsing = true;
            this._resumeError = '';
            this.requestUpdate();

            const { text, fileName } = await ipcRenderer.invoke('parse-document', filePath);

            // Clean up extracted text — stored separately, never shown in textarea
            const cleaned = text
                .replace(/\r\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            this._resumeFileName = fileName;
            // Save resume text to its own key, not into customPrompt
            await hintio.storage.updatePreference('resumeText', cleaned);
            await hintio.storage.updatePreference('resumeFileName', fileName);
            this._resumeParsing = false;
            this.requestUpdate();
        } catch (err) {
            console.error('Resume parse error:', err);
            this._resumeError = err.message || 'Failed to parse document';
            this._resumeParsing = false;
            this.requestUpdate();
        }
    }

    async _clearResume() {
        this._resumeFileName = '';
        this._resumeError = '';
        await hintio.storage.updatePreference('resumeText', '');
        await hintio.storage.updatePreference('resumeFileName', '');
        this.requestUpdate();
    }

    _getProfileName(profile) {
        const names = {
            interview: 'Job Interview',
            'technical-interview': 'Technical Interview',
            // Retired id — kept so older saved sessions still show a label.
            'frontend-interview': 'Technical Interview',
            sales: 'Sales Call',
            meeting: 'Business Meeting',
            presentation: 'Presentation',
            negotiation: 'Negotiation',
            exam: 'Exam Assistant',
        };
        return names[profile] || profile;
    }

    render() {
        const profiles = [
            { value: 'interview', label: 'Job Interview' },
            { value: 'technical-interview', label: 'Technical Interview' },
            { value: 'sales', label: 'Sales Call' },
            { value: 'meeting', label: 'Business Meeting' },
            { value: 'presentation', label: 'Presentation' },
            { value: 'negotiation', label: 'Negotiation' },
            { value: 'exam', label: 'Exam Assistant' },
        ];

        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <!-- Futuristic header banner -->
                    <div class="ai-header-banner">
                        <div class="ai-icon-ring">🤖</div>
                        <div class="ai-header-text">
                            <div class="ai-header-title">AI Context Engine</div>
                            <div class="ai-header-sub">// configure session intelligence</div>
                        </div>
                        <div class="ai-status-dot">READY</div>
                    </div>

                    <section class="surface">
                        <div class="form-grid">
                            <!-- Profile selector as clickable tabs -->
                            <div>
                                <div class="section-label">Session Profile</div>
                                <div class="profile-tabs">
                                    ${profiles.map(
                                        profile => html`
                                            <div
                                                class="profile-tab ${this.selectedProfile === profile.value ? 'active' : ''}"
                                                @click=${() => {
                                                    this.onProfileChange(profile.value);
                                                }}
                                            >
                                                ${profile.label}
                                            </div>
                                        `
                                    )}
                                </div>
                            </div>

                            <!-- Resume upload -->
                            <div>
                                <div class="section-label">Resume / CV</div>
                                <div
                                    class="resume-zone ${this._resumeParsing ? 'parsing' : ''} ${this._resumeFileName && !this._resumeParsing ? 'has-file' : ''}"
                                    @click=${() => !this._resumeParsing && !this._resumeFileName && this._handleResumeUpload()}
                                    style="${this._resumeFileName ? '' : 'cursor:pointer'}"
                                >
                                    <div class="resume-icon">${this._resumeParsing ? '⚙' : this._resumeFileName ? '📄' : '📎'}</div>
                                    <div class="resume-info">
                                        <div class="resume-title">
                                            ${
                                                this._resumeParsing
                                                    ? 'Parsing document…'
                                                    : this._resumeFileName
                                                      ? this._resumeFileName
                                                      : 'Upload Resume (PDF or DOCX)'
                                            }
                                        </div>
                                        <div class="resume-sub">
                                            ${
                                                this._resumeParsing
                                                    ? '// extracting text — please wait'
                                                    : this._resumeFileName
                                                      ? '// injected into AI context at session start'
                                                      : '// click to browse — answers will be tailored to your profile'
                                            }
                                        </div>
                                    </div>
                                    ${
                                        this._resumeError
                                            ? html` <span class="resume-badge error">ERR</span> `
                                            : this._resumeFileName && !this._resumeParsing
                                              ? html`
                                                    <span class="resume-badge">LOADED</span>
                                                    <button
                                                        class="resume-clear"
                                                        title="Remove resume"
                                                        @click=${e => {
                                                            e.stopPropagation();
                                                            this._clearResume();
                                                        }}
                                                    >
                                                        ✕
                                                    </button>
                                                `
                                              : ''
                                    }
                                </div>
                                ${
                                    this._resumeError
                                        ? html`
                                              <div
                                                  style="margin-top:6px;font-size:10px;font-family:var(--font-mono);color:rgba(239,68,68,0.8);padding:0 4px;"
                                              >
                                                  ⚠ ${this._resumeError}
                                                  <span
                                                      style="cursor:pointer;color:rgba(0,212,255,0.6);margin-left:8px;"
                                                      @click=${() => this._handleResumeUpload()}
                                                      >retry</span
                                                  >
                                              </div>
                                          `
                                        : ''
                                }
                                ${
                                    this._resumeFileName && !this._resumeParsing
                                        ? html`
                                              <div
                                                  style="margin-top:6px;font-size:10px;font-family:var(--font-mono);color:rgba(0,212,255,0.4);padding:0 4px;"
                                              >
                                                  <span style="cursor:pointer;color:rgba(0,212,255,0.55);" @click=${() => this._handleResumeUpload()}
                                                      >↺ replace file</span
                                                  >
                                              </div>
                                          `
                                        : ''
                                }
                            </div>

                            <!-- Interview domain -->
                            <div class="form-group vertical">
                                <div class="section-label">Interview Domain</div>
                                <input
                                    class="control"
                                    type="text"
                                    placeholder="> e.g. backend Go services, ICU nursing, M&A finance, high-school physics"
                                    .value=${this._domain}
                                    @input=${e => this._saveDomain(e.target.value)}
                                />
                                <div class="form-help">
                                    // locks terminology to your field — "grid" means CSS to a web engineer and a power network to an
                                    electrical one. Leave blank to infer it from your resume and context.
                                </div>
                            </div>

                            <!-- Custom instructions textarea -->
                            <div class="form-group vertical">
                                <div class="section-label">Custom Instructions</div>
                                <textarea
                                    class="control"
                                    placeholder="> paste job description, role requirements, additional constraints..."
                                    .value=${this._context}
                                    @input=${e => this._saveContext(e.target.value)}
                                ></textarea>
                                <div class="form-help">// sent as context at session start — resume text is included automatically</div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        `;
    }
}

customElements.define('ai-customize-view', AICustomizeView);
