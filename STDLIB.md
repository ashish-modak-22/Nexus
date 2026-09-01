# STDLIB.md — Nexus Zero-Dependency Log

Track: **C — Web & Network**
Runtime deps: **0**. Only `node:*` built-ins. Dev-only: `node:test` (built-in, no extra disclosure needed beyond this line).

Format per hackathon rule: `Normally: <package> → Instead: <stdlib>`

---

## Substitution Log (14 documented — clears STDLIB Log +3 bonus)

| # | Module | Normally | Instead (built) | Actual detail |
|---|--------|----------|--------------------|--------------------------------------------------|
| 1 | `config.js` | `dotenv` / `convict` / `joi` | `node:fs.readFileSync` + `JSON.parse` + hand-rolled validator | `validateConfig()` checks `listen`/`backends`/`routes` via `assertListen`/`assertBackends`/`assertRoutes`, throwing a named-missing-key `Error`. `loadConfig()` wraps `readFileSync` + `JSON.parse` and turns `ENOENT` / bad JSON into a clean, non-stack-trace message. **Not built:** the checklist's `SIGHUP` hot-reload — there's no file watcher; `cli.js -s reload` only logs and exits, it doesn't touch a running process. |
| 2 | `security/tls.js` | `mkcert` / `selfsigned` | `node:child_process.execSync('openssl ...')` + `node:https` | `ensureCertificate()` shells out to `openssl req -x509 -newkey rsa:2048 ...` on first run when cert/key are missing; `isOpensslAvailable()` + `opensslManualCommand()` give the exact manual fallback if `openssl` isn't on `PATH`. **Stretch built:** SNI multi-cert (`buildSniCallback`/`tls.createSecureContext`, cached per hostname) and `warnIfExpiringSoon()` (parses `openssl x509 -enddate`). |
| 3 | `observability/logger.js` | `winston` / `pino` | Hand-rolled leveled logger over `process.stdout.write` (+ `node:fs` for file target) | `createLogger()` — `debug/info/warn/error` gated by `LEVELS` rank, `logRequest()` emits the stable `method path status durationMs` line other modules assert on. **Stretch built:** format presets (`combined`/`short`), size-based rotation (`rotateIfNeeded`), independently toggleable stdout + file targets. |
| 4 | `observability/metrics.js` | `prom-client` | Plain in-memory counters (`Map`/object) + manual percentile calc | `createMetrics()` — per-route/per-backend `Map` counters, `recordRequest()` called on every terminal branch, `snapshot()` computes avg latency plus p50/p95/p99 via `percentile()` over a sorted rolling window (default size 100). |
| 5 | `routing/router.js` | `express` / `find-my-way` | Hand-rolled matcher over `node:url` | `createRouter().match()` filters candidates by host + path, ranks by `specificity()` (host-specific always outranks host-agnostic, then longest path prefix wins), returns `null` cleanly on no match. **Stretch built:** JS `RegExp` location matching (`route.regex`) and route-level `auth`/`rateLimit` metadata returned on the match result. |
| 6 | `routing/loadbalancer.js` | Cloud LB / `http-proxy` upstream logic | Hand-rolled round-robin index picker | `createLoadBalancer().pick()` — smooth weighted round-robin (`pickRoundRobin`), health-aware via `healthChecker.getHealthyBackends()`. **Stretch built:** least-connections (`pickLeastConnections` + in-flight `Map`) and IP-hash sticky sessions (`pickIpHash` + `hashString`), plus live per-backend connection counts (`getConnectionCounts`). |
| 7 | `reliability/healthcheck.js` | `@godaddy/terminus` (or similar) | `node:http`/`node:https` GET on `setInterval` | `createHealthChecker()` polls each backend's health path, `transition()` only flips state after `unhealthyThreshold`/`healthyThreshold` consecutive results (flap-resistant). **Stretch built:** passive checks — `reportFailure()` is called directly from `pipeline.js`'s proxy `error` handler on a real 502/connection-refused, no need to wait for the next poll. |
| 8 | `reliability/wal.js` | `level` / `sqlite3` | `node:fs.appendFile` + hand-rolled batching/rotation | `createWal()` batches entries in memory, flushes via `fs.promises.appendFile` on `flushIntervalMs`, rotates by `maxFileSizeBytes` with `retainFiles` pruning. **Stretch built:** `replay()` — reads back the last N entries across current + rotated files and reports `uncleanShutdown` by diffing `start` vs `finish` request IDs. |
| 9 | `security/ratelimiter.js` | `express-rate-limit` | Hand-rolled token-bucket `Map` keyed by IP | `createRateLimiter().checkLimit()` — token bucket per `clientIp`, `retryAfterSeconds` derived from the refill rate for a correct `Retry-After`. **Stretch built:** `burst` capacity above steady-state, and per-route bucket scoping via `options.routeKey`/`options.override`. **Wiring gap:** `pipeline.js` currently only calls `checkLimit(ctx.clientIp)` globally — the per-route override path exists in the module but isn't yet fed from `router.js`'s matched route. |
| 10 | `security/auth.js` | `jsonwebtoken` / `passport` | `node:crypto` HMAC sign/verify | `createAuthenticator().authenticate()` — constant-time API-key check via `crypto.timingSafeEqual` (`isValidApiKey`), returns a clean `{ authenticated, reason }`. **Stretch built:** HMAC-signed tokens (`generateToken`/`verifyToken`) with `payload.exp` actually checked against `Date.now()`, not just signature; failure reasons (`missing`/`invalid`/`expired`) go to `logger.info` only, never to the client response. |
| 11 | `observability/dashboard.js` | `socket.io` | Raw SSE via `res.write` over `node:http` | `createDashboard()` — `text/event-stream` endpoint pushing metrics snapshots on `pushIntervalMs`; the dashboard's own SSE connection is excluded from `metrics.js` because `pipeline.js` returns before building a metrics `ctx` for dashboard-matched paths. **Stretch built:** live diffing (`diffSnapshot()` sends `{type:'diff'}` frames after the first full snapshot) and a REST snapshot endpoint (`GET /nexus/metrics`). |
| 12 | `core/pipeline.js` | `express` / `koa` middleware chain | Hand-rolled ordered function-array executor | `createPipeline().handleRequest()` runs a fixed `phases` array — `rateLimitPhase → routeMatchPhase → authPhase → backendPhase` — with `res.on('finish', onFinish)` guaranteeing `metrics.recordRequest()` fires on every branch (429/404/401/502/success). **Stretch built:** a per-request `ctx` object threaded through every phase instead of re-deriving `clientIp`/parsed URL inline. **Not built:** phase order as a named, config-driven list — the order is still hardcoded in the `phases` array. |
| 13 | `core/server.js` | `pm2` / framework clustering | `node:http` + `node:https` + `node:cluster` | `startServer()` constructs one shared context (LB, health checker, WAL, metrics, rate limiter, authenticator, `pipeline.handleRequest`) and hands it to both `http.createServer` and `https.createServer`; `shutdownServer()` stops the health checker, flushes WAL, then closes both listeners with a timeout fallback (`closeAllConnections`). `http.globalAgent.keepAlive = true` / same for `https` covers the keep-alive stretch item. **Not built:** `node:cluster` — this is single-process only, the highest-signal stretch item named in the checklist wasn't reached. |
| 14 | `cli.js` | `commander` / `yargs` | Hand-rolled `process.argv` parser | `parseArgs()` handles `start`, `--config`/`-c <path>`, `-t`/`--test` (validate-only, exits without starting), and `-s <signal>`. `main()` wires `SIGINT`/`SIGTERM` to `shutdownServer()` for a clean Ctrl+C. **Stretch built:** `-t` validate-only mode. **Stretch stub only:** `-s reload` logs a message and exits — it does not actually signal or hot-swap a running instance, since `config.js` has no reload/watch path to call into. |

