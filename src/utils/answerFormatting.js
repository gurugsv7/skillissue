/**
 * Layout-only tidy-up for a spoken answer.
 *
 * The answer SHAPE is the prompt's job, not this file's. That is a deliberate
 * reversal: this module used to rewrite answers after generation — capping them
 * at three fragments of twelve words and appending an ellipsis — and it caused
 * every formatting bug worth reporting. A three-part question came back with
 * two parts silently deleted, because the formatter cannot know which words
 * matter and was guessing.
 *
 * So it no longer guesses. The only transformation left is splitting a line
 * that holds several sentences onto separate lines, which is a pure display
 * change: every word survives, in its original order. Everything else — how
 * long a line should be, how many pointers, which labels — is instructed in
 * `buildLiveInterviewPrompt` and verified to work.
 */

// Roughly one breath. Only used to decide whether a line is worth splitting,
// never to truncate one.
const MAX_SPEAKABLE_WORDS = 20;

function wordCount(text) {
    return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Split a line that runs several sentences together. Lossless: the returned
 * pieces concatenate back to the original words.
 */
function splitIntoSentences(line) {
    if (wordCount(line) <= MAX_SPEAKABLE_WORDS) return [line];

    const bullet = line.match(/^([-*•]\s+)/)?.[1] || '';
    const sentences = line
        .replace(/^[-*•]\s+/, '')
        .split(/(?<=[.!?])\s+/)
        .map(part => part.trim())
        .filter(Boolean);

    // A single very long sentence is left alone — breaking mid-sentence is the
    // thing that made answers unreadable before.
    if (sentences.length <= 1) return [line];

    return sentences.map(part => bullet + part);
}

/**
 * @param {string} text      the model's answer
 * @param {object} shape     the question shape; only `allowCode` is consulted
 */
function formatSpokenInterviewAnswer(text = '', shape = null) {
    const raw = String(text || '')
        .replace(/\r/g, '')
        .trim();
    if (!raw) return '';

    // Code must never be reflowed — a break inside a snippet breaks the snippet.
    if (shape?.allowCode) return raw;
    if (/```/.test(raw) || /===CODE_ISSUE_START===/i.test(raw) || /===CODE_ISSUE_END===/i.test(raw)) {
        return raw;
    }

    const lines = raw
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .flatMap(splitIntoSentences);

    return lines.join('\n\n');
}

module.exports = {
    formatSpokenInterviewAnswer,
    MAX_SPEAKABLE_WORDS,
};
