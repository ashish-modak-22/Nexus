# Nexus

A production-grade reverse proxy / API gateway built with **zero third-party runtime
dependencies** — only Node.js built-ins (`node:*`). Built for **Zero Dependency 2026**,
Track C (Web & Network).

> nginx-parity is the goal, not a passing demo. Every module below has a documented
> stdlib substitution for the package it would normally use — see [`STDLIB.md`](./STDLIB.md).

---

### 1️⃣ Clone the Repository
 
Choose whichever method fits your workflow:
 
**HTTPS**
```bash
git clone https://github.com/kanchan-nath/Nexus.git
```
 
**SSH**
```bash
git clone git@github.com:kanchan-nath/Nexus.git
```

**GitHub CLI**
```bash
gh repo clone kanchan-nath/Nexus
```

Then move into the project directory:
```bash
cd Nexus

```

One time command:
```bash
node source/script/start.js
```

To verify:
```bash
1. curl http://localhost:8080
2. curl -k https://localhost:8443
```
---

## Track & Bonus Challenges Attempted

**Track:** C — Web & Network

| Bonus | Attempted? | Notes |
|---|---|---|
| Single File (+5) | No | Multi-module project by design — a single-file reverse proxy with this feature set wasn't the goal. |
| Reproducible Build (+5) | No | `build.sh` exists but is currently empty; there's no bundling step since it's plain Node source, so this would need to be a source-tree hash script rather than a binary build. Not implemented yet. |
| Package Killer (+3) | Yes | `security/ratelimiter.js` — see `STDLIB.md` → Package Killer section for the write-up. |
| STDLIB Log (+3) | Yes | 14 substitutions documented with actual function/API names used, see `STDLIB.md`. |

---

## What Nexus Is

Nexus is a reverse proxy and API gateway — the same job nginx does — reimplemented from
first principles on Node's standard library. It terminates TLS, routes requests to backend
pools, load-balances across them, rate-limits and authenticates traffic, and exposes a live
metrics dashboard, all without pulling in `express`, `http-proxy`, `winston`, or any other
package you'd normally reach for.

The one piece with no nginx equivalent is the **Write-Ahead Log (WAL)** — every request is
durably recorded on disk as it starts and finishes, independent of the access log. That's
Nexus's differentiator, not a stdlib swap-in for something nginx already has.

### Core Features

- **Config** — JSON config file, validated at load with fail-fast named-key errors. Hot-reload
  on `SIGHUP` with atomic swap and rollback to last-known-good on bad reload.
- **TLS** — auto-generates a self-signed cert on first run (via `openssl`), same server context
  shared between HTTP and HTTPS listeners.
- **Routing** — exact and prefix path matching with correct longest-prefix-wins resolution,
  host-based virtual routing, optional regex location matching.
- **Load balancing** — round-robin and weighted round-robin across backend pools, health-aware
  (never routes to a backend marked unhealthy).
- **Health checks** — active polling with configurable interval, flap-resistant (N consecutive
  failures/successes before state change), passive checks on real proxy errors.
- **Rate limiting** — token-bucket per client IP, correct `Retry-After` header on 429, per-route
  overrides.
- **Auth** — API-key checking with per-route requirement, HMAC-signed tokens with real expiry
  checks. Runs strictly after route matching (unmatched path = 404, never 401).
- **Metrics** — per-route and per-backend counts, error rates, rolling-window latency,
  p50/p95/p99. `recordRequest()` fires on every terminal branch, including 404/401/429/502.
- **Live dashboard** — SSE endpoint streaming metrics snapshots to a static HTML page; the
  dashboard's own connection is excluded from its own metrics.
- **WAL** — append-only durability log with batched flush, size-based rotation, and retention
  cleanup.
- **CLI** — `start` with `--config`, clean non-stack-trace errors on bad config, graceful
  shutdown on `SIGINT`/`SIGTERM`.

Full per-file build spec (including all stretch-tier items) lives in
`src/doc/nexus_doc/feature_checklist.md`.

---

## Architecture

```
                        ┌─────────────────────┐
                        │      server.js       │  http + https listeners
                        │  (shared context)     │  graceful shutdown
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │     pipeline.js       │  phase engine
                        └──────────┬───────────┘
     static/dashboard ──► rate-limit ──► route match ──► auth ──► LB pick ──► forward
                                   │
        ┌───────────┬─────────────┼─────────────┬────────────┐
        ▼           ▼             ▼             ▼            ▼
   router.js   loadbalancer.js  ratelimiter.js  auth.js   healthcheck.js
        │           │                                          │
        └─────► metrics.js ◄──────────────────────────────────┘
                    │
              dashboard.js (SSE) ──► public/index.html
                    │
                 wal.js (durability, independent of logger.js)
```

Write order followed dependency order: config → tls → logger → metrics → router →
loadbalancer → healthcheck → wal → ratelimiter → auth → dashboard → pipeline → server → cli.

---

## Zero-Dependency Proof

- `package.json` → `"dependencies"` key is absent entirely (and there's no `devDependencies`
  either).
