// Builds dist/skinshift-v<version>.zip with only the runtime files (no tests,
// docs or node_modules) and regenerates SHA256SUMS.txt for the zip.
// Run: npm run package  (or: node tools/package.mjs)
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// Pre-flight: fail fast with a clear message instead of shipping a broken zip.
const missing = [];
for (const item of ['manifest.json', 'src', 'icons', 'LICENSE']) {
  if (!fs.existsSync(path.join(ROOT, item))) missing.push(item);
}
for (const icon of Object.values(manifest.icons || {})) {
  if (!fs.existsSync(path.join(ROOT, icon))) missing.push(icon);
}
for (const cs of manifest.content_scripts || []) {
  for (const f of [...(cs.js || []), ...(cs.css || [])]) {
    if (!fs.existsSync(path.join(ROOT, f))) missing.push(f);
  }
}
if (manifest.version !== pkg.version) {
  throw new Error(`version drift: manifest.json is ${manifest.version} but package.json is ${pkg.version}`);
}
if (missing.length) throw new Error('missing files, not packaging: ' + missing.join(', '));

const out = path.join(ROOT, 'dist', `skinshift-v${manifest.version}.zip`);
const stage = path.join(ROOT, 'dist', 'skinshift');
fs.rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const item of ['manifest.json', 'src', 'icons', 'LICENSE']) {
  fs.cpSync(path.join(ROOT, item), path.join(stage, item), { recursive: true });
}
for (const junk of ['.DS_Store', 'Thumbs.db']) {
  for (const f of [path.join(stage, 'src', 'popup', junk), path.join(stage, 'icons', junk)]) {
    fs.rmSync(f, { force: true });
  }
}

zipDir(path.join(ROOT, 'dist'), 'skinshift', out);
console.log('wrote', path.relative(ROOT, out));

const hash = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
const sumsLine = `${hash}  ${path.basename(out)}\n`;
fs.writeFileSync(path.join(ROOT, 'SHA256SUMS.txt'), sumsLine);
console.log('wrote SHA256SUMS.txt');

// Cross-platform zip: prefer the `zip` CLI, fall back to PowerShell's
// Compress-Archive on Windows, otherwise fail with an actionable message.
function zipDir(cwd, dir, outFile) {
  try {
    execFileSync('zip', ['-qr', outFile, dir], { cwd });
    return;
  } catch (e) { /* fall through to platform fallback */ }
  if (process.platform === 'win32') {
    // Absolute path: shells with a trimmed PATH (e.g. Git Bash without
    // System32) cannot resolve bare 'powershell.exe'.
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32',
      'WindowsPowerShell', 'v1.0', 'powershell.exe');
    execFileSync(ps,
      ['-NoProfile', '-NonInteractive', '-Command',
        `Compress-Archive -Path '${dir}' -DestinationPath '${outFile}' -Force`],
      { cwd, stdio: 'inherit' }
    );
    return;
  }
  throw new Error("no 'zip' binary found and no Windows fallback available; install zip to package");
}