---

## Package Killer candidate (+3)

**Chosen module:** `security/ratelimiter.js`

**Blurb:** It's a genuinely drop-in replacement for `express-rate-limit` in any raw `node:http` app, not just Nexus — the whole thing is a `createRateLimiter(config, logger)` factory with no dependency on `req`/`res` or any other Nexus module. `checkLimit(clientIp, options)` implements a correct token bucket (steady-state rate + optional burst capacity), returns a decision only (`{ allowed, remaining, retryAfterSeconds }`) so the caller decides how to respond, and supports scoped buckets per route via `options.routeKey` without changing the core API. Someone could `import` this one file into an unrelated project today and get working, tested rate limiting.

*(Other legitimate candidates that were considered and dropped in favor of the above: `routing/router.js` — a mini `find-my-way`/`express.Router`; `routing/loadbalancer.js` — a mini `http-proxy` upstream/LB; `security/auth.js` — a mini `jsonwebtoken`-lite. All three are real, working, and documented above in the substitution log if the team wants to swap the headline module.)*

## Dev-only tooling disclosure

- Test runner: `node:test` (built-in) — no external test framework added.
- Test reporter: `node --test --test-reporter=spec` — built-in reporter, not a package.
- CI: `.github/workflows/ci.yml` runs `npm install` (no-op, zero deps) then `npm test` on Node 24. No dev dependency requiring disclosure beyond `node:test`.
- `package.json` has no `devDependencies` key at all — confirmed zero, nothing to disclose.
- Coverage tool / linter: none added.

## Not implemented (Tier 3, explicitly out of scope)

OCSP stapling, mutual TLS, HTTP/2 via ALPN, full nginx directive/include grammar, distributed rate limiting across processes, full PCRE regex (only a JS `RegExp` subset is supported for route matching), full JWT claims/issuer/audience verification, OAuth2 delegated auth, zero-downtime binary upgrade, historical time-series persistence across restarts, log compaction, pluggable third-party middleware registration.

## Stretch items that were attempted in spec but not finished in code

These were named as Tier 2 stretch goals and are **not** Tier 3 scope-outs — worth tracking separately so the team knows what's actually left, not just what was deliberately skipped:

- `node:cluster` multi-process worker model (`core/server.js`) — not started.
- Config hot-reload on `SIGHUP` with atomic swap / rollback to last-known-good (`config.js`) — not started; `cli.js -s reload` is a logging stub only.
- Pipeline phase order pulled into config as a named ordered list (`core/pipeline.js`) — order is still a hardcoded array.
- Per-route rate-limit override actually reaching `ratelimiter.js` from a matched route (`core/pipeline.js` → `security/ratelimiter.js`) — the module supports it, the wiring doesn't call it yet.
- `npm start` as an actual `package.json` script — currently missing, even though `src/scripts/ci-smoke-test.js` assumes `npm start` works. Use `node src/scripts/start.js` until this is added.

