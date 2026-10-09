async function consumeOpenAIStream(body, onToken) {
    if (!body || typeof body.getReader !== 'function') throw new Error('Streaming response body is unavailable');

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let pending = '';

    const consumeLine = line => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return false;
        const data = trimmed.slice(5).trimStart();
        if (data === '[DONE]') return true;
        if (!data) return false;
        const event = JSON.parse(data);
        const token = event.choices?.[0]?.delta?.content || '';
        if (token) onToken(token, event);
        return false;
    };

    while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = pending.split(/\r?\n/);
        pending = done ? '' : lines.pop() || '';
        for (const line of lines) {
            try {
                if (consumeLine(line)) return;
            } catch (error) {
                if (!done) {
                    pending = `${line}\n${pending}`;
                    break;
                }
                throw new Error(`Invalid streaming response: ${error.message}`);
            }
        }
        if (done) {
            if (pending.trim()) consumeLine(pending);
            return;
        }
    }
}

module.exports = { consumeOpenAIStream };
