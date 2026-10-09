import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

/**
 * CalibrationView — "Train Your Voice" pre-session phase.
 *
 * Records the user's voice via MediaRecorder, visualises live mic levels,
 * transcribes each prompt's audio via Groq Whisper (or Azure Speech fallback),
 * then analyses the transcripts through configured providers
 * (Gemini first, Groq fallback) to build an observation-only voice profile.
 */

const CALIBRATION_PROMPTS = [
    {
        id: 'intro',
        prompt: "Talk to me like you're explaining what you do to a friend at a coffee shop.",
        hint: 'Just speak naturally — there are no right answers here.',
    },
    {
        id: 'project',
        prompt: 'Walk me through something you built or worked on recently. What was it about?',
        hint: 'Explain it the way you would to a teammate.',
    },
    {
        id: 'challenge',
        prompt: 'Tell me about a time something broke or went wrong at work. How did you handle it?',
        hint: "Be yourself — don't try to sound polished.",
    },
    {
        id: 'opinion',
        prompt: "What's a technology or tool you have strong opinions about? Why?",
        hint: "Rant a little if you want — we're capturing your style.",
    },
    {
        id: 'explain',
        prompt: 'Pick a technical concept you know well and explain it simply.',
        hint: "Pretend you're explaining to someone non-technical.",
    },
    {
        id: 'strength',
        prompt: "What would you say you're genuinely good at? Give an example.",
        hint: "Talk the way you'd brag to a close friend — casual is good.",
    },
    {
        id: 'weakness',
        prompt: "What's something you're still figuring out or learning?",
        hint: 'Keep it honest and natural.',
    },
    {
        id: 'motivation',
        prompt: 'Why do you do what you do? What gets you excited about your work?',
        hint: 'Speak from the gut.',
    },
];

const TOTAL_CALIBRATION_SECONDS = 10 * 60; // 10 minutes

