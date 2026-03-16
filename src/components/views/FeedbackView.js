import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

export class FeedbackView extends LitElement {
    static FEEDBACK_COOLDOWN_MS = 60 * 1000;
    static styles = [
        unifiedPageStyles,
        css`
            .icon {
                font-family: 'Material Symbols Rounded';
                font-size: 20px;
                font-weight: normal;
                font-style: normal;
                line-height: 1;
                font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20;
                flex-shrink: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            /* ── Rating stars ── */
            .rating-row {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .rating-label {
                font-size: 12px;
                color: var(--text-muted);
                margin-right: 4px;
            }

            .star-btn {
                background: none;
                border: none;
                cursor: pointer;
                padding: 2px;
                border-radius: 4px;
                color: var(--border-strong);
                font-family: 'Material Symbols Rounded';
                font-size: 22px;
                font-weight: normal;
                line-height: 1;
                font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
                transition: color var(--transition), transform var(--transition);
            }

            .star-btn.active {
                color: #F59E0B;
                font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
            }

            .star-btn:hover {
                color: #F59E0B;
                transform: scale(1.2);
                font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
            }

            /* ── Category chips ── */
            .category-chips {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }

            .chip {
                padding: 5px 12px;
                border: 1px solid var(--border);
                border-radius: 20px;
                background: var(--bg-elevated);
                color: var(--text-secondary);
                font-size: 12px;
                cursor: pointer;
                transition: all var(--transition);
                white-space: nowrap;
            }

            .chip:hover {
                border-color: #6366F1;
                color: var(--text-primary);
                background: rgba(99,102,241,0.08);
            }

            .chip.selected {
                border-color: #6366F1;
                background: rgba(99,102,241,0.15);
                color: #fff;
            }

            /* ── Textarea & inputs ── */
            .feedback-textarea {
                width: 100%;
                min-height: 120px;
                resize: vertical;
                padding: 10px 12px;
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: var(--bg-elevated);
                color: var(--text-primary);
                font-size: var(--font-size-sm);
                font-family: var(--font);
                line-height: 1.5;
                transition: border-color var(--transition), box-shadow var(--transition);
            }

            .feedback-textarea:focus {
                outline: none;
                border-color: #6366F1;
                box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
            }

            .feedback-textarea::placeholder {
                color: var(--text-muted);
            }

            .feedback-email {
                width: 100%;
                max-width: 300px;
                padding: 9px 12px;
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: var(--bg-elevated);
                color: var(--text-primary);
                font-size: var(--font-size-sm);
                font-family: var(--font);
                transition: border-color var(--transition), box-shadow var(--transition);
            }

            .feedback-email:focus {
                outline: none;
                border-color: #6366F1;
                box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
            }

            .feedback-email::placeholder {
                color: var(--text-muted);
            }

            /* ── Footer row ── */
            .footer-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--space-sm);
                flex-wrap: wrap;
            }

            .attach-label {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                color: var(--text-muted);
                cursor: pointer;
                user-select: none;
            }

            .attach-label input[type="checkbox"] {
                cursor: pointer;
                accent-color: #6366F1;
            }

            .char-count {
                font-size: 11px;
                color: var(--text-muted);
                font-family: var(--font-mono);
            }

            /* ── Submit button ── */
            .submit-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 9px 18px;
                border: none;
                border-radius: var(--radius-sm);
                background: #6366F1;
                color: #fff;
                font-size: var(--font-size-sm);
                font-weight: 600;
                cursor: pointer;
                transition: background var(--transition), box-shadow var(--transition), transform var(--transition);
                box-shadow: 0 2px 8px rgba(99,102,241,0.35);
                white-space: nowrap;
            }

            .submit-btn:hover:not(:disabled) {
                background: #4F46E5;
                transform: translateY(-1px);
                box-shadow: 0 4px 14px rgba(99,102,241,0.4);
            }

            .submit-btn:disabled {
                opacity: 0.45;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }

            .submit-btn .icon {
                font-size: 16px;
                font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20;
            }

            /* ── Status message ── */
            .status-banner {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 14px;
                border-radius: var(--radius-sm);
                font-size: 13px;
                font-weight: 500;
            }

            .status-banner.success {
                background: rgba(34,197,94,0.1);
                border: 1px solid rgba(34,197,94,0.3);
                color: #4ade80;
            }

            .status-banner.error {
                background: rgba(239,68,68,0.08);
                border: 1px solid rgba(239,68,68,0.3);
                color: #f87171;
            }
        `,
    ];

    static properties = {
        _feedbackText: { state: true },
        _feedbackEmail: { state: true },
        _feedbackStatus: { state: true },
        _feedbackSending: { state: true },
        _attachInfo: { state: true },
        _version: { state: true },
        _rating: { state: true },
        _selectedCategory: { state: true },
    };

    constructor() {
        super();
        this._feedbackText = '';
        this._feedbackEmail = '';
        this._feedbackStatus = '';
        this._feedbackSending = false;
        this._attachInfo = true;
        this._version = '';
        this._rating = 0;
        this._selectedCategory = '';
        this._loadVersion();
    }

    async _loadVersion() {
        try {
            this._version = await hintio.getVersion();
            this.requestUpdate();
        } catch (e) {}
    }

    _getOS() {
        const p = navigator.platform || '';
        if (p.includes('Mac')) return 'macOS';
        if (p.includes('Win')) return 'Windows';
        if (p.includes('Linux')) return 'Linux';
        return p;
    }

