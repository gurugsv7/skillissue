// Speech-to-text via Groq Whisper API

let onTranscriptCallback = null;
let isStarted = false;
let groqApiKey = null;
let language = 'en-US';

// Accumulated 16kHz mono 16-bit PCM, kept as chunks and joined once at flush.
// Concatenating on every 100ms chunk was an O(n^2) copy on the main thread.
let pcmChunks = [];
let pcmLength = 0;
let silenceTimer = null;
let maxUtteranceTimer = null;
let hasSpeech = false;
let speechStartedAt = 0;
let speechChunkCount = 0;
let nextTranscriptSeq = 0;
let lastEmittedSeq = -1;

// Dead wait between the interviewer going quiet and the audio leaving the
// machine. Every millisecond here is pure added latency, so it is tuned as low
// as Whisper tolerates without clipping the end of a sentence.
const SILENCE_TIMEOUT_MS = 350;

// Someone three seconds into a long, multi-part question pauses to think, and a
// 350ms tolerance cuts them off mid-question — the transcript splits and the
// candidate gets two separate answers for one thing that was asked. Past this
// point, wait longer before deciding they have finished.
const LONG_UTTERANCE_MS = 2500;
const SILENCE_TIMEOUT_LONG_MS = 900;

const MIN_AUDIO_BYTES = 16000 * 2 * 0.2; // 200ms — "Why?" and "Big-O?" are real questions
const MAX_AUDIO_BYTES = 16000 * 2 * 30; // 30s hard cap on buffered audio

// A long question must still be sent even if silence is never detected, which
// is what happens in a room with constant background noise.
const MAX_UTTERANCE_MS = 15_000;

// Starting point for the silence threshold. It is replaced by a measured noise
// floor once calibration has enough samples — a fixed value fails completely in
// a noisy room, where RMS never drops below it and nothing is ever flushed.
const DEFAULT_SILENCE_RMS_THRESHOLD = 250;
const NOISE_FLOOR_SAMPLES = 20; // ~2s at 100ms chunks
const NOISE_FLOOR_MULTIPLIER = 2.5;
const MIN_SILENCE_RMS_THRESHOLD = 120;
const MAX_SILENCE_RMS_THRESHOLD = 4000;

let silenceThreshold = DEFAULT_SILENCE_RMS_THRESHOLD;
let noiseFloorSamples = [];
let noiseFloorLocked = false;

const STT_TIMEOUT_MS = 15_000;

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

function clearFlushTimers() {
    if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
    }
    if (maxUtteranceTimer) {
        clearTimeout(maxUtteranceTimer);
        maxUtteranceTimer = null;
    }
}