export class CalibrationView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            @keyframes cal-grid-pan {
                0% {
                    background-position: 0 0;
                }
                100% {
                    background-position: 40px 40px;
                }
            }

            @keyframes cal-fade-up {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            @keyframes cal-ring-pulse {
                0%,
                100% {
                    box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.4);
                }
                50% {
                    box-shadow: 0 0 0 10px rgba(0, 212, 255, 0);
                }
            }

            :host {
                display: flex;
                flex-direction: column;
                height: 100%;
            }

            .calibration-page {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: var(--space-xl) var(--space-lg);
                gap: var(--space-lg);
                overflow-y: auto;
                position: relative;
                /* Dot grid */
                background-image: radial-gradient(circle, rgba(0, 212, 255, 0.07) 1px, transparent 1px);
                background-size: 24px 24px;
                animation: cal-grid-pan 14s linear infinite;
            }

            /* Ambient glow corners */
            .calibration-page::before {
                content: '';
                position: fixed;
                inset: 0;
                pointer-events: none;
                background:
                    radial-gradient(ellipse 40% 30% at 10% 10%, rgba(0, 212, 255, 0.05) 0%, transparent 70%),
                    radial-gradient(ellipse 40% 30% at 90% 90%, rgba(127, 90, 240, 0.05) 0%, transparent 70%);
            }

            /* ── Header ── */
            .calibration-header {
                text-align: center;
                max-width: 520px;
                animation: cal-fade-up 0.4s ease both;
            }

            .calibration-title {
                font-size: var(--font-size-xl);
                font-weight: var(--font-weight-semibold);
                background: linear-gradient(90deg, #e8e8e8 0%, #00d4ff 60%, #7f5af0 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                margin-bottom: var(--space-xs);
                letter-spacing: -0.02em;
            }

            .calibration-subtitle {
                font-size: var(--font-size-sm);
                color: rgba(0, 212, 255, 0.5);
                line-height: var(--line-height);
                font-family: var(--font-mono);
            }

            /* ── Timer bar ── */
            .timer-bar {
                width: 100%;
                max-width: 520px;
                display: flex;
                align-items: center;
                gap: var(--space-md);
            }

            .timer-track {
                flex: 1;
                height: 3px;
                background: rgba(0, 212, 255, 0.1);
                border-radius: 2px;
                overflow: hidden;
            }

            .timer-fill {
                height: 100%;
                background: linear-gradient(90deg, #00d4ff, #7f5af0);
                border-radius: 2px;
                transition: width 1s linear;
                box-shadow: 0 0 8px rgba(0, 212, 255, 0.5);
            }

            .timer-text {
                font-size: var(--font-size-xs);
                color: rgba(0, 212, 255, 0.6);
                font-family: var(--font-mono);
                white-space: nowrap;
                min-width: 48px;
                text-align: right;
            }

            /* ── Prompt card ── */
            .prompt-card {
                width: 100%;
                max-width: 520px;
                border: 1px solid rgba(0, 212, 255, 0.22);
                border-radius: var(--radius-md);
                background: rgba(17, 17, 17, 0.88);
                backdrop-filter: blur(12px);
                padding: var(--space-lg);
                display: flex;
                flex-direction: column;
                gap: var(--space-sm);
                position: relative;
                overflow: hidden;
                animation: cal-fade-up 0.35s ease both;
                box-shadow:
                    0 0 20px rgba(0, 212, 255, 0.06),
                    0 8px 32px rgba(0, 0, 0, 0.4);
            }

            /* Corner accent on prompt card */
            .prompt-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 24px;
                height: 24px;
                border-top: 2px solid rgba(0, 212, 255, 0.5);
                border-left: 2px solid rgba(0, 212, 255, 0.5);
                border-radius: var(--radius-md) 0 0 0;
            }

            .prompt-card::after {
                content: '';
                position: absolute;
                bottom: 0;
                right: 0;
                width: 24px;
                height: 24px;
                border-bottom: 2px solid rgba(127, 90, 240, 0.4);
                border-right: 2px solid rgba(127, 90, 240, 0.4);
                border-radius: 0 0 var(--radius-md) 0;
            }

            .prompt-number {
                font-size: 10px;
                color: #00d4ff;
                font-weight: var(--font-weight-semibold);
                text-transform: uppercase;
                letter-spacing: 0.12em;
                font-family: var(--font-mono);
            }

            .prompt-text {
                font-size: var(--font-size-md);
                color: var(--text-primary);
                line-height: 1.5;
                font-weight: var(--font-weight-medium);
            }

            .prompt-hint {
                font-size: var(--font-size-xs);
                color: rgba(0, 212, 255, 0.4);
                font-style: italic;
                font-family: var(--font-mono);
            }

            /* ── Recording indicator ── */
            .recording-indicator {
                display: flex;
                align-items: center;
                gap: var(--space-sm);
                font-size: var(--font-size-sm);
                color: var(--text-secondary);
            }

            .recording-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #ef4444;
                box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
                animation: pulse-dot 1.5s ease-in-out infinite;
            }

            @keyframes pulse-dot {
                0%,
                100% {
                    opacity: 1;
                    box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
                }
                50% {
                    opacity: 0.3;
                    box-shadow: 0 0 3px rgba(239, 68, 68, 0.2);
                }
            }

            /* ── Audio level meter ── */
            .audio-meter {
                width: 100%;
                max-width: 520px;
                display: flex;
                align-items: center;
                gap: var(--space-sm);
            }

            .audio-meter-label {
                font-size: var(--font-size-xs);
                color: rgba(0, 212, 255, 0.45);
                white-space: nowrap;
                min-width: 30px;
                font-family: var(--font-mono);
                text-transform: uppercase;
                letter-spacing: 0.06em;
                font-size: 9px;
            }

            .audio-meter-track {
                flex: 1;
                height: 5px;
                background: rgba(0, 212, 255, 0.08);
                border-radius: 3px;
                overflow: hidden;
            }

            .audio-meter-fill {
                height: 100%;
                border-radius: 3px;
                background: linear-gradient(90deg, #00d4ff 0%, #22c55e 50%, #ef4444 100%);
                transition: width 0.05s linear;
                min-width: 0;
                box-shadow: 0 0 6px rgba(0, 212, 255, 0.4);
            }

            /* ── Transcript preview ── */
            .transcript-preview {
                width: 100%;
                max-width: 520px;
                min-height: 80px;
                max-height: 140px;
                overflow-y: auto;
                border: 1px solid rgba(0, 212, 255, 0.15);
                border-radius: var(--radius-sm);
                background: rgba(0, 10, 15, 0.8);
                padding: var(--space-sm) var(--space-md);
                font-size: var(--font-size-sm);
                color: rgba(0, 212, 255, 0.8);
                line-height: 1.5;
                font-family: var(--font-mono);
                white-space: pre-wrap;
            }

            .transcript-placeholder {
                color: rgba(0, 212, 255, 0.25);
                font-style: italic;
            }

            /* ── Action buttons ── */
            .calibration-actions {
                display: flex;
                justify-content: center;
                flex-wrap: wrap;
                gap: var(--space-sm);
                width: 100%;
                max-width: 520px;
            }

            .cal-btn {
                -webkit-app-region: no-drag;
                flex: 0 1 auto;
                min-width: 180px;
                padding: 10px var(--space-md);
                border-radius: var(--radius-sm);
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-medium);
                cursor: pointer;
                border: 1px solid rgba(0, 212, 255, 0.2);
                background: rgba(0, 212, 255, 0.04);
                color: rgba(0, 212, 255, 0.7);
                transition: all 0.18s ease;
                font-family: var(--font-mono);
                text-transform: uppercase;
                letter-spacing: 0.06em;
                font-size: 11px;
            }

            .cal-btn:hover {
                border-color: rgba(0, 212, 255, 0.5);
                background: rgba(0, 212, 255, 0.1);
                color: #00d4ff;
                box-shadow: 0 0 12px rgba(0, 212, 255, 0.12);
            }

            .cal-btn.primary {
                background: linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(127, 90, 240, 0.12) 100%);
                border-color: rgba(0, 212, 255, 0.6);
                color: #00d4ff;
                box-shadow: 0 0 14px rgba(0, 212, 255, 0.12);
            }

            .cal-btn.primary:hover {
                background: linear-gradient(135deg, rgba(0, 212, 255, 0.25) 0%, rgba(127, 90, 240, 0.2) 100%);
                box-shadow: 0 0 20px rgba(0, 212, 255, 0.22);
            }

            .cal-btn:disabled {
                opacity: 0.3;
                cursor: not-allowed;
            }

            .cal-btn.skip {
                background: transparent;
                border-color: rgba(0, 212, 255, 0.22);
                color: rgba(0, 212, 255, 0.6);
            }

            .cal-btn.skip:hover {
                border-color: rgba(0, 212, 255, 0.55);
                background: rgba(0, 212, 255, 0.08);
                color: #00d4ff;
                box-shadow: 0 0 12px rgba(0, 212, 255, 0.14);
            }

            /* ── Completion card ── */
            .completion-card {
                width: 100%;
                max-width: 520px;
                border: 1px solid rgba(34, 197, 94, 0.35);
                border-radius: var(--radius-md);
                background: rgba(34, 197, 94, 0.05);
                backdrop-filter: blur(12px);
                padding: var(--space-lg);
                text-align: center;
                display: flex;
                flex-direction: column;
                gap: var(--space-md);
                align-items: center;
                box-shadow: 0 0 30px rgba(34, 197, 94, 0.07);
                animation: cal-fade-up 0.4s ease both;
            }

            .completion-icon {
                font-size: 32px;
                filter: drop-shadow(0 0 12px rgba(34, 197, 94, 0.5));
            }

            .completion-title {
                font-size: var(--font-size-md);
                font-weight: var(--font-weight-semibold);
                background: linear-gradient(90deg, #e8e8e8, #22c55e);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }

            .completion-subtitle {
                font-size: var(--font-size-sm);
                color: rgba(34, 197, 94, 0.55);
                line-height: 1.5;
                font-family: var(--font-mono);
            }

            .analyzing-spinner {
                width: 24px;
                height: 24px;
                border: 2px solid rgba(0, 212, 255, 0.15);
                border-top-color: #00d4ff;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                box-shadow: 0 0 10px rgba(0, 212, 255, 0.2);
            }

            @keyframes spin {
                to {
                    transform: rotate(360deg);
                }
            }

            /* ── Typed input fallback ── */
            .typed-input {
                -webkit-app-region: no-drag;
                width: min(100%, 420px);
                max-width: 420px;
                background: rgba(0, 10, 15, 0.85);
                color: rgba(0, 212, 255, 0.85);
                border: 1px solid rgba(0, 212, 255, 0.2);
                border-radius: var(--radius-sm);
                padding: var(--space-sm) var(--space-md);
                font-size: var(--font-size-sm);
                font-family: var(--font-mono);
                line-height: 1.5;
                resize: vertical;
                min-height: 80px;
            }

            .typed-input:focus {
                outline: none;
                border-color: rgba(0, 212, 255, 0.6);
                box-shadow:
                    0 0 0 1px rgba(0, 212, 255, 0.2),
                    0 0 12px rgba(0, 212, 255, 0.1);
            }

            .typed-input::placeholder {
                color: rgba(0, 212, 255, 0.2);
            }

            .mode-toggle {
                -webkit-app-region: no-drag;
                font-size: var(--font-size-xs);
                color: rgba(0, 212, 255, 0.6);
                cursor: pointer;
                background: none;
                border: none;
                padding: 0;
                font-family: var(--font-mono);
                text-decoration: underline;
                text-underline-offset: 2px;
            }

            .mode-toggle:hover {
                opacity: 0.8;
            }

            .samples-count {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
                text-align: center;
                font-family: var(--font-mono);
            }

            .status-text {
                font-size: var(--font-size-xs);
                color: rgba(0, 212, 255, 0.45);
                text-align: center;
                font-style: italic;
                font-family: var(--font-mono);
            }

            .error-text {
                font-size: var(--font-size-xs);
                color: #ef4444;
                text-align: center;
                font-family: var(--font-mono);
            }
        `,
    ];

    static properties = {
        onComplete: { type: Object },
        onSkip: { type: Object },
        language: { type: String },
        _currentPromptIndex: { state: true },
        _transcripts: { state: true },
        _currentTranscript: { state: true },
        _elapsedSeconds: { state: true },
        _phase: { state: true }, // 'calibrating' | 'transcribing' | 'analyzing' | 'complete'
        _useTypedInput: { state: true },
        _typedText: { state: true },
        _isRecording: { state: true },
        _micError: { state: true },
        _audioLevel: { state: true },
        _statusText: { state: true },
    };

    constructor() {
        super();
        this.onComplete = () => {};
        this.onSkip = () => {};
        this.language = 'en-US';
        this._currentPromptIndex = 0;
        this._transcripts = []; // Array of { promptId, prompt, text }
        this._currentTranscript = '';
        this._elapsedSeconds = 0;
        this._phase = 'calibrating';
        this._useTypedInput = false;
        this._typedText = '';
        this._isRecording = false;
        this._timerInterval = null;
        this._micError = null;
        this._audioLevel = 0;
        this._statusText = '';

        // Audio recording state
        this._micStream = null;
        this._mediaRecorder = null;
        this._audioChunks = [];
        this._audioContext = null;
        this._analyserNode = null;
        this._levelAnimFrame = null;

        // Per-prompt audio blobs
        this._promptAudioBlobs = {}; // { promptId: Blob }
    }

    connectedCallback() {
        super.connectedCallback();
        this._startTimer();
        this._startMicCapture();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopTimer();
        this._stopMicCapture();
    }

    // ============ MIC CAPTURE (MediaRecorder + AnalyserNode) ============

    async _startMicCapture() {
        if (this._useTypedInput) return;

        try {
            this._statusText = 'Requesting microphone access...';
            this.requestUpdate();

            this._micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: false,
            });

            console.log('CalibrationView: mic stream obtained');

            // Set up AnalyserNode for live audio level
            this._audioContext = new AudioContext();
            const source = this._audioContext.createMediaStreamSource(this._micStream);
            this._analyserNode = this._audioContext.createAnalyser();
            this._analyserNode.fftSize = 256;
            this._analyserNode.smoothingTimeConstant = 0.5;
            source.connect(this._analyserNode);

            // Start level meter animation
            this._updateAudioLevel();

            // Start recording for the current prompt
            this._startRecordingPrompt();

            this._micError = null;
            this._statusText = '';
            this.requestUpdate();
        } catch (err) {
            console.error('CalibrationView: mic capture failed:', err);
            if (err.name === 'NotAllowedError') {
                this._micError = 'Microphone access denied. Please allow mic permission or type instead.';
            } else if (err.name === 'NotFoundError') {
                this._micError = 'No microphone found. Please connect a mic or type instead.';
            } else {
                this._micError = 'Could not start microphone: ' + err.message;
            }
            this._statusText = '';
            this.requestUpdate();
        }
    }

    _stopMicCapture() {
        // Stop level meter
        if (this._levelAnimFrame) {
            cancelAnimationFrame(this._levelAnimFrame);
            this._levelAnimFrame = null;
        }

        // Stop recorder
        this._stopRecordingPrompt();

        // Close audio context
        if (this._audioContext) {
            this._audioContext.close().catch(() => {});
            this._audioContext = null;
            this._analyserNode = null;
        }

        // Stop mic stream tracks
        if (this._micStream) {
            this._micStream.getTracks().forEach(t => t.stop());
            this._micStream = null;
        }

        this._isRecording = false;
        this._audioLevel = 0;
    }

    _updateAudioLevel() {
        if (!this._analyserNode) return;

        const data = new Uint8Array(this._analyserNode.frequencyBinCount);
        this._analyserNode.getByteFrequencyData(data);

        // Compute RMS-ish level 0-100
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i];
        }
        const avg = sum / data.length;
        this._audioLevel = Math.min(100, Math.round((avg / 255) * 100 * 2.5)); // amplify a bit

        this._levelAnimFrame = requestAnimationFrame(() => this._updateAudioLevel());
        // Only trigger a LitElement update every ~100ms to avoid excessive renders
        if (!this._lastLevelUpdate || Date.now() - this._lastLevelUpdate > 80) {
            this._lastLevelUpdate = Date.now();
            this.requestUpdate();
        }
    }

    _startRecordingPrompt() {
        if (!this._micStream) return;

        // Stop any previous recording
        this._stopRecordingPrompt();

        this._audioChunks = [];

        try {
            // Prefer webm/opus, fall back to whatever the browser supports
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                  ? 'audio/webm'
                  : '';

            this._mediaRecorder = new MediaRecorder(this._micStream, mimeType ? { mimeType } : undefined);

            this._mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) {
                    this._audioChunks.push(e.data);
                }
            };

            this._mediaRecorder.onstop = () => {
                // Save the blob for this prompt
                const prompt = CALIBRATION_PROMPTS[this._currentPromptIndex];
                if (this._audioChunks.length > 0) {
                    const blob = new Blob(this._audioChunks, {
                        type: this._mediaRecorder?.mimeType || 'audio/webm',
                    });
                    if (blob.size > 1000) {
                        // Only save if there's meaningful audio (> 1KB)
                        this._promptAudioBlobs[prompt.id] = blob;
                        console.log(`CalibrationView: saved audio for prompt "${prompt.id}" — ${(blob.size / 1024).toFixed(1)} KB`);
                    }
                }
                this._audioChunks = [];
            };

            this._mediaRecorder.start(1000); // Collect chunks every 1s
            this._isRecording = true;
            console.log('CalibrationView: started recording for prompt', CALIBRATION_PROMPTS[this._currentPromptIndex].id);
            this.requestUpdate();
        } catch (err) {
            console.error('CalibrationView: MediaRecorder failed:', err);
            this._micError = 'Recording failed: ' + err.message;
            this.requestUpdate();
        }
    }

    _stopRecordingPrompt() {
        if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
            try {
                this._mediaRecorder.stop();
            } catch (e) {
                // ignore
            }
        }
        this._isRecording = false;
    }

    // ============ TIMER ============

    _startTimer() {
        this._stopTimer();
        this._timerInterval = setInterval(() => {
            this._elapsedSeconds++;
            this.requestUpdate();
        }, 1000);
    }

    _stopTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    _getProgressPercent() {
        return Math.min(100, (this._elapsedSeconds / TOTAL_CALIBRATION_SECONDS) * 100);
    }

    // ============ NAVIGATION ============

    async _handleNext() {
        // Stop current recording — onstop will save the blob
        this._stopRecordingPrompt();

        // If typed input, save text directly
        if (this._useTypedInput && this._typedText.trim()) {
            const prompt = CALIBRATION_PROMPTS[this._currentPromptIndex];
            this._transcripts = [
                ...this._transcripts.filter(t => t.promptId !== prompt.id),
                { promptId: prompt.id, prompt: prompt.prompt, text: this._typedText.trim() },
            ];
            this._typedText = '';
        }

        // Wait a tick for the onstop handler to fire
        await new Promise(r => setTimeout(r, 200));

        if (this._currentPromptIndex < CALIBRATION_PROMPTS.length - 1) {
            this._currentPromptIndex++;
            this._currentTranscript = '';
            // Restore previous typed text if going to an already-answered prompt
            const prev = this._transcripts.find(t => t.promptId === CALIBRATION_PROMPTS[this._currentPromptIndex].id);
            if (prev && this._useTypedInput) {
                this._typedText = prev.text;
            }
            // Start recording for the new prompt
            if (!this._useTypedInput) {
                this._startRecordingPrompt();
            }
        } else {
            // All prompts done
            await this._transcribeAndAnalyze();
        }
        this.requestUpdate();
    }

    _handlePrev() {
        if (this._currentPromptIndex > 0) {
            // Stop current recording
            this._stopRecordingPrompt();

            // Save typed text if applicable
            if (this._useTypedInput && this._typedText.trim()) {
                const prompt = CALIBRATION_PROMPTS[this._currentPromptIndex];
                this._transcripts = [
                    ...this._transcripts.filter(t => t.promptId !== prompt.id),
                    { promptId: prompt.id, prompt: prompt.prompt, text: this._typedText.trim() },
                ];
            }

            this._currentPromptIndex--;
            this._currentTranscript = '';
            this._typedText = '';

            // Restore previous text
            const prev = this._transcripts.find(t => t.promptId === CALIBRATION_PROMPTS[this._currentPromptIndex].id);
            if (prev) {
                if (this._useTypedInput) {
                    this._typedText = prev.text;
                } else {
                    this._currentTranscript = prev.text;
                }
            }

            // Restart recording for this prompt (will overwrite previous blob on next stop)
            setTimeout(() => {
                if (!this._useTypedInput) this._startRecordingPrompt();
            }, 250);

            this.requestUpdate();
        }
    }

    async _handleFinishEarly() {
        this._stopRecordingPrompt();

        // Save current prompt text
        if (this._useTypedInput && this._typedText.trim()) {
            const prompt = CALIBRATION_PROMPTS[this._currentPromptIndex];
            this._transcripts = [
                ...this._transcripts.filter(t => t.promptId !== prompt.id),
                { promptId: prompt.id, prompt: prompt.prompt, text: this._typedText.trim() },
            ];
        }

        await new Promise(r => setTimeout(r, 200));

        const audioCount = Object.keys(this._promptAudioBlobs).length;
        const textCount = this._transcripts.filter(t => !this._promptAudioBlobs[t.promptId]).length;

        if (audioCount + textCount >= 2) {
            await this._transcribeAndAnalyze();
        } else {
            this.onSkip();
        }
    }

    // ============ TRANSCRIPTION + ANALYSIS ============

    async _transcribeAndAnalyze() {
        this._stopTimer();
        this._stopMicCapture();

        // Phase 1: transcribe any audio blobs that don't already have text
        const audioPromptIds = Object.keys(this._promptAudioBlobs);
        const untranscribedIds = audioPromptIds.filter(id => !this._transcripts.find(t => t.promptId === id));

        if (untranscribedIds.length > 0) {
            this._phase = 'transcribing';
            this._statusText = `Transcribing ${untranscribedIds.length} audio sample${untranscribedIds.length > 1 ? 's' : ''}...`;
            this.requestUpdate();

            for (let i = 0; i < untranscribedIds.length; i++) {
                const promptId = untranscribedIds[i];
                const blob = this._promptAudioBlobs[promptId];
                const promptObj = CALIBRATION_PROMPTS.find(p => p.id === promptId);

                this._statusText = `Transcribing sample ${i + 1} of ${untranscribedIds.length}...`;
                this.requestUpdate();

                try {
                    const text = await this._transcribeAudio(blob);
                    if (text && text.trim()) {
                        this._transcripts = [...this._transcripts, { promptId, prompt: promptObj?.prompt || '', text: text.trim() }];
                        console.log(`CalibrationView: transcribed "${promptId}": ${text.substring(0, 80)}...`);
                    }
                } catch (err) {
                    console.error(`CalibrationView: failed to transcribe prompt "${promptId}":`, err);
                }
            }
        }

        if (this._transcripts.length < 2) {
            console.warn('CalibrationView: not enough samples after transcription');
            this.onSkip();
            return;
        }

        // Phase 2: analyze voice profile
        this._phase = 'analyzing';
        this._statusText = '';
        this.requestUpdate();

        try {
            const voiceProfile = await this._buildVoiceProfile(this._transcripts);
            this._phase = 'complete';
            this.requestUpdate();
            setTimeout(() => this.onComplete(voiceProfile), 1500);
        } catch (error) {
            console.error('Error building voice profile:', error);
            this.onComplete(null);
        }
    }

    /**
     * Transcribes an audio Blob to text.
     * Tries: 1) Groq Whisper  2) Azure Speech REST  3) returns empty
     */
    async _transcribeAudio(audioBlob) {
        const accessToken = (await hintio.storage.getAccessToken().catch(() => '')) || '';
        if (!accessToken.trim()) {
            throw new Error('Missing access token for calibration transcription');
        }

        const ipcRenderer = window.electronAPI;
        const audioBase64 = await this._blobToBase64(audioBlob);
        const result = await ipcRenderer.invoke('auth:calibration-transcribe', {
            accessToken: accessToken.trim(),
            audioBase64,
            mimeType: audioBlob.type || 'audio/webm;codecs=opus',
            language: this.language || 'en-US',
        });

        if (!result?.success) {
            throw new Error(result?.error || 'Calibration transcription failed');
        }

        return (result.text || '').trim();
    }

    async _transcribeWithGroqWhisper(audioBlob, apiKey) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', (this.language || 'en-US').split('-')[0]); // 'en'
        formData.append('response_format', 'text');

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Groq Whisper ${response.status}: ${errText}`);
        }

        return await response.text();
    }

    async _transcribeWithAzureSpeech(audioBlob, apiKey, endpoint) {
        // Extract region from endpoint e.g. https://foo-eastus2.cognitiveservices.azure.com
        const match = endpoint.match(/[a-z0-9-]+\.(\w+)\.cognitiveservices\.azure\.com/i);
        const region = match ? match[1] : null;
        if (!region) throw new Error('Cannot extract region from Azure endpoint');

        const language = this.language || 'en-US';
        const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}&format=simple`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': apiKey,
                'Content-Type': audioBlob.type || 'audio/webm;codecs=opus',
            },
            body: audioBlob,
        });

        if (!response.ok) throw new Error(`Azure Speech ${response.status}`);
        const data = await response.json();
        return data.DisplayText || data.NBest?.[0]?.Display || '';
    }

    // ============ VOICE PROFILE ANALYSIS (multi-provider) ============

    async _buildVoiceProfile(transcripts) {
        if (!transcripts || transcripts.length === 0) return null;

        const samplesText = transcripts.map((t, i) => `--- Sample ${i + 1} (prompt: "${t.prompt}") ---\n${t.text}`).join('\n\n');

        const analysisPrompt = `You are a speech pattern analyst. Below are real speech samples from a person.
