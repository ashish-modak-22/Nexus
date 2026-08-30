import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { loadConfig, DEFAULT_CONFIG_PATH } from '../config.js';
import { startServer, shutdownServer } from '../core/server.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_SCRIPT = path.resolve(__dirname, '..', 'examples', 'backend-echo.js');


const BACKEND_WARMUP_MS = 300;

function parseConfigPathArg(argv) {
    const args = argv.slice(2);
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--config' || args[i] === '-c') {
            return args[i + 1];
        }
    }
    return null;
}

function localBackendPorts(config) {
    const ports = new Set();

    for (const pool of Object.values(config.backends)) {
        for (const entry of pool) {
            let url;
            try {
                url = new URL(entry.url);
            } catch {
                continue;
            }

            if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
                ports.add(Number(url.port));
            }
        }
    }

    return [...ports];
}

function spawnBackend(port){
    const child = spawn(process.execPath, [BACKEND_SCRIPT, String(port)], {
        cwd: ROOT,
        stdio: 'inherit'
    });

    child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.error(`[start] demo backend on port ${port} exited with code ${code}`);
        }
    });

    return child;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function killBackends(children) {
    for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
            } else {
                child.kill('SIGTERM');
            }
        }
    }
}

async function main() {
    const configArg = parseConfigPathArg(process.argv);
    const configPath = path.resolve(
        ROOT,
        configArg || DEFAULT_CONFIG_PATH
    );

    let config;
    try {
        config = loadConfig(configPath);
    } catch (err) {
        console.error(`[start] ${err.message}`);
        process.exit(1);
        return;
    }

    const ports = localBackendPorts(config);
    const backendChildren = ports.map((port) => {
        console.log(`[start] launching demo backend on port ${port}`);
        return spawnBackend(port);
    });

    if (backendChildren.length > 0) {
        await wait(BACKEND_WARMUP_MS);
    }

    let shuttingDown = false;

    async function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[start] received ${signal}, shutting down`);
        await shutdownServer();
        killBackends(backendChildren);
        process.exit(0);
    }

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    try {
        await startServer(config, console);
        console.log('[start] Nexus gateway is up');
    } catch (err) {
        console.error(`[start] failed to start gateway: ${err.message}`);
        killBackends(backendChildren);
        process.exit(1);
    }
}

main();