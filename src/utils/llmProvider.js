/**
 * LLM provider layer.
 *
 * Every provider here speaks the OpenAI chat-completions wire format, so the
 * app's streaming, message and image plumbing is shared. What differs between
 * them is small but unforgiving, and each difference below was verified against
 * the live APIs rather than inferred from docs:
 *
 *   - OpenAI GPT-5 models REJECT `max_tokens` with a 400. They require
 *     `max_completion_tokens`. Gemini requires the opposite.
 *   - `reasoning_effort: "none"` works on gpt-5.6-luna but 400s on gpt-5-mini
 *     and on gemini-3.7-flash ("Thinking level MINIMAL is not supported").
 *   - Reasoning tokens count against the output budget, so a small cap plus a
 *     thinking model can return an empty answer (observed: gpt-5-mini at
 *     medium effort returned zero words with a 350-token cap).
 *
 * Measured time-to-first-token on the real interview prompt:
 *   gpt-5.6-luna @ none    1375ms      gpt-5-mini @ low    4204ms
 *   gpt-5.6-luna @ low     1609ms      gpt-5-mini @ medium 0 words returned
 */

const { isFailoverStatus } = require('./llmKeyPool');

/* ------------------------------------------------------------------ *
 * Provider registry
 * ------------------------------------------------------------------ */

const PROVIDERS = {
    openai: {
        id: 'openai',
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        // GPT-5 family rejects `max_tokens` outright.
        maxTokensParam: 'max_completion_tokens',
        defaultModel: 'gpt-5.6-luna',
        // Ordered by measured TTFT; falling back also gets faster.
        fallbackChain: ['gpt-5.6-luna', 'gpt-5-mini', 'gpt-4o-mini'],
        envKeys: ['OPENAI_API_KEYS', 'OPENAI_API_KEY'],
        envModel: 'OPENAI_MODEL',

        /**
         * Live spoken turns want the lowest latency the model allows; the
         * screenshot path is not latency-critical and can afford to think.
         */
        reasoningEffort(model, { live = false, deeper = false } = {}) {
            const id = String(model || '').toLowerCase();
            // Verified: gpt-5-mini and gpt-5-nano 400 on "none".
            const supportsNone = !/^gpt-5-(mini|nano)/.test(id) && !/^gpt-4o/.test(id);
            // gpt-4o has no reasoning parameter at all.
            if (/^gpt-4o/.test(id)) return undefined;
            if (deeper) return 'medium';
            if (live) return supportsNone ? 'none' : 'low';
            return 'low';
        },
    },

    gemini: {
        id: 'gemini',
        label: 'Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        maxTokensParam: 'max_tokens',
        defaultModel: 'gemini-3.6-flash',
        fallbackChain: ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'],
        envKeys: ['GEMINI_API_KEYS', 'GEMINI_API_KEY'],
        envModel: 'GEMINI_MODEL',

        reasoningEffort(model, { live = false, deeper = false } = {}) {
            const id = String(model || '').toLowerCase();
            if (id.includes('flash-lite')) return undefined;
            // Verified: gemini-3.7-flash 400s on "minimal"; "low" is the floor.
            if (id.startsWith('gemini-2.5')) return live && !deeper ? 'none' : 'low';
            return 'low';
        },
    },
};

const DEFAULT_PROVIDER_ID = 'openai';
// Tried in order — if OpenAI is down entirely, Gemini still answers.
const PROVIDER_FALLBACK_ORDER = ['openai', 'gemini'];

function getProvider(id) {
    return PROVIDERS[String(id || '').toLowerCase()] || PROVIDERS[DEFAULT_PROVIDER_ID];
}

/**
 * Output budgets. Reasoning tokens are drawn from the same allowance, so these
 * carry deliberate headroom — a truncated answer mid-interview costs far more
 * than the unused ceiling, which is billed only on tokens actually produced.
 */
// Fire a duplicate request if a live turn has not responded within this long.
// Set from measurement: p95 is ~1.5s, so 2500ms fires only on a genuine outlier.
const HEDGE_DELAY_MS = 2500;

const OUTPUT_BUDGET = {
    live: 600, // a 45s spoken answer is ~170 tokens; the rest is safety margin
    vision: 2000, // screenshots return code
    verify: 1500,
};

/* ------------------------------------------------------------------ *
 * Request building
 * ------------------------------------------------------------------ */

function chatCompletionsUrl(provider) {
    return `${provider.baseUrl}/chat/completions`;
}

