const test = require('node:test');
const assert = require('node:assert/strict');
const { consumeOpenAIStream } = require('../src/utils/sseParser');

function streamBody(chunks) {
    let index = 0;
    return {
        getReader() {
            return {
                async read() {
                    if (index >= chunks.length) return { done: true };
                    return { done: false, value: new TextEncoder().encode(chunks[index++]) };
                },
            };
        },
    };
}

test('preserves JSON events split across arbitrary network chunks', async () => {
    const body = streamBody([
        'data: {"choices":[{"delta":{"cont',
        'ent":"hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}',
        '\n\ndata: [DONE]\n\n',
    ]);
    const tokens = [];
    await consumeOpenAIStream(body, token => tokens.push(token));
    assert.deepEqual(tokens, ['hel', 'lo']);
});

test('ignores comments and empty events', async () => {
    const body = streamBody([': keepalive\n\ndata: {}\n\ndata: [DONE]\n']);
    const tokens = [];
    await consumeOpenAIStream(body, token => tokens.push(token));
    assert.deepEqual(tokens, []);
});
