function formatSpokenInterviewAnswer(text = '') {
    const raw = String(text || '').replace(/\r/g, '').trim();
    if (!raw) return '';
    if (/```/.test(raw) || /===CODE_ISSUE_START===/i.test(raw) || /===CODE_ISSUE_END===/i.test(raw)) {
        return raw;
    }

    const compact = raw.replace(/\n{2,}/g, '\n').replace(/[ \t]+/g, ' ').trim();
    const sentences = compact
        .split(/(?<=[.!?])\s+/)
        .map(part => part.trim().replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, ''))
        .filter(Boolean);

    if (sentences.length <= 1) {
        return compact;
    }

    const fragments = [];

    for (const sentence of sentences) {
        const parts = sentence
            .split(/\s*(?:,|;|—|--|\bbut\b|\bbecause\b|\bwhile\b|\band\b|\bso\b)\s+/i)
            .map(part => part.trim())
            .filter(Boolean);

        for (const part of parts) {
            if (!part) continue;
            const words = part.split(/\s+/).filter(Boolean);
            const shortened = words.length > 6 ? words.slice(0, 6).join(' ') : part;
            fragments.push(shortened);
            if (fragments.length >= 2) break;
        }

        if (fragments.length >= 2) break;
    }

    return fragments.length ? fragments.join('\n\n') : compact;
}

module.exports = {
    formatSpokenInterviewAnswer,
};
