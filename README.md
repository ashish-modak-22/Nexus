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
cd Inkora-Backend

```

One time command:
```bash
node source/script/start.js
```
---

## Track & Bonus Challenges Attempted

**Track:** C — Web & Network

| Bonus | Attempted? | Notes |
|---|---|---|
| Single File (+5) | _____ | |
| Reproducible Build (+5) | _____ | build twice, publish both hashes |
| Package Killer (+3) | _____ | see `STDLIB.md` → Package Killer section |
| STDLIB Log (+3) | Yes | 14 substitutions documented, see `STDLIB.md` |

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

Write order followed dependency order (config → tls → logger → metrics → router →
loadbalancer → healthcheck → wal → ratelimiter → auth → dashboard → pipeline → server → cli).

---

## Zero-Dependency Proof

- `package.json` → `dependencies: {}` (empty).
- No `node_modules` third-party runtime code — only `node:*` core modules imported anywhere
  under `src/`.
- Dev-only: `node:test` (Node's built-in test runner) — no external framework.
- Full package → stdlib substitution table: see [`STDLIB.md`](./STDLIB.md).

Verify yourself:

```bash
cat package.json | grep -A2 '"dependencies"'
grep -rn "require(" src/ | grep -v "node:"   # should return nothing
```

---

## Requirements

- Node.js **20 or later** or later (state your minimum tested version)
- `openssl` on `PATH` (used once, at first run, to generate a self-signed dev cert)

---

## Build & Run 

`npm start` boots the demo backend(s) (`src/examples/backend-echo.js`) and the gateway
together via `src/scripts/start.js`, so there's nothing else to configure to see it working.

To run the gateway standalone against your own backends:

```bash
node src/cli.js start --config ./nexus.config.json
```

Validate config without starting anything:

```bash
node src/cli.js start --config ./nexus.config.json -t
```

Dashboard: open `src/public/index.html` (or `http://localhost:_____/nexus` — fill in your
configured dashboard path) while the gateway is running.

---

## Configuration

Example `nexus.config.json`:

```json
{
  "listen": { "http": _____, "https": _____ },
  "backends": [
    { "name": "echo-1", "url": "http://localhost:_____", "weight": 1 }
  ],
  "routes": [
    { "path": "/api", "backend": "echo-1", "auth": false }
  ]
}
```

Required top-level keys: `listen`, `backends`, `routes`. Missing keys fail fast with the exact
key name at startup — see `config.js`.

---

## Testing

```bash
node --test
```

Tests live under `_____` (state your test directory) and use `node:test` +
`node:assert` only. Covers: _____ (list what's actually covered — router matching,
load-balancer selection, rate-limiter windowing, etc).

---

## Reproducible Build (if attempting +5 bonus)

```bash
# Build 1
_____
sha256sum _____ > build1.hash

# Build 2 (clean, from scratch)
_____
sha256sum _____ > build2.hash

diff build1.hash build2.hash   # should be empty
```

---

## What's Explicitly Not Built (Tier 3 / out of scope)

OCSP stapling, mutual TLS, HTTP/2 via ALPN, full nginx directive/include config grammar,
distributed rate limiting across processes, full PCRE regex routing, full JWT
claims/issuer/audience verification, OAuth2 delegated auth, zero-downtime binary upgrade,
historical time-series persistence, log compaction, pluggable third-party middleware
registration.

Scope reasoning: these either require a shared external store, a spec far bigger than a
72-hour build, or genuinely don't fit "reimplement with stdlib" (e.g. OCSP needs a CA
relationship, not just more code).

---

## License

_____
