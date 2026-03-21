import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

export class AssistantView extends LitElement {
    static styles = css`
        :host {
            height: 100%;
            display: flex;
            flex-direction: column;
            position: relative;
        }

        * {
            font-family: var(--font);
            cursor: default;
        }

        /* ── Response area ── */

        .response-container {
            flex: 1;
            overflow-y: auto;
            font-size: var(--response-font-size, 15px);
            line-height: var(--line-height);
            background: var(--bg-app);
            padding: var(--space-sm) var(--space-md);
            scroll-behavior: smooth;
            user-select: text;
            cursor: text;
            color: var(--text-primary);
        }

        .response-container * {
            user-select: text;
            cursor: text;
        }

        .response-container a {
            cursor: pointer;
        }

        .response-container [data-word] {
            display: inline-block;
        }

        /* ── Markdown ── */

        .response-container h1,
        .response-container h2,
        .response-container h3,
        .response-container h4,
        .response-container h5,
        .response-container h6 {
            margin: 1.1em 0 0.4em 0;
            color: #e2e8f0;
            font-weight: var(--font-weight-semibold);
            letter-spacing: -0.01em;
        }

        .response-container h1 { font-size: 1.5em; }
        .response-container h2 { font-size: 1.3em; }
        .response-container h3 { font-size: 1.15em; }
        .response-container h4 { font-size: 1.05em; }
        .response-container h5,
        .response-container h6 { font-size: 1em; }

        .response-container p {
            margin: 0.6em 0;
            color: var(--text-primary);
        }

        .response-container ul,
        .response-container ol {
            margin: 0.6em 0;
            padding-left: 1.5em;
            color: var(--text-primary);
        }

        .response-container li {
            margin: 0.3em 0;
        }

        .response-container blockquote {
            margin: 0.8em 0;
            padding: 0.6em 1em;
            border-left: 3px solid var(--accent);
            background: rgba(59, 130, 246, 0.06);
            border-radius: 0 var(--radius-md) var(--radius-md) 0;
            color: var(--text-secondary);
        }

        .response-container code {
            background: rgba(59, 130, 246, 0.1);
            color: #93c5fd;
            padding: 0.15em 0.4em;
            border-radius: var(--radius-sm);
            font-family: var(--font-mono);
            font-size: 0.85em;
            border: 1px solid rgba(59, 130, 246, 0.15);
        }

        /* ── Terminal-style code blocks ── */

        .response-container pre {
            margin: 1em 0;
            border-radius: var(--radius-md);
            overflow: hidden;
            border: 1px solid #2a2a2a;
            background: #0d1117;
        }

        .response-container pre code {
            background: none;
            color: #e6edf3;
            padding: 0;
            border: none;
            font-size: 0.82em;
            border-radius: 0;
        }

        .code-block-wrapper {
            margin: 1em 0;
            border-radius: var(--radius-md);
            overflow: hidden;
            border: 1px solid #2a2a2a;
            background: #0d1117;
        }

        .code-block-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 14px;
            background: #161b22;
            border-bottom: 1px solid #2a2a2a;
            user-select: none;
        }

        .code-block-lang {
            font-family: var(--font-mono);
            font-size: 11px;
            color: #7d8590;
            letter-spacing: 0.04em;
            text-transform: lowercase;
        }

        .code-block-copy {
            background: none;
            border: 1px solid #30363d;
            color: #7d8590;
            cursor: pointer;
            font-family: var(--font-mono);
            font-size: 11px;
            padding: 3px 10px;
            border-radius: 6px;
            transition: color 0.15s, border-color 0.15s, background 0.15s;
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .code-block-copy:hover {
            color: #e6edf3;
            border-color: #6e7681;
            background: #21262d;
        }

        .code-block-copy.copied {
            color: #3fb950;
            border-color: #3fb950;
        }

        .code-block-wrapper pre {
            margin: 0;
            border: none;
            border-radius: 0;
            padding: 14px 16px;
            overflow-x: auto;
            background: #0d1117;
        }

        .code-block-wrapper pre code {
            background: none;
            color: #e6edf3;
            padding: 0;
            border: none;
            font-family: var(--font-mono);
            font-size: 0.82em;
            line-height: 1.6;
            border-radius: 0;
        }

        .response-container a {
            color: var(--accent);
            text-decoration: underline;
            text-underline-offset: 2px;
        }

        .response-container strong,
        .response-container b {
            font-weight: var(--font-weight-semibold);
            color: #f1f5f9;
        }

        .response-container hr {
            border: none;
            border-top: 1px solid var(--border);
            margin: 1.5em 0;
        }

        .response-container table {
            border-collapse: collapse;
            width: 100%;
            margin: 0.8em 0;
        }

        .response-container th,
        .response-container td {
            border: 1px solid var(--border);
            padding: var(--space-sm);
            text-align: left;
        }

        .response-container th {
            background: var(--bg-surface);
            font-weight: var(--font-weight-semibold);
        }

        .response-container::-webkit-scrollbar {
            width: 6px;
        }

        .response-container::-webkit-scrollbar-track {
            background: transparent;
        }

        .response-container::-webkit-scrollbar-thumb {
            background: var(--border-strong);
            border-radius: 3px;
        }

        .response-container::-webkit-scrollbar-thumb:hover {
            background: #444444;
        }

        /* ── Response navigation strip ── */

        .response-nav {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--space-sm);
            padding: var(--space-xs) var(--space-md);
            border-top: 1px solid var(--border);
            background: var(--bg-app);
        }

        .nav-btn {
            background: none;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            padding: var(--space-xs);
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color var(--transition);
        }

        .nav-btn:hover:not(:disabled) {
            color: var(--text-primary);
        }

        .nav-btn:disabled {
            opacity: 0.25;
            cursor: default;
        }

        .icon {
            font-family: 'Material Symbols Rounded';
            font-weight: normal;
            font-style: normal;
            line-height: 1;
            font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20;
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            user-select: none;
        }

        .nav-btn .icon {
            font-size: 16px;
        }

        .response-counter {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            font-family: var(--font-mono);
            min-width: 40px;
            text-align: center;
        }

        /* ── Bottom input bar ── */

        .input-bar {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-md);
            background: var(--bg-app);
        }

        .input-bar-inner {
            display: flex;
            align-items: center;
            flex: 1;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 100px;
            padding: 0 var(--space-md);
            height: 32px;
            transition: all var(--transition);
        }

        .input-bar-inner:focus-within {
            border-color: var(--accent);
        }

        .input-bar.expanded .input-bar-inner {
            border-radius: var(--radius-md);
            height: auto;
            min-height: 120px;
            padding: var(--space-md);
            align-items: flex-start;
        }

        .input-bar.expanded .input-bar-inner input {
            padding: var(--space-xs) 0;
            min-height: 32px;
            word-wrap: break-word;
            white-space: pre-wrap;
        }

        .input-bar-inner input {
            flex: 1;
            background: none;
            color: var(--text-primary);
            border: none;
            padding: 0;
            font-size: var(--font-size-sm);
            font-family: var(--font);
            height: 100%;
            outline: none;
        }

        .input-bar-inner input::placeholder {
            color: var(--text-muted);
        }

        .analyze-btn {
            position: relative;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            color: var(--text-primary);
            cursor: pointer;
            font-size: var(--font-size-xs);
            font-family: var(--font-mono);
            white-space: nowrap;
            padding: var(--space-xs) var(--space-md);
            border-radius: 100px;
            height: 32px;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: border-color 0.4s ease, background var(--transition);
            flex-shrink: 0;
            overflow: hidden;
        }

        .analyze-btn:hover:not(.analyzing) {
            border-color: var(--accent);
            background: var(--bg-surface);
        }

        .analyze-btn.analyzing {
            cursor: default;
            border-color: transparent;
        }

        .analyze-btn-content {
            display: flex;
            align-items: center;
            gap: 4px;
            transition: opacity 0.4s ease;
            z-index: 1;
            position: relative;
        }

        .analyze-btn.analyzing .analyze-btn-content {
            opacity: 0;
        }

        .analyze-canvas {
            position: absolute;
            inset: -1px;
            width: calc(100% + 2px);
            height: calc(100% + 2px);
            pointer-events: none;
        }

        /* ── Error slide panel ── */

        .error-panel {
            position: absolute;
            top: 0;
            right: 0;
            width: 280px;
            height: 100%;
            background: #0f1923;
            border-left: 2px solid var(--danger);
            transform: translateX(100%);
            transition: transform 300ms ease;
            z-index: 10;
            display: flex;
            flex-direction: column;
            box-shadow: -4px 0 20px rgba(0, 0, 0, 0.4);
        }

        .error-panel.open {
            transform: translateX(0);
        }

        .error-panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            background: rgba(239, 68, 68, 0.12);
            border-bottom: 1px solid rgba(239, 68, 68, 0.2);
            user-select: none;
            flex-shrink: 0;
        }

        .error-panel-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            font-weight: 600;
            color: #f87171;
            font-family: var(--font-mono);
        }

        .error-panel-title .icon {
            font-size: 16px;
            flex-shrink: 0;
            color: #f87171;
        }

        .error-panel-close {
            background: none;
            border: none;
            color: #7d8590;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            transition: color 0.15s, background 0.15s;
        }

        .error-panel-close:hover {
            color: var(--text-primary);
            background: rgba(255, 255, 255, 0.06);
        }

        .error-panel-close .icon {
            font-size: 16px;
        }

        .error-panel-body {
            flex: 1;
            overflow-y: auto;
            padding: 12px 14px;
            font-size: 13px;
            line-height: 1.6;
            color: #e6edf3;
            font-family: var(--font);
        }

        .error-panel-body p {
            margin: 0.5em 0;
        }

        .error-panel-body code {
            background: rgba(239, 68, 68, 0.1);
            color: #fca5a5;
            padding: 0.1em 0.35em;
            border-radius: 3px;
            font-family: var(--font-mono);
            font-size: 0.88em;
        }

        .error-panel-body::-webkit-scrollbar {
            width: 4px;
        }

        .error-panel-body::-webkit-scrollbar-thumb {
            background: #333;
            border-radius: 2px;
        }
    `;

