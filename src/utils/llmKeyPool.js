/**
 * API key pool with proactive spreading and instant failover.
 *
 * Provider-agnostic: used for OpenAI and Gemini alike.
 *
 * Free tiers cap each key hard (Gemini free tier measured at 5 RPM / 20 RPD). With two keys from
 * separate accounts the effective ceiling doubles, but only if the pool does
 * two things:
 *
 *   1. PROACTIVE — never send to a key already at its per-minute ceiling.
 *      Reacting to a 429 costs a wasted round trip (~150-400ms) before the
 *      retry even starts, and in a live interview that is the most expensive
 *      moment to lose. Tracking a sliding window client-side means the common
 *      case never produces a 429 at all.
 *
 *   2. REACTIVE — when a 429 does arrive (the server's accounting is the real
 *      one), switch keys and re-issue immediately, with no sleep. The cost is
 *      one round trip, not a backoff delay.
 *
 * Everything here is synchronous and in-memory: the acquire path adds no I/O
 * and no await to the hot path.
 */

// Free-tier Flash is documented at 10 RPM. Stay one under so a request already
// in flight cannot push the key over the line.
const DEFAULT_REQUESTS_PER_MINUTE = 9;
const WINDOW_MS = 60_000;

// Applied when the server returns 429 without telling us how long to wait.
// A per-minute breach clears within the window; anything longer is reported.
const DEFAULT_COOLDOWN_MS = 20_000;

// Daily-quota exhaustion should not be retried every few seconds.
const DAILY_QUOTA_COOLDOWN_MS = 15 * 60_000;

// Transport failures and 5xx get a short rest so the pool prefers its sibling.
const TRANSIENT_COOLDOWN_MS = 5_000;

const MAX_COOLDOWN_MS = 60 * 60_000;

/** Accepts an array, or a string holding several keys separated by , ; or newline. */
function parseApiKeys(value) {
    if (!value) return [];

    const raw = Array.isArray(value) ? value : String(value).split(/[\s,;]+/);

    const seen = new Set();
    const keys = [];
    for (const entry of raw) {
        const key = String(entry || '').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
    }
    return keys;
}

/**
 * Pull a retry hint out of a Gemini error. The REST error body carries a
 * `RetryInfo` detail with `retryDelay: "31s"`; the HTTP `Retry-After` header
 * is honoured too when present.
 */
function parseRetryDelayMs(errorText = '', headers = null) {
    const headerValue = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
    if (headerValue) {
        const seconds = Number(headerValue);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return Math.min(seconds * 1000, MAX_COOLDOWN_MS);
        }
    }

    const match = String(errorText || '').match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    if (match) {
        const seconds = Number(match[1]);
        if (Number.isFinite(seconds)) {
            return Math.min(seconds * 1000, MAX_COOLDOWN_MS);
        }
    }

    return 0;
}

function isDailyQuotaError(errorText = '') {
    return /PerDay|per day|daily limit|GenerateRequestsPerDay/i.test(String(errorText || ''));
}

class LlmKeyPool {
    constructor(keys = [], options = {}) {
        this.requestsPerMinute = Number(options.requestsPerMinute) || DEFAULT_REQUESTS_PER_MINUTE;
        this.entries = [];
        this.cursor = 0;
        this.setKeys(keys);
    }

    /** Replace the key set, preserving usage history for keys that survive. */
    setKeys(keys) {
        const parsed = parseApiKeys(keys);
        const previous = new Map(this.entries.map(entry => [entry.key, entry]));

        this.entries = parsed.map(key => previous.get(key) || { key, hits: [], cooldownUntil: 0 });
        if (this.cursor >= this.entries.length) this.cursor = 0;
        return this.entries.length;
    }

    get size() {
        return this.entries.length;
    }

    _prune(entry, now) {
        if (entry.hits.length && now - entry.hits[0] >= WINDOW_MS) {
            entry.hits = entry.hits.filter(at => now - at < WINDOW_MS);
        }
    }

    /** When this key next has room, in ms from now. 0 means "right now". */
    _availableInMs(entry, now) {
        this._prune(entry, now);

        const cooling = Math.max(0, entry.cooldownUntil - now);
        if (entry.hits.length < this.requestsPerMinute) return cooling;

        const oldest = entry.hits[0];
        return Math.max(cooling, WINDOW_MS - (now - oldest));
    }

    /**
     * Pick the best key to use right now.
     *
     * Prefers a key that is free immediately, rotating between equally-free
     * keys so load spreads instead of hammering the first one. If every key is
     * capped it still returns the one that frees soonest — the caller sends
     * anyway, because these limits are approximations of the server's.
     *
     * `skipIndexes` lets a retry avoid keys that just failed.
     */
    acquire(skipIndexes = []) {
        if (!this.entries.length) return null;

        const now = Date.now();
        const skip = new Set(skipIndexes);

        let best = null;
        for (let offset = 0; offset < this.entries.length; offset++) {
            const index = (this.cursor + offset) % this.entries.length;
            if (skip.has(index)) continue;

            const waitMs = this._availableInMs(this.entries[index], now);
            if (waitMs === 0) {
                best = { index, waitMs };
                break;
            }
            if (!best || waitMs < best.waitMs) best = { index, waitMs };
        }

        if (!best) return null;

        // Advance the cursor so the next call starts at the following key.
        this.cursor = (best.index + 1) % this.entries.length;

        const entry = this.entries[best.index];
        entry.hits.push(now);

        return { key: entry.key, index: best.index, waitMs: best.waitMs };
    }

    /** A key worked — clear any cooldown left on it. */
    noteSuccess(index) {
        const entry = this.entries[index];
        if (entry) entry.cooldownUntil = 0;
    }

    /**
     * A key failed. Rest it just long enough that the pool prefers its sibling,
     * using the server's own retry hint when one was supplied.
     */
    noteFailure(index, { status = 0, errorText = '', headers = null } = {}) {
        const entry = this.entries[index];
        if (!entry) return 0;

        let cooldownMs;
        if (status === 429) {
            cooldownMs = parseRetryDelayMs(errorText, headers) || (isDailyQuotaError(errorText) ? DAILY_QUOTA_COOLDOWN_MS : DEFAULT_COOLDOWN_MS);
            // A per-minute breach means the window is genuinely full.
            entry.hits = Array.from({ length: this.requestsPerMinute }, () => Date.now());
        } else if (status >= 500 || status === 0) {
            cooldownMs = TRANSIENT_COOLDOWN_MS;
        } else {
            // 400/401/403/404 are the key's or the request's fault, not a rate
            // problem — failing over would just repeat the same error.
            return 0;
        }

        entry.cooldownUntil = Date.now() + Math.min(cooldownMs, MAX_COOLDOWN_MS);
        return cooldownMs;
    }

    /** Diagnostic snapshot — never includes key material. */
    describe() {
        const now = Date.now();
        return this.entries.map((entry, index) => ({
            index,
            recentRequests: entry.hits.filter(at => now - at < WINDOW_MS).length,
            cooldownMs: Math.max(0, entry.cooldownUntil - now),
        }));
    }
}

/** Only a rate/transport problem is worth re-issuing on another key. */
function isFailoverStatus(status) {
    return status === 429 || status >= 500 || status === 0;
}

module.exports = {
    LlmKeyPool,
    parseApiKeys,
    parseRetryDelayMs,
    isDailyQuotaError,
    isFailoverStatus,
    DEFAULT_REQUESTS_PER_MINUTE,
};
