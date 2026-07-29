// Speech-to-text via Groq Whisper API

let onTranscriptCallback = null;
let isStarted = false;
let groqApiKey = null;
let language = 'en-US';

// Accumulated 16kHz mono 16-bit PCM
let pcmBuffer = Buffer.alloc(0);
let silenceTimer = null;
let hasSpeech = false;
let speechStartedAt = 0;
let speechChunkCount = 0;

const SILENCE_TIMEOUT_MS = 800; // flush 800ms after speech ends
const MIN_AUDIO_BYTES = 16000 * 2 * 0.4; // 400ms minimum before sending
const MAX_AUDIO_BYTES = 16000 * 2 * 30; // 30s hard cap
const SILENCE_RMS_THRESHOLD = 250; // RMS below this = silence

function computeRMS(buf) {
    const samples = Math.floor(buf.length / 2);
    if (samples === 0) return 0;

    let sum = 0;
    for (let i = 0; i < samples; i++) {
        const s = buf.readInt16LE(i * 2);
        sum += s * s;
    }

    return Math.sqrt(sum / samples);
}

function buildWav(pcm) {
    const header = Buffer.alloc(44);
    const dataSize = pcm.length;
    header.write('RIFF', 0);
    header.writeUInt32LE(dataSize + 36, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(16000, 24); // sample rate
    header.writeUInt32LE(32000, 28); // byte rate (16000 * 1 * 2)
    header.writeUInt16LE(2, 32); // block align
    header.writeUInt16LE(16, 34); // bits per sample
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcm]);
}

async function flushAndTranscribe() {
    const toTranscribe = pcmBuffer;
    pcmBuffer = Buffer.alloc(0);
    hasSpeech = false;

    const startedAt = speechStartedAt;
    const chunkCount = speechChunkCount;
    speechStartedAt = 0;
    speechChunkCount = 0;

    if (toTranscribe.length < MIN_AUDIO_BYTES) return;

    const approxAudioMs = Math.round((toTranscribe.length / 32000) * 1000);
    const captureMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
    console.log(`[GroqSTT][Flush] audioMs=${approxAudioMs} captureMs=${captureMs} bytes=${toTranscribe.length} chunks=${chunkCount}`);

    try {
        const wavBuffer = buildWav(toTranscribe);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        const formData = new FormData();
        formData.append('file', blob, 'audio.wav');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', language.split('-')[0]); // 'en' from 'en-US'
        formData.append('response_format', 'text');

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${groqApiKey}` },
            body: formData,
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`${response.status} ${errText}`);
        }

        const text = (await response.text()).trim();
        if (text && onTranscriptCallback) {
            console.log('[GroqSTT] Transcribed:', text.substring(0, 100));
            onTranscriptCallback(text);
        }
    } catch (err) {
        console.error('[GroqSTT] Transcription error:', err.message);
    }
}

// Downsample 24kHz PCM Buffer -> 16kHz PCM Buffer
function resample24to16(buf) {
    const inSamples = buf.length / 2;
    const outSamples = Math.floor((inSamples * 16000) / 24000);
    const out = Buffer.alloc(outSamples * 2);
    for (let i = 0; i < outSamples; i++) {
        const srcIdx = Math.min(Math.round((i * 24000) / 16000), inSamples - 1);
        out.writeInt16LE(buf.readInt16LE(srcIdx * 2), i * 2);
    }
    return out;
}

function startSpeechSTT(apiKey, lang, onTranscript) {
    if (isStarted) stopSpeechSTT();

    if (!apiKey || apiKey.trim() === '') {
        console.error('[GroqSTT] Cannot start - Groq API key is empty');
        return;
    }

    groqApiKey = apiKey;
    language = lang || 'en-US';
    onTranscriptCallback = onTranscript;
    pcmBuffer = Buffer.alloc(0);
    hasSpeech = false;
    speechStartedAt = 0;
    speechChunkCount = 0;
    isStarted = true;
    console.log('[GroqSTT] Started - Groq Whisper STT, language:', language);
}

function pushAudio(base64PcmData) {
    if (!isStarted) return;

    try {
        const raw = Buffer.from(base64PcmData, 'base64');
        const resampled = resample24to16(raw);
        const rms = computeRMS(resampled);
        const isSilence = rms < SILENCE_RMS_THRESHOLD;

        if (!isSilence) {
            hasSpeech = true;
            if (!speechStartedAt) {
                speechStartedAt = Date.now();
                speechChunkCount = 0;
                console.log('[GroqSTT] Speech detected');
            }
            speechChunkCount++;

            // Clear pending silence flush - speech continues
            if (silenceTimer) {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }

            pcmBuffer = Buffer.concat([pcmBuffer, resampled]);

            // Cap buffer to avoid unbounded growth
            if (pcmBuffer.length > MAX_AUDIO_BYTES) {
                pcmBuffer = pcmBuffer.slice(pcmBuffer.length - MAX_AUDIO_BYTES);
            }
        } else if (hasSpeech) {
            // Silence detected after speech - schedule a flush
            if (!silenceTimer) {
                silenceTimer = setTimeout(() => {
                    silenceTimer = null;
                    flushAndTranscribe();
                }, SILENCE_TIMEOUT_MS);
            }
        }
    } catch (err) {
        console.error('[SpeechSTT] Push error:', err.message);
    }
}

function stopSpeechSTT() {
    if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
    }

    if (hasSpeech && pcmBuffer.length >= MIN_AUDIO_BYTES) {
        flushAndTranscribe();
    }

    pcmBuffer = Buffer.alloc(0);
    hasSpeech = false;
    speechStartedAt = 0;
    speechChunkCount = 0;
    isStarted = false;
    onTranscriptCallback = null;
    console.log('[GroqSTT] Stopped');
}

function isSpeechSTTActive() {
    return isStarted;
}

module.exports = { startSpeechSTT, pushAudio, stopSpeechSTT, isSpeechSTTActive };