- No third-party runtime code anywhere under `src/` — only `node:*` core modules imported.
- Dev-only: `node:test` (Node's built-in test runner) — no external framework, no linter, no
  coverage tool.
- Full package → stdlib substitution table with actual API names used: see
  [`STDLIB.md`](./STDLIB.md).

Verify yourself:

```bash
grep -A3 '"dependencies"\|"devDependencies"' package.json   # both absent
grep -rn "from '" src/ --include=*.js | grep -v "node:" | grep -v "^src/test" | grep -v "\.\./\|\./"
# ^ any bare (non-relative, non-node:) import would show up here — should return nothing
```

---

## Requirements

- Node.js **18 or later** (CI runs against Node 24 — see `.github/workflows/ci.yml`)
- `openssl` on `PATH` (used once, at first run, to generate a self-signed dev cert)

---

## Build & Run

There is no build step — it's plain ESM Node source, run directly.

```bash
git clone https://github.com/kanchan-nath/Nexus.git
cd Nexus
node src/scripts/start.js
```

`src/scripts/start.js` boots the demo backend(s) (`src/examples/backend-echo.js`) on the ports
your `nexus.config.json` points at, then starts the gateway, so there's nothing else to
configure to see it working.

> **Known gap:** `package.json` doesn't currently declare a `"start"` script, so `npm start`
> won't work yet even though `src/scripts/ci-smoke-test.js` assumes it does. Add
> `"start": "node src/scripts/start.js"` to `package.json`'s `scripts` block to fix this before
> submission — until then, run the command above directly.

To run the gateway standalone against your own backends (no demo backend spawned):

```bash
node src/cli.js start --config ./nexus.config.json
```

Validate config without starting anything:

```bash
node src/cli.js -t --config ./nexus.config.json
```

Dashboard: with the gateway running, open `http://localhost:8080/nexus/dashboard` (or whatever
`dashboard.path` is set to in your config).

---

## Configuration

Real shape, from `nexus.config.json` (`backends` is an object keyed by pool name, each value an
array of `{ url, weight }`):

```json
{
  "listen": { "http": 8080, "https": 8443 },
  "backends": {
    "web": [
      { "url": "http://localhost:9001", "weight": 1 },
      { "url": "http://localhost:9002", "weight": 1 }
    ]
  },
  "routes": [
    { "path": "/", "backend": "web" },
    { "path": "/api", "backend": "web" }
  ],
  "healthcheck": { "path": "/health", "intervalMs": 5000, "unhealthyThreshold": 3, "healthyThreshold": 2 },
  "ratelimit": { "windowMs": 60000, "maxRequests": 100 },
  "auth": { "headerName": "X-API-Key", "keys": ["dev-key-123"], "requiredByDefault": false },
  "tls": { "certPath": "./certs/cert.pem", "keyPath": "./certs/key.pem" },
  "logging": { "level": "info", "format": "combined" },
  "wal": { "enabled": true, "path": "./data/wal", "flushIntervalMs": 1000, "maxFileSizeBytes": 10485760, "retainFiles": 5 },
  "dashboard": { "enabled": true, "path": "/nexus/dashboard", "pushIntervalMs": 2000 }
}
```

Required top-level keys: `listen`, `backends`, `routes`. A route's `backend` must reference a
key that exists in `backends`. Missing/invalid keys fail fast with the exact key name at
startup — see `validateConfig()` in `src/config.js`. Every other section (`healthcheck`,
`ratelimit`, `auth`, `tls`, `logging`, `wal`, `dashboard`) is optional and gets sane defaults
merged in.

---

## Testing

```bash
npm test
# equivalent to:
node --test --test-reporter=spec --test-reporter-destination=stdout "src/test/**/*.test.js"
```

Tests live under `src/test/`, mirroring the `src/` module structure (e.g.
`src/test/security/auth.test.js` tests `src/security/auth.js`). 14 test files, 200+ individual
`node:test` cases, `node:assert/strict` only — no external test framework.

Covers: config validation and defaulting, TLS cert auto-gen and SNI, logger level filtering and
rotation, metrics counters and percentiles, router exact/prefix/host/regex matching and
longest-prefix-wins, load-balancer strategies (round-robin/weighted/least-conn/ip-hash) and
health-awareness, health-check flap resistance and passive failure reporting, WAL batching/
rotation/replay, rate-limiter token-bucket behavior and `Retry-After`, auth API-key and HMAC
token verification (including expiry), dashboard SSE diffing, pipeline phase ordering and the
"metrics fires on every branch" regression case, server boot/shutdown, and CLI argument parsing.

---

## Reproducible Build (not attempted — see `build.sh`)

`build.sh` is currently an empty file. There's no compilation/bundling step for this project
(it's plain ESM run directly by Node), so a reproducible-build script here would mean hashing
the source tree deterministically rather than a compiled binary, e.g.:

```bash
# Not yet implemented — sketch of what this would look like:
find src -type f -name '*.js' | sort | xargs cat | sha256sum > build1.hash
find src -type f -name '*.js' | sort | xargs cat | sha256sum > build2.hash
diff build1.hash build2.hash   # should be empty
```

---

## What's Explicitly Not Built (Tier 3 / out of scope)

OCSP stapling, mutual TLS, HTTP/2 via ALPN, full nginx directive/include config grammar,
distributed rate limiting across multiple gateway processes, full PCRE regex routing (only a JS
`RegExp` subset is supported), full JWT claims/issuer/audience verification, OAuth2 delegated
auth, zero-downtime binary upgrade, historical time-series persistence across restarts, log
compaction, pluggable third-party middleware registration.

Scope reasoning: these either require a shared external store, a spec far bigger than the
build window, or genuinely don't fit "reimplement with stdlib" (e.g. OCSP needs a CA
relationship, not just more code).

### Also incomplete (attempted stretch goals, not scope-outs)

See `STDLIB.md`'s "Stretch items that were attempted in spec but not finished in code" section
for the honest list — `node:cluster` multi-process, config hot-reload, config-driven phase
order, per-route rate-limit wiring, the missing `npm start` script, and the reproducible build
script above.

---

## License

ISC (per `package.json`).
