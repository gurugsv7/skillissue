# Hintio

> Real-time AI assistance during interviews, meetings, and presentations — invisible overlay, powered by your choice of AI.

Hintio is an Electron desktop app that captures your screen and audio to deliver contextual, ready-to-speak AI responses in real time. It sits as a transparent, always-on-top overlay that you can reposition and hide instantly.

> [!NOTE]
> Use the latest macOS or Windows version. Older OS versions have limited support.

---

## Features

### AI Provider Modes

- **BYOK (Bring Your Own Key)** — Connect Gemini (Google AI Studio) or Groq with your own API keys. No data leaves your control.
- **Local AI** — Fully offline inference via [Ollama](https://ollama.com) (any model) with on-device speech-to-text via Whisper. No internet required after setup.
- **OpenAI (primary)** — Answers, screen analysis and calibration run on `gpt-5.6-luna` by default. Measured ~1.0s to first token on a live interview turn.
- **Gemini (automatic fallback)** — If OpenAI is rate limited or down, the app fails over to Google AI Studio's free Flash models with no user action. Both providers speak the same wire format, so nothing else changes.

### Session Profiles

Seven pre-built prompt profiles, each tuned for the context:

- **Job Interview** — Ready-to-speak answers for an interview in any field. The answer shape follows the question that was actually asked: three pointers for a concept, STAR for "tell me about a time", clarify/design/bottleneck/tradeoff for a design question, a direct line plus flexibility for salary. Set **Interview Domain** in setup so terminology locks to your field.
- **Technical Interview** — The same, tuned for technical depth in whichever engineering field your context establishes — backend, mobile, data, ML, infra, security, embedded, hardware
- **Sales Call** — Real-time objection handling and pitch support
- **Business Meeting** — Clear, professional spoken responses
- **Presentation** — Confident, engaging presenter script
- **Negotiation** — Tactical, composed negotiation language
- **Exam Assistant** — Step-by-step problem solving and explanations

### Capture & Analysis

- **Continuous audio capture** — Speaker (interviewer), microphone (you), both, or none
- **Automatic screenshot analysis** — Periodic screen captures feed visual context to the AI
- **Manual screen analysis** — Analyse the current screen on demand to extract answers, code solutions, or context
- **Voice calibration** — Optional pre-session voice profiling so the AI learns your speech patterns

### Context Engine

- **Resume upload** — Import a PDF or DOCX resume; text is silently injected into the AI context at session start without cluttering the UI
- **Custom instructions** — Add job descriptions, company details, or extra constraints for the AI
- **30+ languages** — Speech recognition covers English (US/UK/AU/IN), German, French, Spanish, Hindi, Japanese, Chinese, Arabic, and more

### Overlay & UX

- **Transparent overlay** — Always-on-top window with configurable background opacity
- **Click-through mode** — Window becomes mouse-transparent so it never interferes with underlying apps
- **Keyboard-only control** — Full window management without touching the mouse
- **Response history** — Navigate back and forward through previous AI responses
- **Theme system** — Dark mode with configurable accent colours
- **Futuristic UI** — Cyan-on-dark aesthetic with monospace typography

---

## Setup

```bash
npm install
npm start
```

## Windows Build & Distribution

Use release artifacts, not a single copied `.exe` file.

```bash
npm run make:win
```

This command builds Windows artifacts and verifies bundled runtime files (`ffmpeg.dll`, VC++ runtime DLLs, and ONNX runtime binaries).

Share one of these outputs:
- `out/make/squirrel.windows/x64/*.exe` (installer)
- `out/make/zip/win32/x64/*.zip` (portable bundle)

Do not share only `out/Hintio-win32-x64/Hintio.exe` by itself.

Optional: if you want to ship extra Windows prerequisites in-app (for support/troubleshooting), place them under `build/windows/` before packaging. The folder is included in packaged resources when present.

## Clean-Machine Test (Windows Sandbox)

1. Enable **Windows Sandbox** in Windows Features.
2. Build using `npm run make:win`.
3. Copy installer (`squirrel.windows`) or portable zip into Sandbox.
4. Install/run and confirm app launches with no missing DLL errors.
5. If a dependency error appears, capture the exact message and filename (e.g. `VCRUNTIME140.dll`, `ffmpeg.dll`) for targeted fixes.

For **BYOK** mode, you need **one** of the following — not all:
- **Gemini** — get a free key at [Google AI Studio](https://aistudio.google.com/apikey). You can supply **several keys separated by commas**: each free-tier key allows ~10 requests/minute, so keys from separate Google accounts raise the ceiling. Requests are spread across them, and a rate-limited key fails over to the next one immediately.
- **Groq** — get a key at [console.groq.com](https://console.groq.com)
- **Groq (speech-to-text)** — a Groq key is still used for Whisper transcription during live sessions

For **Local AI** mode, install [Ollama](https://ollama.com) and pull any model (e.g. `ollama pull llama3.2`). Whisper is downloaded automatically on first session start.

---

## Usage

1. Launch the app with `npm start`
2. Select your AI provider mode on the start screen
3. Enter your API key (BYOK / Groq) or confirm Ollama is running (Local AI)
4. Go to **AI Context** to upload your resume and add custom instructions
5. Go to **Settings** to pick a profile, language, and audio mode
6. Click **Start Session**
7. The overlay appears — position it with keyboard shortcuts and let the AI respond in real time

---

## Keyboard Shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| Move window | `Opt + Arrow Keys` | `Ctrl + Arrow Keys` |
| Toggle click-through | `Cmd + M` | `Ctrl + M` |
| Toggle visibility | `Cmd + \` | `Ctrl + \` |
| Previous response | `Cmd + [` | `Ctrl + [` |
| Next response | `Cmd + ]` | `Ctrl + ]` |
| Scroll response up | `Cmd + Shift + Up` | `Ctrl + Shift + Up` |
| Scroll response down | `Cmd + Shift + Down` | `Ctrl + Shift + Down` |
| Send text message | `Enter` | `Enter` |
| Ask next step | `Cmd + Enter` | `Ctrl + Enter` |

All shortcuts are fully rebindable in **Settings → Keyboard Shortcuts**.

---

## Audio Capture

| Platform | Method |
|---|---|
| macOS | [SystemAudioDump](https://github.com/Mohammed-Yasin-Mulla/Sound) for system audio |
| Windows | Loopback audio capture |
| Linux | Microphone input |

**Audio modes**: Speaker Only · Mic Only · Both · None (screenshots only)

---

## Requirements

- macOS, Windows, or Linux (macOS and Windows recommended)
- Node.js / npm for development
- Screen recording permission
- Microphone permission (if using mic capture)
- API key **or** a local Ollama installation

---

## License

GPL-3.0 — see [LICENSE](LICENSE).