    async _submitFeedback() {
        const text = String(this._feedbackText || '')
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
            .trim();
        if (!text || this._feedbackSending) return;

        const now = Date.now();
        const lastFeedbackAt = Number(localStorage.getItem('hintio-feedback-last-submit-at') || '0');
        const waitMs = FeedbackView.FEEDBACK_COOLDOWN_MS - (now - lastFeedbackAt);
        if (waitMs > 0) {
            const waitSeconds = Math.ceil(waitMs / 1000);
            this._feedbackStatus = `error:Please wait ${waitSeconds}s before sending again`;
            this.requestUpdate();
            return;
        }

        const suspiciousPatterns = [
            /https?:\/\//gi,
            /<script/gi,
            /buy\s+now/gi,
            /free\s+money/gi,
            /telegram/gi,
        ];
        const suspiciousHitCount = suspiciousPatterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
        if (suspiciousHitCount >= 2) {
            this._feedbackStatus = 'error:Feedback looks automated and was blocked';
            this.requestUpdate();
            return;
        }

        const email = String(this._feedbackEmail || '').trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            this._feedbackStatus = 'error:Invalid email format';
            this.requestUpdate();
            return;
        }

        let content = text;
        if (this._selectedCategory) content = `[${this._selectedCategory}] ${content}`;
        if (this._rating > 0) content += `\n\nRating: ${this._rating}/5 stars`;
        if (this._attachInfo) {
            content += `\n\nSent from ${this._getOS()} version ${this._version}`;
        }

        if (content.length > 2000) {
            this._feedbackStatus = 'error:Max 2000 characters';
            this.requestUpdate();
            return;
        }

        this._feedbackSending = true;
        this._feedbackStatus = '';
        this.requestUpdate();

        try {
            const body = { feedback: content };
            if (email) {
                body.email = email;
            }

            const res = await fetch('https://api.hintio.com/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                this._feedbackText = '';
                this._feedbackEmail = '';
                this._rating = 0;
                this._selectedCategory = '';
                localStorage.setItem('hintio-feedback-last-submit-at', String(Date.now()));
                this._feedbackStatus = 'success:Feedback sent — thank you!';
            } else if (res.status === 429) {
                this._feedbackStatus = 'error:Please wait a few minutes before sending again';
            } else {
                this._feedbackStatus = 'error:Failed to send. Try again shortly.';
            }
        } catch (e) {
            this._feedbackStatus = 'error:Could not connect to server';
        }

        this._feedbackSending = false;
        this.requestUpdate();
    }

    render() {
        const categories = ['Bug Report', 'Feature Request', 'Performance', 'UI/UX', 'Other'];
        const statusType = this._feedbackStatus.split(':')[0];
        const statusMsg = this._feedbackStatus.split(':').slice(1).join(':');
        const charCount = this._feedbackText.length;

        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div class="page-title">Send Feedback</div>

                    <!-- Rating -->
                    <section class="surface">
                        <div class="surface-header">
                            <span class="icon" style="font-size:16px;color:#F59E0B">star</span>
                            <div class="surface-title">How's your experience?</div>
                        </div>
                        <div class="rating-row">
                            <span class="rating-label">Overall rating</span>
                            ${[1,2,3,4,5].map(n => html`
                                <button
                                    class="star-btn ${this._rating >= n ? 'active' : ''}"
                                    @click=${() => { this._rating = n; this.requestUpdate(); }}
                                >star</button>
                            `)}
                        </div>
                    </section>

                    <!-- Category -->
                    <section class="surface">
                        <div class="surface-header">
                            <span class="icon" style="font-size:16px;color:#6366F1">label</span>
                            <div class="surface-title">Category</div>
                        </div>
                        <div class="category-chips">
                            ${categories.map(cat => html`
                                <button
                                    class="chip ${this._selectedCategory === cat ? 'selected' : ''}"
                                    @click=${() => { this._selectedCategory = this._selectedCategory === cat ? '' : cat; this.requestUpdate(); }}
                                >${cat}</button>
                            `)}
                        </div>
                    </section>

                    <!-- Message -->
                    <section class="surface">
                        <div class="surface-header">
                            <span class="icon" style="font-size:16px;color:#6366F1">edit_note</span>
                            <div class="surface-title">Your message</div>
                        </div>
                        <textarea
                            class="feedback-textarea"
                            placeholder="Bug reports, feature requests, anything on your mind..."
                            .value=${this._feedbackText}
                            @input=${e => { this._feedbackText = e.target.value; this.requestUpdate(); }}
                            maxlength="2000"
                        ></textarea>
                        <input
                            class="feedback-email"
                            type="email"
                            placeholder="Email (optional, for follow-up)"
                            .value=${this._feedbackEmail}
                            @input=${e => { this._feedbackEmail = e.target.value; }}
                        />
                        <div class="footer-row">
                            <label class="attach-label">
                                <input
                                    type="checkbox"
                                    .checked=${this._attachInfo}
                                    @change=${e => { this._attachInfo = e.target.checked; }}
                                />
                                Attach OS &amp; version info
                            </label>
                            <span class="char-count">${charCount}/2000</span>
                            <button
                                class="submit-btn"
                                @click=${() => this._submitFeedback()}
                                ?disabled=${!this._feedbackText.trim() || this._feedbackSending}
                            >
                                <span class="icon">send</span>
                                ${this._feedbackSending ? 'Sending…' : 'Send Feedback'}
                            </button>
                        </div>
                        ${this._feedbackStatus ? html`
                            <div class="status-banner ${statusType}">
                                <span class="icon" style="font-size:16px">${statusType === 'success' ? 'check_circle' : 'error'}</span>
                                ${statusMsg}
                            </div>
                        ` : ''}
                    </section>
                </div>
            </div>
        `;
    }
}

customElements.define('feedback-view', FeedbackView);
