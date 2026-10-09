const { contextBridge, ipcRenderer } = require('electron');

const invokeChannels = new Set([
    'auth:calibration-analyze',
    'auth:calibration-transcribe',
    'clear-runtime-provider-secrets',
    'close-session',
    'get-app-version',
    'initialize-gemini',
    'open-external',
    'open-file-dialog',
    'parse-document',
    'quit-application',
    'reposition-window',
    'resolve-provider-secrets',
    'save-text-file',
    'send-audio-content',
    'send-image-content',
    'send-mic-audio-content',
    'send-text-message',
    'start-macos-audio',
    'stop-macos-audio',
    'toggle-window-visibility',
    'update-google-search-setting',
    'update-sizes',
    'window-minimize',
    'storage:clear-all',
    'storage:clear-provider-secrets',
    'storage:delete-all-sessions',
    'storage:delete-session',
    'storage:delete-voice-profile',
    'storage:get-all-sessions',
    'storage:get-api-key',
    'storage:get-azure-api-key',
    'storage:get-gemini-model',
    'storage:get-azure-endpoint',
    'storage:get-config',
    'storage:get-credentials',
    'storage:get-groq-api-key',
    'storage:get-keybinds',
    'storage:get-preferences',
    'storage:get-session',
    'storage:get-today-limits',
    'storage:get-voice-profile',
    'storage:save-session',
    'storage:save-voice-profile',
    'storage:set-api-key',
    'storage:set-azure-api-key',
    'storage:set-gemini-model',
    'storage:set-azure-endpoint',
    'storage:set-config',
    'storage:set-credentials',
    'storage:set-groq-api-key',
    'storage:set-keybinds',
    'storage:set-preferences',
    'storage:update-config',
    'storage:update-preference',
]);

const sendChannels = new Set([
    'update-keybinds',
    'view-changed',
    'window-manual-resize-end',
    'window-manual-resize-start',
    'window-manual-resize-step',
]);

const receiveChannels = new Set([
    'clear-sensitive-data',
    'click-through-toggled',
    'navigate-next-response',
    'navigate-previous-response',
    'new-response',
    'reconnect-failed',
    'save-conversation-turn',
    'save-screen-analysis',
    'save-session-context',
    'screen-analysis-triggered',
    'scroll-response-down',
    'scroll-response-up',
    'telegram-image-received',
    'telegram-text-received',
    'update-response',
    'update-status',
    'whisper-downloading',
]);

const listenerWrappers = new Map();

function assertAllowed(channel, allowed) {
    if (!allowed.has(channel)) throw new Error(`IPC channel is not allowed: ${channel}`);
}

function getListenerKey(channel, listener) {
    let byChannel = listenerWrappers.get(listener);
    if (!byChannel) {
        byChannel = new Map();
        listenerWrappers.set(listener, byChannel);
    }
    return byChannel;
}

contextBridge.exposeInMainWorld(
    'electronAPI',
    Object.freeze({
        platform: process.platform,
        invoke(channel, ...args) {
            assertAllowed(channel, invokeChannels);
            return ipcRenderer.invoke(channel, ...args);
        },
        send(channel, ...args) {
            assertAllowed(channel, sendChannels);
            ipcRenderer.send(channel, ...args);
        },
        on(channel, listener) {
            assertAllowed(channel, receiveChannels);
            if (typeof listener !== 'function') throw new TypeError('IPC listener must be a function');
            const wrappers = getListenerKey(channel, listener);
            if (wrappers.has(channel)) return;
            const wrapped = (_event, ...args) => listener(Object.freeze({}), ...args);
            wrappers.set(channel, wrapped);
            ipcRenderer.on(channel, wrapped);
        },
        removeListener(channel, listener) {
            assertAllowed(channel, receiveChannels);
            const wrappers = listenerWrappers.get(listener);
            const wrapped = wrappers?.get(channel);
            if (!wrapped) return;
            ipcRenderer.removeListener(channel, wrapped);
            wrappers.delete(channel);
            if (wrappers.size === 0) listenerWrappers.delete(listener);
        },
        removeAllListeners(channel) {
            assertAllowed(channel, receiveChannels);
            ipcRenderer.removeAllListeners(channel);
            for (const [listener, wrappers] of listenerWrappers) {
                wrappers.delete(channel);
                if (wrappers.size === 0) listenerWrappers.delete(listener);
            }
        },
    })
);