Your job is to extract ONLY patterns that are GENUINELY and REPEATEDLY present in their speech.

CRITICAL RULES:
1. ONLY include patterns you can directly evidence from the samples below.
2. If a pattern appears only once, do NOT include it — it must appear across multiple samples.
3. NEVER fabricate, assume, or add patterns that were not explicitly observed.
4. If the person speaks cleanly without filler words, say so — do NOT add filler words.
5. If the person uses formal language, reflect that — do NOT make them casual.
6. Be conservative: when in doubt, leave it out.

Analyze these samples and output a JSON object with these fields (leave any field as null if not enough evidence):

{
  "sentenceStarters": ["array of phrases they commonly start answers with — ONLY if observed multiple times"],
  "fillerWords": ["filler words they actually use — ONLY if observed, leave empty array if none"],
  "transitionPhrases": ["phrases they use to connect ideas — ONLY if observed"],
  "vocabularyPreferences": {"formal_word": "their_casual_equivalent — ONLY mappings backed by evidence"},
  "sentenceStyle": "short_fragments | complete_sentences | mixed — describe what you actually see",
  "formality": "casual | neutral | formal — based on evidence",
  "contractions": true or false,
  "endingPatterns": ["how they tend to end sentences — ONLY if observed"],
  "uniqueTraits": ["any other distinctive speech habits you ACTUALLY observed"],
  "confidence": "low | medium | high — how much data did you have to work with?"
}