    static properties = {
        responses: { type: Array },
        currentResponseIndex: { type: Number },
        selectedProfile: { type: String },
        onSendText: { type: Function },
        shouldAnimateResponse: { type: Boolean },
        isAnalyzing: { type: Boolean, state: true },
        errorContent: { type: String },
        _errorPanelOpen: { type: Boolean, state: true },
        _inputExpanded: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.responses = [];
        this.currentResponseIndex = -1;
        this.selectedProfile = 'interview';
        this.onSendText = () => {};
        this.isAnalyzing = false;
        this._animFrame = null;
        this.errorContent = '';
        this._errorPanelOpen = false;
        this._inputExpanded = false;
    }

    getProfileNames() {
        return {
            interview: 'Job Interview',
            sales: 'Sales Call',
            meeting: 'Business Meeting',
            presentation: 'Presentation',
            negotiation: 'Negotiation',
            exam: 'Exam Assistant',
        };
    }

    getCurrentResponse() {
        const profileNames = this.getProfileNames();
        return this.responses.length > 0 && this.currentResponseIndex >= 0
            ? this.responses[this.currentResponseIndex]
            : `Listening to your ${profileNames[this.selectedProfile] || 'session'}...`;
    }

    renderMarkdown(content) {
        if (typeof window !== 'undefined' && window.marked) {
            try {
                window.marked.setOptions({
                    breaks: true,
                    gfm: true,
                    sanitize: false,
                });
                let rendered = window.marked.parse(content);
                rendered = this.sanitizeRenderedHtml(rendered);
                rendered = this.wrapWordsInSpans(rendered);
                return rendered;
            } catch (error) {
                console.warn('Error parsing markdown:', error);
                return content;
            }
        }
        return content;
    }