async function flushAndTranscribe() {
    clearFlushTimers();

    const toTranscribe = pcmChunks.length === 1 ? pcmChunks[0] : Buffer.concat(pcmChunks, pcmLength);
    pcmChunks = [];
    pcmLength = 0;
    hasSpeech = false;

    const startedAt = speechStartedAt;
    const chunkCount = speechChunkCount;
    const transcriptCallback = onTranscriptCallback;
    const requestApiKey = groqApiKey;
    const requestLanguage = language;
    speechStartedAt = 0;
    speechChunkCount = 0;

    if (toTranscribe.length < MIN_AUDIO_BYTES) return;

    const approxAudioMs = Math.round((toTranscribe.length / 32000) * 1000);
    const captureMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
    const seq = nextTranscriptSeq++;
    console.log(`[GroqSTT][Flush] seq=${seq} audioMs=${approxAudioMs} captureMs=${captureMs} bytes=${toTranscribe.length} chunks=${chunkCount}`);

    // Transcriptions run independently rather than chained. Serializing them
    // meant one slow Groq call stalled the next question's transcription
    // entirely; the sequence number keeps a late reply from overwriting a
    // newer one.
    try {
        const wavBuffer = buildWav(toTranscribe);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        const formData = new FormData();
        formData.append('file', blob, 'audio.wav');
        formData.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo');
        formData.append('language', requestLanguage.split('-')[0]); // 'en' from 'en-US'
        formData.append('response_format', 'text');

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${requestApiKey}` },
            body: formData,
            signal: AbortSignal.timeout(STT_TIMEOUT_MS),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`${response.status} ${errText}`);
        }

        const text = (await response.text()).trim();

        if (seq < lastEmittedSeq) {
            console.log(`[GroqSTT] Dropping stale transcript seq=${seq} (already emitted ${lastEmittedSeq})`);
            return;
        }
        lastEmittedSeq = seq;

        if (text && transcriptCallback) {
            console.log(`[GroqSTT] Transcribed ${text.length} chars (seq=${seq})`);
            transcriptCallback(text);
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
        const sourcePosition = (i * 24000) / 16000;
        const leftIndex = Math.min(Math.floor(sourcePosition), inSamples - 1);
        const rightIndex = Math.min(leftIndex + 1, inSamples - 1);
        const fraction = sourcePosition - leftIndex;
        const left = buf.readInt16LE(leftIndex * 2);
        const right = buf.readInt16LE(rightIndex * 2);
        const interpolated = Math.round(left + (right - left) * fraction);
        out.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
    }
    return out;
}

/**
 * Learn the room's noise floor from the quietest chunks seen early in the
 * session, then set the silence threshold above it.
 *
 * A fixed threshold is the difference between working and not working: in a
 * quiet room 250 is far too high and clips speech; on a noisy call bridge the
 * RMS never falls below 250 at all, so silence is never detected and the
 * utterance is never sent.
 */
function calibrateNoiseFloor(rms) {
    if (noiseFloorLocked) return;

    noiseFloorSamples.push(rms);
    if (noiseFloorSamples.length < NOISE_FLOOR_SAMPLES) return;

    // The 25th percentile approximates "the room with nobody talking" even if
    // someone started speaking during calibration.
    const sorted = [...noiseFloorSamples].sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.25)];

    silenceThreshold = Math.max(MIN_SILENCE_RMS_THRESHOLD, Math.min(MAX_SILENCE_RMS_THRESHOLD, Math.round(floor * NOISE_FLOOR_MULTIPLIER)));
    noiseFloorLocked = true;
    noiseFloorSamples = [];
    console.log(`[GroqSTT] Noise floor calibrated: floor=${floor} threshold=${silenceThreshold}`);
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
    pcmChunks = [];
    pcmLength = 0;
    hasSpeech = false;
    speechStartedAt = 0;
    speechChunkCount = 0;
    nextTranscriptSeq = 0;
    lastEmittedSeq = -1;
    silenceThreshold = DEFAULT_SILENCE_RMS_THRESHOLD;
    noiseFloorSamples = [];
    noiseFloorLocked = false;
    isStarted = true;
    console.log('[GroqSTT] Started - Groq Whisper STT, language:', language);
}

function pushAudio(base64PcmData) {
    if (!isStarted) return;

    try {
        if (typeof base64PcmData !== 'string' || base64PcmData.length === 0 || base64PcmData.length > 131_072) {
            throw new Error('Invalid audio chunk');
        }
        const raw = Buffer.from(base64PcmData, 'base64');
        if (raw.length === 0 || raw.length % 2 !== 0) throw new Error('Invalid PCM audio chunk');
        const resampled = resample24to16(raw);
        const rms = computeRMS(resampled);

        calibrateNoiseFloor(rms);

        const isSilence = rms < silenceThreshold;

        if (!isSilence) {
            hasSpeech = true;
            if (!speechStartedAt) {
                speechStartedAt = Date.now();
                speechChunkCount = 0;
                console.log('[GroqSTT] Speech detected');

                // Guarantee the utterance is sent even if silence never
                // registers — otherwise constant room noise means no flush and
                // no answer, forever.
                if (!maxUtteranceTimer) {
                    maxUtteranceTimer = setTimeout(() => {
                        maxUtteranceTimer = null;
                        console.log('[GroqSTT] Max utterance reached — flushing without silence');
                        void flushAndTranscribe();
                    }, MAX_UTTERANCE_MS);
                }
            }
            speechChunkCount++;

            // Clear pending silence flush - speech continues
            if (silenceTimer) {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }

            pcmChunks.push(resampled);
            pcmLength += resampled.length;

            // Cap buffer to avoid unbounded growth — drop from the front.
            while (pcmLength > MAX_AUDIO_BYTES && pcmChunks.length > 1) {
                pcmLength -= pcmChunks.shift().length;
            }
        } else if (hasSpeech) {
            // Silence detected after speech - schedule a flush
            if (!silenceTimer) {
                const speakingMs = speechStartedAt ? Date.now() - speechStartedAt : 0;
                const wait = speakingMs >= LONG_UTTERANCE_MS ? SILENCE_TIMEOUT_LONG_MS : SILENCE_TIMEOUT_MS;
                silenceTimer = setTimeout(() => {
                    silenceTimer = null;
                    void flushAndTranscribe();
                }, wait);
            }
        }
    } catch (err) {
        console.error('[SpeechSTT] Push error:', err.message);
    }
}

function stopSpeechSTT() {
    const hadPendingSpeech = hasSpeech && pcmLength >= MIN_AUDIO_BYTES;

    clearFlushTimers();

    if (hadPendingSpeech) {
        void flushAndTranscribe();
    }

    pcmChunks = [];
    pcmLength = 0;
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
