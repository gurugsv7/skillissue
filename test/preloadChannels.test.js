const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function walkJavaScript(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return walkJavaScript(fullPath);
        return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
    });
}

function parseAllowedChannels(source, setName) {
    const match = source.match(new RegExp(`const ${setName} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
    assert.ok(match, `Missing ${setName}`);
    return new Set(Array.from(match[1].matchAll(/'([^']+)'/g), result => result[1]));
}

test('preload allowlists every statically used renderer IPC channel', () => {
    const preloadSource = fs.readFileSync(path.join(repoRoot, 'src', 'preload.js'), 'utf8');
    const allowed = {
        invoke: parseAllowedChannels(preloadSource, 'invokeChannels'),
        send: parseAllowedChannels(preloadSource, 'sendChannels'),
        on: parseAllowedChannels(preloadSource, 'receiveChannels'),
        removeListener: parseAllowedChannels(preloadSource, 'receiveChannels'),
        removeAllListeners: parseAllowedChannels(preloadSource, 'receiveChannels'),
    };

    const rendererFiles = [path.join(repoRoot, 'src', 'utils', 'renderer.js'), ...walkJavaScript(path.join(repoRoot, 'src', 'components'))];
    const missing = [];

    for (const filePath of rendererFiles) {
        const source = fs.readFileSync(filePath, 'utf8');
        for (const match of source.matchAll(/ipcRenderer\.(invoke|send|on|removeListener|removeAllListeners)\(\s*'([^']+)'/g)) {
            if (!allowed[match[1]].has(match[2])) missing.push(`${path.relative(repoRoot, filePath)}: ${match[1]}(${match[2]})`);
        }
    }

    assert.deepEqual(missing, []);
});

test('BrowserWindow uses an isolated renderer', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'src', 'utils', 'window.js'), 'utf8');
    assert.match(source, /nodeIntegration:\s*false/);
    assert.match(source, /contextIsolation:\s*true/);
    assert.match(source, /sandbox:\s*true/);
    assert.match(source, /preload:\s*path\.join/);
});

test('main process prevents duplicate app instances from competing for shortcuts', () => {
    const mainSource = fs.readFileSync(path.join(repoRoot, 'src', 'index.js'), 'utf8');
    assert.match(mainSource, /app\.requestSingleInstanceLock\(\)/);
    assert.match(mainSource, /app\.on\('second-instance'/);
});