    sanitizeRenderedHtml(rawHtml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(rawHtml || ''), 'text/html');
        const allowedTags = new Set([
            'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'CODE', 'PRE',
            'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
            'BLOCKQUOTE', 'HR', 'A', 'TABLE', 'THEAD', 'TBODY',
            'TR', 'TH', 'TD', 'SPAN', 'DIV',
        ]);

        const removeNodeButKeepChildren = (node) => {
            const parent = node.parentNode;
            if (!parent) return;
            while (node.firstChild) {
                parent.insertBefore(node.firstChild, node);
            }
            parent.removeChild(node);
        };

        const sanitizeNode = (node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName;

                if (!allowedTags.has(tag)) {
                    removeNodeButKeepChildren(node);
                    return;
                }

                for (const attr of Array.from(node.attributes)) {
                    const name = attr.name.toLowerCase();
                    const value = String(attr.value || '').trim();

                    if (name.startsWith('on')) {
                        node.removeAttribute(attr.name);
                        continue;
                    }

                    if (name === 'style') {
                        node.removeAttribute(attr.name);
                        continue;
                    }

                    if (tag === 'A' && name === 'href') {
                        const safeHref = value.toLowerCase();
                        const allowedHref = safeHref.startsWith('https://') || safeHref.startsWith('http://') || safeHref.startsWith('mailto:');
                        if (!allowedHref || safeHref.includes('javascript:') || safeHref.includes('data:')) {
                            node.removeAttribute('href');
                        } else {
                            node.setAttribute('rel', 'noopener noreferrer');
                            node.setAttribute('target', '_blank');
                        }
                        continue;
                    }

                    if (name !== 'href' && name !== 'class' && name !== 'data-word' && name !== 'rel' && name !== 'target') {
                        node.removeAttribute(attr.name);
                    }
                }
            }

