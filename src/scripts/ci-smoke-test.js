import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const BOOT_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 3000;

function httpGet(url, timeoutMs) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: timeoutMs }, (res) => {
            res.resume(); 
            resolve(res.statusCode);
        });
        req.on('timeout', () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
    });
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    console.log('[smoke-test] starting gateway via `npm start`...');

    const child = spawn('npm', ['start'], {
        cwd: ROOT,
        stdio: 'inherit',
        shell: process.platform === 'win32', 
        detached: process.platform !== 'win32',
    });

    let exited = false;
    child.on('exit', (code) => {
        exited = true;
        if (code !== 0 && code !== null) {
            console.error(`[smoke-test] gateway process exited early with code ${code}`);
        }
    });

    await wait(BOOT_TIMEOUT_MS);

    if (exited) {
        console.error('[smoke-test] FAIL: gateway process exited before boot completed');
        process.exit(1);
    }

    try {
        const status = await httpGet('http://localhost:8080/', REQUEST_TIMEOUT_MS);
        if (status !== 200) {
            throw new Error(`expected 200 from dashboard route, got ${status}`);
        }
        console.log('[smoke-test] PASS: gateway responded 200 on /');
    } catch (err) {
        console.error(`[smoke-test] FAIL: ${err.message}`);
        killTree(child);
        process.exit(1);
    }

    killTree(child);
    process.exit(0);
}

function killTree(child) {
    if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', child.pid, '/T', '/F']);
        return;
    }

    try {
        process.kill(-child.pid, 'SIGTERM');
    } catch {
        child.kill('SIGTERM');
    }
}

main();