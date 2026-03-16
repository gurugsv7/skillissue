const crypto = require('crypto');

const buckets = new Map();

function nowMs() {
    return Date.now();
}

function hashValue(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizePolicy(policy = {}) {
    return {
        windowMs: Number(policy.windowMs || 60_000),
        max: Number(policy.max || 30),
        blockDurationMs: Number(policy.blockDurationMs || 120_000),
        message: String(policy.message || 'Too many requests. Please slow down.'),
    };
}

function getBucketKey(name, key) {
    return `${name}::${key}`;
}

function enforceNamedRateLimit(name, key, policy) {
    const normalizedPolicy = normalizePolicy(policy);
    const bucketKey = getBucketKey(name, key || 'anonymous');
    const currentTime = nowMs();

    let state = buckets.get(bucketKey);
    if (!state) {
        state = {
            count: 0,
            windowStartedAt: currentTime,
            blockedUntil: 0,
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
