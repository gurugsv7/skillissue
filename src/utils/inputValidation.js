const path = require('path');

const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ACCESS_TOKEN_REGEX = /^[A-Za-z0-9_-]{6,256}$/;

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensurePlainObject(value, fieldName = 'value') {
    if (!isPlainObject(value)) {
        throw new Error(`${fieldName} must be an object`);
    }
    return value;
}

function sanitizeText(value, options = {}) {
    const { fieldName = 'value', maxLength = 5000, trim = true, allowEmpty = true, multiline = true } = options;

    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string`);
    }

    let output = value.replace(CONTROL_CHARS_REGEX, '');
    if (!multiline) {
        output = output.replace(/[\r\n]+/g, ' ');
    }
    if (trim) {
        output = output.trim();
    }

    if (!allowEmpty && output.length === 0) {
        throw new Error(`${fieldName} cannot be empty`);
    }
    if (output.length > maxLength) {
        throw new Error(`${fieldName} exceeds max length of ${maxLength}`);
    }

    return output;
}

function ensureEnum(value, allowedValues, fieldName = 'value') {
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string`);
    }

    if (!allowedValues.includes(value)) {
        throw new Error(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
    }

    return value;
}

function ensureBoolean(value, fieldName = 'value') {
    if (typeof value !== 'boolean') {
        throw new Error(`${fieldName} must be a boolean`);
    }
    return value;
}

function ensureNumber(value, options = {}) {
    const { fieldName = 'value', min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = options;
    if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
        throw new Error(`${fieldName} must be a finite number`);
    }
    if (value < min || value > max) {
        throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
    return value;
}

function ensureIntegerString(value, options = {}) {
    const { fieldName = 'value', min = 1, max = 60 } = options;
    const text = sanitizeText(String(value), { fieldName, maxLength: 6, multiline: false });
    if (!/^\d+$/.test(text)) {
        throw new Error(`${fieldName} must be a numeric string`);
    }
    const parsed = Number.parseInt(text, 10);
    if (parsed < min || parsed > max) {
        throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
    return String(parsed);
}

function ensureLanguageCode(value, fieldName = 'language') {
    const lang = sanitizeText(value, { fieldName, maxLength: 20, multiline: false });
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(lang)) {
        throw new Error(`${fieldName} is invalid`);
    }
    return lang;
}

function ensureSafeUrl(value, options = {}) {
    const { fieldName = 'url', protocols = ['https:'], allowLocalhost = false, maxLength = 2048 } = options;

    const raw = sanitizeText(value, { fieldName, maxLength, multiline: false, allowEmpty: false });

    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error(`${fieldName} is not a valid URL`);
    }

    if (!protocols.includes(parsed.protocol)) {
        throw new Error(`${fieldName} protocol is not allowed`);
    }

    if (!allowLocalhost && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
        throw new Error(`${fieldName} localhost is not allowed`);
    }

    return parsed.toString();
}

function ensureFilePath(value, options = {}) {
    const { fieldName = 'filePath', allowedExtensions = [], maxLength = 4096 } = options;

    const filePath = sanitizeText(value, { fieldName, maxLength, multiline: false, allowEmpty: false });
    if (filePath.includes('\0')) {
        throw new Error(`${fieldName} contains null bytes`);
    }

    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();

    if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
        throw new Error(`${fieldName} extension is not allowed`);
    }

    return resolved;
}

function ensureSafeFilename(value, fallback = 'export.txt') {
    if (typeof value !== 'string') return fallback;
    const cleaned = value
        .replace(CONTROL_CHARS_REGEX, '')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) return fallback;
    return cleaned.length > 128 ? cleaned.slice(0, 128) : cleaned;
}

function ensureBase64(value, options = {}) {
    const { fieldName = 'base64Data', minBytes = 1, maxBytes = 8 * 1024 * 1024 } = options;

    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a base64 string`);
    }

    const clean = value.trim();
    if (!clean || !BASE64_REGEX.test(clean)) {
        throw new Error(`${fieldName} is not valid base64`);
    }

    const byteLength = Buffer.from(clean, 'base64').length;
    if (byteLength < minBytes || byteLength > maxBytes) {
        throw new Error(`${fieldName} size is out of allowed range`);
    }

    return clean;
}

function ensureProfile(value, fieldName = 'profile') {
    return ensureEnum(
        value,
        [
            'interview',
            'technical-interview',
            // Retired id — still accepted so previously saved preferences load.
            'frontend-interview',
            'sales',
            'meeting',
            'presentation',
            'negotiation',
            'exam',
        ],
        fieldName
    );
}

function isValidAccessToken(value) {
    return typeof value === 'string' && ACCESS_TOKEN_REGEX.test(value);
}

module.exports = {
    isPlainObject,
    ensurePlainObject,
    sanitizeText,
    ensureEnum,
    ensureBoolean,
    ensureNumber,
    ensureIntegerString,
    ensureLanguageCode,
    ensureSafeUrl,
    ensureFilePath,
    ensureSafeFilename,
    ensureBase64,
    ensureProfile,
    isValidAccessToken,
};
