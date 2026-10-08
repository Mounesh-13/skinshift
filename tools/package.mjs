// Builds dist/skinshift-v0.1.0.zip with only the runtime files (no tests, docs or node_modules).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const out = path.join(ROOT, 'dist', `skinshift-v${manifest.version}.zip`);
const stage = path.join(ROOT, 'dist', 'skinshift');
fs.rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const item of ['manifest.json', 'src', 'icons', 'LICENSE']) {
  fs.cpSync(path.join(ROOT, item), path.join(stage, item), { recursive: true });
}
fs.rmSync(path.join(stage, 'src', 'popup', '.DS_Store'), { force: true });
execFileSync('zip', ['-qr', out, 'skinshift'], { cwd: path.join(ROOT, 'dist') });
console.log('wrote', path.relative(ROOT, out));