SAMPLES:
${samplesText}

Respond with ONLY the JSON object, no explanation.`;

        // Try providers in order: Gemini → Groq
        const profile = await this._callLLMForAnalysis(analysisPrompt);
        if (!profile) return null;

        // Validate
        if (profile.fillerWords && !Array.isArray(profile.fillerWords)) profile.fillerWords = [];
        if (profile.sentenceStarters && !Array.isArray(profile.sentenceStarters)) profile.sentenceStarters = [];

        return {
            ...profile,
            createdAt: Date.now(),
            sampleCount: transcripts.length,
            calibrationDuration: this._elapsedSeconds,
        };
    }

    async _callLLMForAnalysis(prompt) {
        const accessToken = (await hintio.storage.getAccessToken().catch(() => '')) || '';
        if (!accessToken.trim()) {
            throw new Error('Missing access token for calibration analysis');
        }

        const ipcRenderer = window.electronAPI;
        const result = await ipcRenderer.invoke('auth:calibration-analyze', {
            accessToken: accessToken.trim(),
            prompt,
        });

        if (!result?.success) {
            throw new Error(result?.error || 'Calibration analysis failed');
        }

        return result.profile || null;
    }

    async _blobToBase64(blob) {
        const buffer = await blob.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    async _analyzeWithGemini(prompt, apiKey, model) {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model || 'gemini-3.7-flash',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a speech pattern analyst. Respond only with valid JSON.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.1,
                max_tokens: 2048,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        return this._extractJSON(text);
    }

    async _analyzeWithGroq(prompt, apiKey) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a speech pattern analyst. Respond only with valid JSON.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.1,
                max_tokens: 2048,
            }),
        });

        if (!response.ok) throw new Error(`Groq ${response.status}`);
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        return this._extractJSON(text);
    }

    _extractJSON(text) {
        if (!text) return null;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.error('CalibrationView: failed to parse JSON from LLM response:', e);
            return null;
        }
    }

    // ============ UI TOGGLE ============

    _toggleInputMode() {
        this._useTypedInput = !this._useTypedInput;
        if (this._useTypedInput) {
            this._stopRecordingPrompt();
        } else {
            this._micError = null;
            if (!this._micStream) {
                this._startMicCapture();
            } else {
                this._startRecordingPrompt();
            }
        }
        this.requestUpdate();
    }

    // ============ RENDER ============

    render() {
        if (this._phase === 'transcribing') {
            return this._renderTranscribing();
        }
        if (this._phase === 'analyzing') {
            return this._renderAnalyzing();
        }
        if (this._phase === 'complete') {
            return this._renderComplete();
        }
        return this._renderCalibrating();
    }

    _renderCalibrating() {
        const prompt = CALIBRATION_PROMPTS[this._currentPromptIndex];
        const progress = this._getProgressPercent();
        const remaining = Math.max(0, TOTAL_CALIBRATION_SECONDS - this._elapsedSeconds);
        const isLast = this._currentPromptIndex === CALIBRATION_PROMPTS.length - 1;
        const audioCount = Object.keys(this._promptAudioBlobs).length;
        const textCount = this._transcripts.filter(t => !this._promptAudioBlobs[t.promptId]).length;
        const samplesCollected = audioCount + textCount;

        return html`
            <div class="calibration-page">
                <div class="calibration-header">
                    <div class="calibration-title">Train Your Voice</div>
                    <div class="calibration-subtitle">
                        Answer these prompts naturally. We'll analyze how you speak and make AI answers sound like you — not generic AI text.
                    </div>
                </div>

                <!-- Timer -->
                <div class="timer-bar">
                    <div class="timer-track">
                        <div class="timer-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="timer-text">${this._formatTime(remaining)}</div>
                </div>

                <!-- Prompt -->
                <div class="prompt-card">
                    <div class="prompt-number">Prompt ${this._currentPromptIndex + 1} of ${CALIBRATION_PROMPTS.length}</div>
                    <div class="prompt-text">${prompt.prompt}</div>
                    <div class="prompt-hint">${prompt.hint}</div>
                </div>

                <!-- Audio level meter (when recording) -->
                ${
                    !this._useTypedInput
                        ? html`
                              <div class="audio-meter">
                                  <span class="audio-meter-label">${this._isRecording ? 'MIC' : '...'}</span>
                                  <div class="audio-meter-track">
                                      <div class="audio-meter-fill" style="width: ${this._audioLevel}%"></div>
                                  </div>
                              </div>
                          `
                        : ''
                }

                <!-- Recording status / error -->
                ${
                    this._isRecording
                        ? html`<div class="recording-indicator">
                              <div class="recording-dot"></div>
                              Recording — speak naturally, your audio is being captured
                          </div>`
                        : this._micError
                          ? html`<div class="error-text">${this._micError}</div>`
                          : this._statusText
                            ? html`<div class="status-text">${this._statusText}</div>`
                            : ''
                }

                <!-- Input area -->
                ${
                    this._useTypedInput
                        ? html`
                              <textarea
                                  class="typed-input"
                                  placeholder="Type how you'd naturally say this out loud..."
                                  .value=${this._typedText}
                                  @input=${e => {
                                      this._typedText = e.target.value;
                                  }}
                              ></textarea>
                          `
                        : html`
                              <div class="transcript-preview">
                                  ${
                                      this._currentTranscript
                                          ? this._currentTranscript
                                          : html`<span class="transcript-placeholder">
                                                ${
                                                    this._isRecording
                                                        ? 'Your audio is being recorded. Speak now — transcription happens when you click Next.'
                                                        : this._micError
                                                          ? 'Mic unavailable. Use the type option below.'
                                                          : 'Waiting for microphone...'
                                                }
                                            </span>`
                                  }
                              </div>
                          `
                }

                <button class="mode-toggle" @click=${() => this._toggleInputMode()}>
                    ${this._useTypedInput ? 'Switch to voice input' : "Can't use mic? Type instead"}
                </button>

                ${
                    samplesCollected > 0
                        ? html`<div class="samples-count">${samplesCollected} sample${samplesCollected !== 1 ? 's' : ''} recorded</div>`
                        : ''
                }

                <!-- Navigation -->
                <div class="calibration-actions">
                    ${this._currentPromptIndex > 0 ? html`<button class="cal-btn" @click=${() => this._handlePrev()}>Back</button>` : ''}
                    <button class="cal-btn primary" @click=${() => this._handleNext()}>${isLast ? 'Finish & Analyze' : 'Next Prompt'}</button>
                </div>

                <div class="calibration-actions">
                    ${
                        samplesCollected >= 2
                            ? html`<button class="cal-btn skip" @click=${() => this._handleFinishEarly()}>
                                  Done early? Analyze ${samplesCollected} samples
                              </button>`
                            : ''
                    }
                    <button class="cal-btn skip" @click=${() => this.onSkip()}>Skip calibration</button>
                </div>
            </div>
        `;
    }

    _renderTranscribing() {
        return html`
            <div class="calibration-page">
                <div class="completion-card">
                    <div class="analyzing-spinner"></div>
                    <div class="completion-title">Transcribing your audio...</div>
                    <div class="completion-subtitle">${this._statusText || 'Converting your speech to text...'}</div>
                </div>
            </div>
        `;
    }

    _renderAnalyzing() {
        return html`
            <div class="calibration-page">
                <div class="completion-card">
                    <div class="analyzing-spinner"></div>
                    <div class="completion-title">Analyzing your speech patterns...</div>
                    <div class="completion-subtitle">
                        Extracting only genuinely observed patterns from your ${this._transcripts.length} samples. Nothing will be fabricated.
                    </div>
                </div>
            </div>
        `;
    }

    _renderComplete() {
        return html`
            <div class="calibration-page">
                <div class="completion-card">
                    <div class="completion-icon">&#10003;</div>
                    <div class="completion-title">Voice profile ready</div>
                    <div class="completion-subtitle">AI answers will now match your natural speaking style. Starting session...</div>
                </div>
            </div>
        `;
    }
}

customElements.define('calibration-view', CalibrationView);
