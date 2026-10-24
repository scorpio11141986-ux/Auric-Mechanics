import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ProofError } from './protocol.mjs';
const helper = fileURLToPath(new URL('./secure-store.ps1', import.meta.url));
export async function secureStore(action, value) {
  if (process.platform !== 'win32') throw new ProofError('BLOCKED_BY_PLATFORM');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper, '-Action', action], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    let output = ''; const timer = setTimeout(() => { child.kill(); reject(new ProofError('SECURE_STORAGE_TIMEOUT')); }, 15_000);
    child.stdout.on('data', data => { output += data; if (output.length > 100_000) child.kill(); });
    // Never forward child errors or output: these pipes can carry this harness's credentials.
    child.stderr.resume(); child.on('error', () => { clearTimeout(timer); reject(new ProofError('SECURE_STORAGE_UNAVAILABLE')); });
    child.on('close', code => { clearTimeout(timer); if (code !== 0) return reject(new ProofError('SECURE_STORAGE_UNAVAILABLE')); try { resolve(JSON.parse(output)); } catch { reject(new ProofError('SECURE_STORAGE_FORMAT')); } });
    child.stdin.end(value === undefined ? '' : JSON.stringify(value));
  });
}
