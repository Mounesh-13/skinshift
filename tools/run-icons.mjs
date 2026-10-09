// Cross-platform launcher for tools/make-icons.py (requires Pillow).
// `python3` does not exist on stock Windows (Store stub); the py launcher does.
// Run: npm run icons  (or: node tools/run-icons.mjs)
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const py = process.platform === 'win32' ? 'py -3.13' : 'python3';
const [cmd, ...prefix] = py.split(' ');
try {
  execFileSync(cmd, [...prefix, 'tools/make-icons.py'], { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  if (e.code === 'ENOENT') {
    throw new Error(`Python launcher '${py}' not found. Install Python 3, then: pip install pillow`);
  }
  const out = String((e.stderr || '') + (e.stdout || '') + (e.message || ''));
  if (/No module named '?PIL/i.test(out) || /ModuleNotFoundError/i.test(out)) {
    throw new Error('Pillow is not installed. Run: pip install pillow, then npm run icons');
  }
  throw e;
}
