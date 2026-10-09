# Product Requirements Document — Hintio (Implementation-Accurate)

## 1) Product Summary

Hintio is an Electron desktop overlay assistant for high-stakes conversations and coding rounds (interviews, meetings, presentations, negotiation, exams). It captures live context from system audio + screen, transcribes user input, generates speak-ready responses, and maintains local session history.

This PRD reflects the **current shipped behavior in the codebase** (v0.7.0), including provider modes, overlays, shortcuts, post-answer code self-heal, calibration/voice training, storage, Supabase secret resolution, and packaging.

---

## 2) Goals and Non-Goals

### Goals
- Deliver real-time assistive responses with low interaction friction.
- Support multiple AI backends (Cloud, Gemini free tier, Groq, Local/Ollama).
- Keep user context persistent across sessions (profiles, prompts, resume text, keybinds, history).
- Provide coding-answer quality guardrail via a delayed verification pass.
- Enable stealth overlay operation with keyboard-first control.

### Non-Goals (Current Version)
- No full code execution/sandbox or compiler-backed validation.
- No complete SA Round Simulator UI/workflow yet.
- No speaker diarization pipeline in production.
- No strict TypeScript migration yet (current app is JavaScript).

---

## 3) Target Users

- Students preparing for interviews/exams.
- Professionals in sales, meetings, and presentations needing live phrasing support.
- Users who prefer keyboard-driven overlays and low-friction context injection.

---

## 4) End-to-End User Experience

## 4.1 First Launch + Onboarding
- App loads onboarding if `config.onboarded` is false.
- Onboarding collects initial custom context and saves it to preferences.
- User enters access token in Home view to start cloud/managed flows (or configures BYOK/local in settings).

## 4.2 Session Start
- User chooses profile (`interview`, `sales`, `meeting`, `presentation`, `negotiation`, `exam`).
- If no voice profile exists and skip flag is false, calibration is shown before session.
- On success, capture starts and app enters live assistant mode.

## 4.3 Live Assistance Loop
- System audio + transcript context are streamed to selected provider.
- AI responses stream into Assistant view.
- Responses are persisted into session history (conversation + screen analysis tracks).
- User navigates multiple responses and sends follow-up text prompts.

## 4.4 Post-Answer Coding Self-Heal
- If content appears coding-related, a delayed verification pass runs after draft response generation.
- Current implementation delay is ~1 second (`setTimeout(..., 1000)`), then candidate response is re-checked/fixed via Groq/Gemini verifier when available.
- Updated response replaces the latest assistant output if improved.

## 4.5 Session End
- Ending session stops capture/transcription and clears runtime provider secrets.
- Session data remains in local history unless explicitly deleted by user.

---

## 5) Functional Requirements (Implemented)

### FR-1: Overlay Window and Modes
- Frameless, keyboard-controllable Electron window.
- Stealth mode behavior (transparent, always-on-top, visibility toggle, click-through toggle).
- Reposition support (dock left/right/default and layout hint-based reposition).

### FR-2: Multi-Provider Runtime
- Provider modes: Cloud, BYOK, Local.
- Backends: OpenAI (primary), Gemini (fallback), cloud websocket, Groq, Ollama local. OpenAI and Gemini share one provider layer.
- Provider secret resolution flow for cloud token usage.

### FR-3: Audio + Screen Context Ingestion
- System audio capture via `getDisplayMedia` and platform handlers.
- Configurable screenshot interval and image quality.
- Screen analysis events persisted per session.

### FR-4: Prompt Profiles + Context Injection
- Built-in profile prompts in `prompts.js`.
- Custom prompt override.
- Resume/document text ingestion and persistence.

### FR-5: Calibration / Voice Training
- Multi-prompt calibration flow.
- Live mic level visualization and transcription capture.
- Voice profile observations saved for later personalization.

### FR-6: History Management
- Session list, detail view, search/filter, export, and delete workflows.
- Conversation turns and screen-analysis tracks stored/retrieved.

### FR-7: Keyboard Shortcuts
- Move window: `Ctrl+Arrow` (or `Alt+Arrow` on macOS).
- Toggle visibility: `Ctrl+\\`.
- Toggle click-through: `Ctrl+M`.
- Next step: `Ctrl+Enter`.
- Response nav: `Ctrl+[` and `Ctrl+]`.
- Response scroll: `Ctrl+Shift+Up/Down`.
- Docking: `Ctrl+Shift+R/Q/T`.
- Emergency erase: `Ctrl+Shift+X`.

### FR-8: Settings and Personalization
- Theme selection and background transparency.
- Font size control.
- Google search toggle.
- Keybind remapping and persistence.

### FR-9: Security-Oriented Secret Handling
- Cloud access token resolved server-side to provider secrets.
- Runtime in-memory secret cache for session operations.
- Runtime secret cleanup on quit/session end.

---

## 6) UI Surface Inventory

### Main Navigation Views
- Home (`MainView`) — token entry + session start.
- AI Context (`AICustomizeView`) — profile prompt customization + resume context.
- History (`HistoryView`) — session browser and transcript inspection.
- Settings (`CustomizeView`) — providers, capture options, keybinds, themes.
- Feedback (`FeedbackView`) — user feedback form + version context.
- Help (`HelpView`) — shortcut/help links.
- Onboarding (`OnboardingView`) — first-run context wizard.
- Calibration (`CalibrationView`) — voice profile training flow.
- Assistant (`AssistantView`) — live response area.