function buildHeaders(apiKey) {
    return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

function buildChatBody(provider, { model, messages, stream = false, temperature = 1, maxTokens, reasoningEffort } = {}) {
    const body = { model, messages, stream: Boolean(stream), temperature };

    if (Number.isFinite(maxTokens) && maxTokens > 0) {
        body[provider.maxTokensParam] = maxTokens;
    }
    if (reasoningEffort) {
        body.reasoning_effort = reasoningEffort;
    }
    return body;
}

/* ------------------------------------------------------------------ *
 * Error classification
 * ------------------------------------------------------------------ */

/** A 400 caused by a parameter this model does not accept — recoverable by dropping it. */
function isUnsupportedParamError(status, errorText = '') {
    if (status !== 400) return false;
    return /reasoning_effort|thinking level|max_tokens|max_completion_tokens|unsupported (value|parameter)/i.test(String(errorText));
}

/** The model is saturated. Another key will not help; another model will. */
function isModelOverloadedError(status, errorText = '') {
    return status === 503 || /high demand|overloaded|UNAVAILABLE|model_overloaded/i.test(String(errorText || ''));
}

function describeError(provider, status, errorText = '') {
    if (status === 401 || status === 403) {
        return `${provider.label} API key was rejected — check the key in settings.`;
    }
    if (status === 429) {
        return `${provider.label} rate limit hit. Retrying on another key.`;
    }
    if (status === 404) {
        return `${provider.label} model not found — it may have been retired.`;
    }
    const detail = String(errorText || '').slice(0, 250);
    return `${provider.label} error ${status}${detail ? `: ${detail}` : ''}`;
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

/**
 * Deadline on *reaching* the response, not on consuming it.
 *
 * `AbortSignal.timeout()` kills the body too, which truncates a streaming
 * answer mid-sentence once the deadline passes. We want to fail fast on a
 * request that isn't being answered, then let tokens stream as long as needed.
 */
async function fetchWithHeaderTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * One model, failing over across the key pool.
 *
 * The pool only hands out keys with room in their per-minute window, so the
 * usual path is a single request. On a 429 the next key is tried immediately —
 * no backoff, because in a live interview a retry delay costs more than a retry.
 */
async function requestOnce({ provider, pool, apiKey, model, messages, stream, temperature = 1, maxTokens, reasoningEffort, timeoutMs = 20_000 }) {
    const url = chatCompletionsUrl(provider);
    const full = JSON.stringify(buildChatBody(provider, { model, messages, stream, temperature, maxTokens, reasoningEffort }));
    const stripped = JSON.stringify(buildChatBody(provider, { model, messages, stream, temperature, maxTokens }));

    const send = (key, body) => fetchWithHeaderTimeout(url, { method: 'POST', headers: buildHeaders(key), body }, timeoutMs);

    // No pool: a single bare key, no failover.
    if (!pool || !pool.size) {
        let response = await send(apiKey, full);
        if (response.status === 400) {
            const text = await response.text();
            if (!isUnsupportedParamError(400, text)) return { response: new Response(text, { status: 400 }), keyIndex: -1, attempts: 1 };
            response = await send(apiKey, stripped);
        }
        return { response, keyIndex: -1, attempts: 1 };
    }

    const tried = [];
    let lastError = null;
    let overloaded = false;

    for (let attempt = 0; attempt < pool.size; attempt++) {
        const lease = pool.acquire(tried);
        if (!lease) break;
        tried.push(lease.index);

        try {
            let response = await send(lease.key, full);

            // A rejected parameter is recoverable: drop it and retry on the same
            // key rather than losing the turn.
            if (response.status === 400) {
                const text = await response.text();
                if (isUnsupportedParamError(400, text)) {
                    console.warn(`[${provider.label}] ${model} rejected a parameter; retrying without reasoning_effort`);
                    response = await send(lease.key, stripped);
                } else {
                    return { response: new Response(text, { status: 400 }), keyIndex: lease.index, attempts: attempt + 1 };
                }
            }

            if (response.ok) {
                pool.noteSuccess(lease.index);
                return { response, keyIndex: lease.index, attempts: attempt + 1 };
            }

            if (!isFailoverStatus(response.status)) {
                return { response, keyIndex: lease.index, attempts: attempt + 1 };
            }

            const text = await response.text();
            if (isModelOverloadedError(response.status, text)) {
                overloaded = true;
                lastError = { status: response.status, text };
                break; // another key won't help
            }
            pool.noteFailure(lease.index, { status: response.status, errorText: text, headers: response.headers });
            lastError = { status: response.status, text };
        } catch (error) {
            pool.noteFailure(lease.index, { status: 0, errorText: error.message });
            lastError = { status: 0, text: error.message || 'request_failed' };
        }
    }

    const detail = lastError ? describeError(provider, lastError.status, lastError.text) : 'No API key available';
    const err = new Error(overloaded ? `${model} is overloaded. ${detail}` : `All ${tried.length || pool.size} ${provider.label} key(s) failed. ${detail}`);
    err.status = lastError?.status || 0;
    err.modelOverloaded = overloaded;
    err.allKeysExhausted = !overloaded;
    throw err;
}

/**
 * Fire a second identical request if the first has not produced a response by
 * `hedgeDelayMs`, and use whichever answers first.
 *
 * Measured against the live API, time-to-headers tracks time-to-first-token
 * almost exactly, so a slow response header is a reliable early signal that
 * this particular request landed badly. The tail is what this defends against:
 * p50 was 889ms and p95 1511ms across 24 runs, but a single outlier hit 10.9s —
 * server-side queueing, not generation. At a 12s turn deadline that outlier is
 * one bad moment away from dropping the answer entirely.
 *
 * The hedge fires on roughly the slowest 5-10% of turns and costs a fraction of
 * a cent, which is a good trade against losing a live interview answer.
 */
async function raceToFirstSuccess(promises) {
    return new Promise((resolve, reject) => {
        let pending = promises.length;
        let settled = false;
        let lastError = null;

        for (const promise of promises) {
            promise.then(
                result => {
                    if (settled) {
                        // A loser arrived after we already returned. Release its
                        // stream so the connection is not left hanging open.
                        result?.response?.body?.cancel?.().catch(() => {});
                        return;
                    }
                    settled = true;
                    resolve(result);
                },
                error => {
                    lastError = error;
                    pending -= 1;
                    if (!settled && pending === 0) reject(lastError);
                }
            );
        }
    });
}

async function withHedge(makeAttempt, hedgeDelayMs) {
    const primary = makeAttempt();
    if (!hedgeDelayMs || hedgeDelayMs <= 0) return primary;

    let hedgeTimer;
    const delay = new Promise(resolve => {
        hedgeTimer = setTimeout(() => resolve('hedge'), hedgeDelayMs);
    });

    // Give the primary a head start. If it lands (or fails) first, no second
    // request is ever issued.
    const outcome = await Promise.race([
        primary.then(result => ({ kind: 'ok', result }), error => ({ kind: 'err', error })),
        delay.then(() => ({ kind: 'slow' })),
    ]);
    clearTimeout(hedgeTimer);

    if (outcome.kind === 'ok') return outcome.result;
    if (outcome.kind === 'err') throw outcome.error;

    console.log(`[LLM] Primary slow (>${hedgeDelayMs}ms) — hedging with a second request`);
    // The primary is still in flight; whichever answers first wins.
    return raceToFirstSuccess([primary, makeAttempt()]);
}

/**
 * Full request path: model fallback within a provider, then provider fallback.
 *
 * `providers` is an ordered list of `{ provider, pool, model }`. A saturated
 * model rolls to the next model; an exhausted provider rolls to the next
 * provider, so an OpenAI outage still gets answered by Gemini.
 */
async function requestChatCompletion({
    providers,
    messages,
    stream = false,
    temperature = 1,
    maxTokens,
    live = false,
    deeper = false,
    timeoutMs = 20_000,
    // Hedging only makes sense where latency is the thing that hurts. A
    // screenshot or a background verify can afford to be slow, and duplicating
    // those would double their (much larger) cost for no benefit.
    hedgeDelayMs = live ? HEDGE_DELAY_MS : 0,
}) {
    let lastError = null;

    for (const entry of providers) {
        const { provider, pool, apiKey } = entry;
        if (!pool?.size && !apiKey) continue;

        const primary = entry.model || provider.defaultModel;
        const chain = [primary, ...provider.fallbackChain.filter(m => m !== primary)];

        for (let i = 0; i < chain.length; i++) {
            const model = chain[i];
            try {
                const attempt = () =>
                    requestOnce({
                        provider,
                        pool,
                        apiKey,
                        model,
                        messages,
                        stream,
                        temperature,
                        maxTokens,
                        reasoningEffort: provider.reasoningEffort(model, { live, deeper }),
                        timeoutMs,
                    });

                // Hedge only the first choice. Once we are already falling back,
                // the priority is getting any answer, not shaving the tail.
                const isFirstChoice = entry === providers[0] && i === 0;
                const result = await withHedge(attempt, isFirstChoice ? hedgeDelayMs : 0);
                return { ...result, provider: provider.id, model, modelFallbacks: i };
            } catch (error) {
                lastError = error;
                // Only a saturated model is worth trying elsewhere; a dead key
                // pool or a bad request fails identically on every model.
                if (!error.modelOverloaded) break;
            }
        }
    }

    throw lastError || new Error('No LLM provider is configured');
}

/** Non-streaming call returning assistant text, or throwing. */
async function fetchChatCompletionText(options) {
    const { response, provider, model } = await requestChatCompletion({ ...options, stream: false });
    if (!response.ok) {
        throw new Error(describeError(getProvider(provider), response.status, await response.text()));
    }
    const payload = await response.json();
    void model;
    return (payload?.choices?.[0]?.message?.content || '').trim();
}

module.exports = {
    PROVIDERS,
    DEFAULT_PROVIDER_ID,
    PROVIDER_FALLBACK_ORDER,
    OUTPUT_BUDGET,
    HEDGE_DELAY_MS,
    getProvider,
    chatCompletionsUrl,
    buildHeaders,
    buildChatBody,
    describeError,
    isUnsupportedParamError,
    isModelOverloadedError,
    fetchWithHeaderTimeout,
    requestChatCompletion,
    fetchChatCompletionText,
};
