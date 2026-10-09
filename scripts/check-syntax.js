const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const roots = ['src', 'scripts', 'test'];
const excludedDirectories = new Set(['assets', 'data']);

function collectJavaScript(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        if (entry.isDirectory() && excludedDirectories.has(entry.name)) return [];
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScript(fullPath);
        return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
    });
}

const files = roots.flatMap(root => collectJavaScript(path.join(repoRoot, root)));
const failures = [];

for (const filePath of files) {
    const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
    if (result.status !== 0) failures.push(`${path.relative(repoRoot, filePath)}\n${result.stderr || result.stdout}`);
}

if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
} else {
    console.log(`Syntax checked ${files.length} JavaScript files.`);
}