---

## 7) Architecture and Data Flow

## 7.1 Main Process
- File: `src/index.js`
- Responsibilities:
   - Window creation + app lifecycle.
   - IPC registration (storage, provider init, capture controls, file parsing, versioning, external links).
   - Auto-update integration (if configured).

## 7.2 Window and Shortcut Layer
- File: `src/utils/window.js`
- Responsibilities:
   - `BrowserWindow` creation and layout behavior.
   - Global shortcut registration.
   - View-based resize/reposition handlers.
   - Click-through and hide/show handling.

## 7.3 Renderer Orchestration
- File: `src/utils/renderer.js`
- Responsibilities:
   - Consolidated global API object on `window.hintio`.
   - Provider initialization bridges and capture calls.
   - State/status updates routed into root component.
   - Theme and preference application.

## 7.4 Provider Runtime Core
- File: `src/utils/providerRuntime.js`
- Responsibilities:
   - Session orchestration and provider-mode switching.
   - Message/response streaming.
   - Screen-analysis and conversation persistence hooks.
   - Coding prompt detection + delayed self-heal verification pass.
   - Runtime secret resolution/caching behavior.

## 7.5 Provider-Specific Modules
- `src/utils/cloud.js` — websocket cloud transport.
- `src/utils/speechStt.js` — Whisper/Groq STT path.
- `src/utils/azureStt.js` — Azure speech recognition path.
- `src/utils/llmProvider.js` — provider registry (OpenAI, Gemini) and the request path: key failover -> model fallback -> provider fallback.
- `src/utils/llmKeyPool.js` — per-key rate-window tracking with proactive spreading and instant 429 failover.
- `src/utils/interviewProfiles.js` — domain-agnostic interview support: question-type classification, per-type answer shapes, and the live prompt builder. Interview subject matter comes from the user's `interviewDomain` preference, never from hardcoded field assumptions.
- `src/utils/localai.js` — Ollama + local model support.

## 7.6 Storage Layer
- File: `src/storage.js`
- Stores:
   - Config, credentials, preferences, keybinds, limits, voice profile, history.
   - OS-specific config directory under `hintio-config`.

---

## 8) Persistence and Data Model

### Local Files (OS Config Dir)
- `config.json`
- `credentials.json`
- `preferences.json`
- `keybinds.json`
- `limits.json`
- `voice-profile.json`
- `history/*.json`

### Browser/Renderer Storage
- Indexed/session state used for rendering and quick retrieval flows.

### Session Data
- Session metadata + ordered conversation turns.
- Screen analysis snapshots/results.

---

## 9) Security and Privacy Behavior (Current)

- Cloud token path resolves provider secrets via Supabase edge function.
- RLS-backed token/secret enforcement exists in Supabase project assets.
- Runtime provider secrets are cleared on session end/quit paths.
- Web security is enabled in `BrowserWindow` options.

Known security gap:
- Context isolation is currently disabled in Electron (`contextIsolation: false`), marked as TODO.

---

## 10) Build and Distribution Requirements

### Tooling
- Electron Forge packaging/make workflows.
- Windows Squirrel installer + zip outputs.

### Naming
- Product/package branding is `Hintio`.
- Windows metadata and executable naming are `Hintio`.

### Verification
- `scripts/verify-windows-package.js` checks:
   - `Hintio.exe`
   - runtime DLL presence (`ffmpeg.dll`, `d3dcompiler_47.dll`)
   - ONNX runtime native artifacts under unpacked ASAR.

### Known Runtime Note
- VC++ redistributable DLLs may be absent on clean machines and require separate runtime install.

---

## 11) Supabase / Cloud Backend Scope

### Implemented in Repository
- Edge function: `supabase/functions/resolve-provider-secrets/index.ts`.
- Migrations for access token handling, quota, RLS hardening, subscriptions and premium-question schema.

### App Usage
- Client uses secret-resolution flow for cloud mode.
- Premium schema/RLS assets exist; full premium interview-questions product surface is not yet complete in UI.

---

## 12) Observability and Operational Notes

- Console logging for provider/session events and shortcut registration.
- Status updates surfaced in UI (`Listening`, `Live`, errors).
- Optional debug audio dump utilities exist.

---

## 13) Known Gaps / Not Yet Implemented

- Full SA Round Simulator product flow/UI and scoring surfaces.
- Full dual-stream diarization pipeline (speaker-separated streams) in production UI.
- Automated test suite (unit/integration/e2e) is not yet present.
- TypeScript strict-mode migration has not been completed.
- Context isolation hardening remains pending.

---

## 14) Acceptance Criteria for “Current Product”

The current codebase is considered feature-complete for v0.7.0 when:
- App launches and navigates all listed views.
- Session can start in configured provider mode and produce responses.
- Shortcuts function as mapped.
- Coding responses trigger delayed self-heal path when coding signals are detected.
- Voice calibration can run and persist a profile.
- Session history can be viewed and managed.
- Windows builds output Hintio-branded artifacts and pass package verification.

---

## 15) Future Requirements Backlog (Post-v0.7.0)

- Convert post-answer code verification delay to configurable value (e.g., 1s/3s/5s).
- Add SA Round Simulator UI + report-card workflow.
- Complete context isolation + preload-only API bridge.
- Add automated test infrastructure.
- Expand premium content delivery UI for premium-question schema already present in backend.
