const crypto = require('crypto');

const buckets = new Map();
const MAX_BUCKETS = 10_000;
let lastCleanupAt = 0;

function nowMs() {
    return Date.now();
}

function hashValue(value) {
    return crypto
        .createHash('sha256')
        .update(String(value || ''))
        .digest('hex');
}

function normalizePolicy(policy = {}) {
    return {
        windowMs: Math.min(Math.max(Number(policy.windowMs) || 60_000, 1_000), 86_400_000),
        max: Math.min(Math.max(Number(policy.max) || 30, 1), 10_000),
        blockDurationMs: Math.min(Math.max(Number(policy.blockDurationMs) || 120_000, 1_000), 86_400_000),
        message: String(policy.message || 'Too many requests. Please slow down.'),
    };
}

function cleanupBuckets(currentTime) {
    if (buckets.size < MAX_BUCKETS && currentTime - lastCleanupAt < 60_000) return;
    lastCleanupAt = currentTime;
    for (const [key, state] of buckets) {
        const expiresAt = Math.max(state.windowStartedAt + state.windowMs, state.blockedUntil || 0);
        if (expiresAt <= currentTime) buckets.delete(key);
    }
    while (buckets.size >= MAX_BUCKETS) buckets.delete(buckets.keys().next().value);
}

function getBucketKey(name, key) {
    return `${name}::${key}`;
}

function enforceNamedRateLimit(name, key, policy) {
    const normalizedPolicy = normalizePolicy(policy);
    const bucketKey = getBucketKey(name, key || 'anonymous');
    const currentTime = nowMs();
    cleanupBuckets(currentTime);

    let state = buckets.get(bucketKey);
    if (!state) {
        state = {
            count: 0,
            windowStartedAt: currentTime,
            blockedUntil: 0,
            windowMs: normalizedPolicy.windowMs,
        };
    }

    if (state.blockedUntil > currentTime) {
        throw new Error(normalizedPolicy.message);
    }

    if (currentTime - state.windowStartedAt >= normalizedPolicy.windowMs) {
        state.count = 0;
        state.windowStartedAt = currentTime;
        state.blockedUntil = 0;
    }

    state.count += 1;
    state.windowMs = normalizedPolicy.windowMs;

    if (state.count > normalizedPolicy.max) {
        state.blockedUntil = currentTime + normalizedPolicy.blockDurationMs;
        buckets.set(bucketKey, state);
        throw new Error(normalizedPolicy.message);
    }

    buckets.set(bucketKey, state);
}

function getIpcSenderKey(event) {
    const senderId = event?.sender?.id || 'unknown-sender';
    const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || 'unknown-url';
    return `${senderId}:${senderUrl}`;
}

function ensureStringWithinLimit(value, maxLength, fieldName = 'value') {
    const text = String(value || '');
    if (text.length > maxLength) {
        throw new Error(`${fieldName} is too large`);
    }
    return text;
}

function enforceIpcRateLimit(event, name, policy) {
    const senderKey = getIpcSenderKey(event);
    enforceNamedRateLimit(name, senderKey, policy);
}

module.exports = {
    enforceNamedRateLimit,
    enforceIpcRateLimit,
    ensureStringWithinLimit,
    hashValue,
};