            Array.from(node.childNodes).forEach(child => sanitizeNode(child));
        };

        Array.from(doc.body.childNodes).forEach(node => sanitizeNode(node));
        return doc.body.innerHTML;
    }

    wrapWordsInSpans(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const tagsToSkip = ['PRE'];

        function wrap(node) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() && !tagsToSkip.includes(node.parentNode.tagName)) {
                const words = node.textContent.split(/(\s+)/);
                const frag = document.createDocumentFragment();
                words.forEach(word => {
                    if (word.trim()) {
                        const span = document.createElement('span');
                        span.setAttribute('data-word', '');
                        span.textContent = word;
                        frag.appendChild(span);
                    } else {
                        frag.appendChild(document.createTextNode(word));
                    }
                });
                node.parentNode.replaceChild(frag, node);
            } else if (node.nodeType === Node.ELEMENT_NODE && !tagsToSkip.includes(node.tagName)) {
                Array.from(node.childNodes).forEach(wrap);
            }
        }
        Array.from(doc.body.childNodes).forEach(wrap);
        return doc.body.innerHTML;
    }

    navigateToPreviousResponse() {
        if (this.currentResponseIndex > 0) {
            this.currentResponseIndex--;
            this.dispatchEvent(
                new CustomEvent('response-index-changed', {
                    detail: { index: this.currentResponseIndex },
                })
            );
            this.requestUpdate();
        }
    }

    navigateToNextResponse() {
        if (this.currentResponseIndex < this.responses.length - 1) {
            this.currentResponseIndex++;
            this.dispatchEvent(
                new CustomEvent('response-index-changed', {
                    detail: { index: this.currentResponseIndex },
                })
            );
            this.requestUpdate();
        }
    }

    scrollResponseUp() {
        const container = this.shadowRoot.querySelector('.response-container');
        if (container) {
            const scrollAmount = container.clientHeight * 0.3;
            container.scrollTop = Math.max(0, container.scrollTop - scrollAmount);
        }
    }

    scrollResponseDown() {
        const container = this.shadowRoot.querySelector('.response-container');
        if (container) {
            const scrollAmount = container.clientHeight * 0.3;
            container.scrollTop = Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + scrollAmount);
        }
    }

    connectedCallback() {
        super.connectedCallback();

        if (window.require) {
            const { ipcRenderer } = window.require('electron');

            this.handlePreviousResponse = () => this.navigateToPreviousResponse();
            this.handleNextResponse = () => this.navigateToNextResponse();
            this.handleScrollUp = () => this.scrollResponseUp();
            this.handleScrollDown = () => this.scrollResponseDown();

            ipcRenderer.on('navigate-previous-response', this.handlePreviousResponse);
            ipcRenderer.on('navigate-next-response', this.handleNextResponse);
            ipcRenderer.on('scroll-response-up', this.handleScrollUp);
            ipcRenderer.on('scroll-response-down', this.handleScrollDown);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopWaveformAnimation();

        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (this.handlePreviousResponse) ipcRenderer.removeListener('navigate-previous-response', this.handlePreviousResponse);
            if (this.handleNextResponse) ipcRenderer.removeListener('navigate-next-response', this.handleNextResponse);
            if (this.handleScrollUp) ipcRenderer.removeListener('scroll-response-up', this.handleScrollUp);
            if (this.handleScrollDown) ipcRenderer.removeListener('scroll-response-down', this.handleScrollDown);
        }
    }

    async handleSendText() {
        const textInput = this.shadowRoot.querySelector('#textInput');
        if (textInput && textInput.value.trim()) {
            const message = textInput.value.trim();
            textInput.value = '';
            await this.onSendText(message);
        }
    }

    handleTextKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSendText();
        }
        // Allow Shift+Enter for newlines in expanded mode
        if (e.key === 'Enter' && e.shiftKey && this._inputExpanded) {
            // Let default newline behavior happen
            return;
        }
    }

    toggleInputExpanded() {
        this._inputExpanded = !this._inputExpanded;
        if (this._inputExpanded) {
            setTimeout(() => {
                const textInput = this.shadowRoot.querySelector('#textInput');
                if (textInput) textInput.focus();
            }, 0);
        }
        this.requestUpdate();
    }

    closeInputExpanded() {
        this._inputExpanded = false;
        this.requestUpdate();
    }

    async handleScreenAnswer() {
        if (this.isAnalyzing) return;
        if (window.captureManualScreenshot) {
            this.isAnalyzing = true;
            this._responseCountWhenStarted = this.responses.length;
            this.dispatchEvent(new CustomEvent('screen-analysis-triggered', { bubbles: true, composed: true }));
            window.captureManualScreenshot();
        }
    }

    _startWaveformAnimation() {
        const canvas = this.shadowRoot.querySelector('.analyze-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const dangerColor = getComputedStyle(this).getPropertyValue('--danger').trim() || '#EF4444';
        const startTime = performance.now();
        const FADE_IN = 0.5; // seconds
        const PARTICLE_SPREAD = 4; // px inward from border
        const PARTICLE_COUNT = 250;

        // Pill perimeter helpers
        const w = rect.width;
        const h = rect.height;
        const r = h / 2; // pill radius = half height
        const straightLen = w - 2 * r;
        const arcLen = Math.PI * r;
        const perimeter = 2 * straightLen + 2 * arcLen;

        // Given a distance along the perimeter, return {x, y, nx, ny} (position + inward normal)
        const pointOnPerimeter = (d) => {
            d = ((d % perimeter) + perimeter) % perimeter;
            // Top straight: left to right
            if (d < straightLen) {
                return { x: r + d, y: 0, nx: 0, ny: 1 };
            }
            d -= straightLen;
            // Right arc
            if (d < arcLen) {
                const angle = -Math.PI / 2 + (d / arcLen) * Math.PI;
                return {
                    x: w - r + Math.cos(angle) * r,
                    y: r + Math.sin(angle) * r,
                    nx: -Math.cos(angle),
                    ny: -Math.sin(angle),
                };
            }
            d -= arcLen;
            // Bottom straight: right to left
            if (d < straightLen) {
                return { x: w - r - d, y: h, nx: 0, ny: -1 };
            }
            d -= straightLen;
            // Left arc
            const angle = Math.PI / 2 + (d / arcLen) * Math.PI;
            return {
                x: r + Math.cos(angle) * r,
                y: r + Math.sin(angle) * r,
                nx: -Math.cos(angle),
                ny: -Math.sin(angle),
            };
        };

        // Pre-seed random offsets for stable particles
        const seeds = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            seeds.push({ pos: Math.random(), drift: Math.random(), depthSeed: Math.random() });
        }

        const draw = (now) => {
            const elapsed = (now - startTime) / 1000;
            const fade = Math.min(1, elapsed / FADE_IN);

            ctx.clearRect(0, 0, w, h);

            // ── Particle border ──
            ctx.fillStyle = dangerColor;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const s = seeds[i];
                const along = (s.pos + s.drift * elapsed * 0.03) * perimeter;
                const depth = s.depthSeed * PARTICLE_SPREAD;
                const density = 1 - depth / PARTICLE_SPREAD;

                if (Math.random() > density) continue;

                const p = pointOnPerimeter(along);
                const px = p.x + p.nx * depth;
                const py = p.y + p.ny * depth;
                const size = 0.8 + density * 0.6;

                ctx.globalAlpha = fade * density * 0.85;
                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI * 2);
                ctx.fill();
            }

            // ── Waveform ──
            const midY = h / 2;
            const waves = [
                { freq: 3, amp: 0.35, speed: 2.5, opacity: 0.9, width: 1.8 },
                { freq: 5, amp: 0.2, speed: 3.5, opacity: 0.5, width: 1.2 },
                { freq: 7, amp: 0.12, speed: 5, opacity: 0.3, width: 0.8 },
            ];

            for (const wave of waves) {
                ctx.beginPath();
                ctx.strokeStyle = dangerColor;
                ctx.globalAlpha = wave.opacity * fade;
                ctx.lineWidth = wave.width;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                for (let x = 0; x <= w; x++) {
                    const norm = x / w;
                    const envelope = Math.sin(norm * Math.PI);
                    const y = midY + Math.sin(norm * Math.PI * 2 * wave.freq + elapsed * wave.speed) * (midY * wave.amp) * envelope;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            ctx.globalAlpha = 1;
            this._animFrame = requestAnimationFrame(draw);
        };

        this._animFrame = requestAnimationFrame(draw);
    }

    _stopWaveformAnimation() {
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
        const canvas = this.shadowRoot.querySelector('.analyze-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            const container = this.shadowRoot.querySelector('.response-container');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 0);
    }

    firstUpdated() {
        super.firstUpdated();
        this.updateResponseContent();
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        if (changedProperties.has('responses') || changedProperties.has('currentResponseIndex')) {
            this.updateResponseContent();
        }

        if (changedProperties.has('isAnalyzing')) {
            if (this.isAnalyzing) {
                this._startWaveformAnimation();
            } else {
                this._stopWaveformAnimation();
            }
        }

        if (changedProperties.has('responses') && this.isAnalyzing) {
            if (this.responses.length > this._responseCountWhenStarted) {
                this.isAnalyzing = false;
            }
        }

    }

    updateResponseContent() {
        const container = this.shadowRoot.querySelector('#responseContainer');
        if (container) {
            const currentResponse = this.getCurrentResponse();
            container.innerHTML = this.renderMarkdown(currentResponse);
            this._postProcessCodeBlocks(container);
            if (this.shouldAnimateResponse) {
                this.dispatchEvent(new CustomEvent('response-animation-complete', { bubbles: true, composed: true }));
            }
        }
    }

    _dismissErrorPanel() {
        this._errorPanelOpen = false;
        this.dispatchEvent(new CustomEvent('dismiss-error-panel', { bubbles: true, composed: true }));
    }

    _renderErrorPanel() {
        const renderedError = this.errorContent ? this.renderMarkdown(this.errorContent) : '';
        return html`
            <div class="error-panel ${this._errorPanelOpen ? 'open' : ''}">
                <div class="error-panel-header">
                    <span class="error-panel-title">
                        <span class="icon">terminal</span>
                        Code Issue
                    </span>
                    <button class="error-panel-close" @click=${() => this._dismissErrorPanel()} title="Dismiss">
                        <span class="icon">close</span>
                    </button>
                </div>
                <div class="error-panel-body" .innerHTML=${renderedError}></div>
            </div>
        `;
    }

    _postProcessCodeBlocks(container) {
        const preBlocks = container.querySelectorAll('pre');
        preBlocks.forEach((pre) => {
            if (pre.closest('.code-block-wrapper')) return; // already processed

            const code = pre.querySelector('code');

            // Detect language from class e.g. "language-python"
            let lang = '';
            if (code) {
                const match = [...code.classList].find(c => c.startsWith('language-'));
                if (match) lang = match.replace('language-', '');
            }

            // Apply highlight.js if available
            if (code && window.hljs && lang) {
                try { window.hljs.highlightElement(code); } catch(e) {}
            } else if (code && window.hljs && !lang) {
                try { window.hljs.highlightElement(code); } catch(e) {}
            }

            // Build wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            const header = document.createElement('div');
            header.className = 'code-block-header';

            const langLabel = document.createElement('span');
            langLabel.className = 'code-block-lang';
            langLabel.textContent = lang || 'code';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'code-block-copy';
            copyBtn.innerHTML = `<span class="icon" style="font-size:14px;margin-right:2px">content_copy</span>copy`;
            copyBtn.addEventListener('click', () => {
                const text = code ? code.innerText : pre.innerText;
                navigator.clipboard.writeText(text).then(() => {
                    copyBtn.textContent = 'copied!';
                    copyBtn.classList.add('copied');
                    setTimeout(() => {
                        copyBtn.innerHTML = `<span class="icon" style="font-size:14px;margin-right:2px">content_copy</span>copy`;
                        copyBtn.classList.remove('copied');
                    }, 2000);
                }).catch(() => {});
            });

            header.appendChild(langLabel);
            header.appendChild(copyBtn);

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
        });
    }

    render() {
        const hasMultipleResponses = this.responses.length > 1;

        return html`
            <div class="response-container" id="responseContainer"></div>

            ${this._renderErrorPanel()}

            ${hasMultipleResponses ? html`
                <div class="response-nav">
                    <button class="nav-btn" @click=${this.navigateToPreviousResponse} ?disabled=${this.currentResponseIndex <= 0} title="Previous response">
                        <span class="icon">chevron_left</span>
                    </button>
                    <span class="response-counter">${this.currentResponseIndex + 1} of ${this.responses.length}</span>
                    <button class="nav-btn" @click=${this.navigateToNextResponse} ?disabled=${this.currentResponseIndex >= this.responses.length - 1} title="Next response">
                        <span class="icon">chevron_right</span>
                    </button>
                </div>
            ` : ''}

            <div class="input-bar ${this._inputExpanded ? 'expanded' : ''}">
                <div class="input-bar-inner">
                    <input
                        type="text"
                        id="textInput"
                        placeholder="Type a message..."
                        @keydown=${this.handleTextKeydown}
                    />
                </div>
                <button class="analyze-btn ${this.isAnalyzing ? 'analyzing' : ''}" @click=${this.handleScreenAnswer}>
                    <canvas class="analyze-canvas"></canvas>
                    <span class="analyze-btn-content">
                        <span class="icon" style="font-size: 16px;">psychology</span>
                        Analyze Screen
                    </span>
                </button>
            </div>
        `;
    }
}

customElements.define('assistant-view', AssistantView);
