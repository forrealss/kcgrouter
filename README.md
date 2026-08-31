# kcgrouter

Lightweight AI proxy gateway — routes chat completions to upstream providers with per-provider, accounts, combo routes, quota tracking, and automatic failure recovery.

Built on [Bun](https://bun.sh) (`bun:sqlite`, `Bun.serve`, HTML imports for the
React dashboard).

## Install

```bash
bun i -g kcgrouter    # requires Bun >= 1.2.3
kcgrouter             # interactive menu
```

The global install also registers kcgrouter to start at login. Set
`KCGRouter_SKIP_STARTUP=1` before installing to skip that, or run
`kcgrouter --remove-startup` afterwards.

Open the dashboard at `http://localhost:3000` (override with
`kcgrouter --port <port>`). The default password is `admin`.

### Running it

| Command                    | What it does                                     |
| -------------------------- | ------------------------------------------------ |
| `kcgrouter`                | Interactive menu (start/stop, port, tray)        |
| `kcgrouter --tray`         | Run from the system tray                         |
| `kcgrouter --daemon`       | Run in the background                            |
| `kcgrouter --status`       | Check whether the server is running              |
| `kcgrouter --stop`         | Stop the background process                      |
| `kcgrouter --port <port>`  | Set a custom port (saved to `~/.kcgrouter/`)     |
| `kcgrouter --setup-startup`| Register auto-start at login                     |
| `kcgrouter --help`         | Full flag list                                   |

### System tray

`kcgrouter --tray` starts the server (if it is not already up) and puts an icon
in the tray with **Open Dashboard**, the current port, **Start/Stop Server**, and
**Quit**. Combined with auto-start at login, the gateway runs quietly in the
background without a terminal window open.

Supported on Windows, macOS, and Linux with `DISPLAY` or `WAYLAND_DISPLAY` set.
The tray is skipped with a clear message on headless machines — every other mode
still works there.

## Highlights

- **Multi-account failover** — when one provider account fails, the router
  automatically tries the next available account (prefix routes and combo
  routes). A single upstream failure never takes down a provider.
- **Ordered connections with enable/disable** — drag connections (or use Move
  up / Move down / Try first in the row menu) to set the failover order; the
  topmost one serves traffic first. A per-connection switch parks a credential
  without deleting it, and a disabled connection is skipped by both prefix and
  combo routing. Disabling is independent of the error/cooldown state, so it
  survives a recovery and re-enabling never masks a real upstream failure.
- **Scoped API keys** — restrict a key to specific providers, models, and
  combos, and give it a cumulative token budget. Limits are enforced against
  what the request actually runs, so a combo cannot reach a provider or model
  the key was not granted. `GET /v1/models` only advertises what the calling
  key may use.
- **In-place retry with backoff** — retryable status codes (`502`, `503`,
  `504`) are retried transparently with jittered delays, honoring the upstream
  `Retry-After` header. `429` is never retried in place — it is a signal to
  fail over to another account. See [`docs/retry.md`](docs/retry.md) for the
  full design.
- **Auto-recovery cooldown** — failed accounts enter a cooldown window
  (exponential backoff for rate limits, floored by `Retry-After`) and are
  skipped until the window expires. Accounts self-heal without manual
  intervention.
- **Per-provider retry policy** — tune attempts and delay per status code from
  the provider detail page (stored in `providers.retry_config`); blank rules
  fall back to the global defaults.
- **Combo routes** — `fallback` (priority ordered) and `round_robin`
  strategies across multiple provider accounts, with per-token cost modeling.
- **Quota tracking** — remaining quota is fetched live from the providers that
  report it (Kiro, Command Code, Qoder). Capped windows show headroom against
  the cap; credit balances show the amount on hand. Plus the router's own
  per-account token budget.
- **Token Saver** — eight output filters (git diff/status, grep, find, ls,
  tree, log dedup, line truncation) compress tool results before they reach the
  context window, plus optional "Caveman" and "Ponytail" prompt modifiers at
  three intensity levels each.
- **CLI tool integration** — point Claude Code, OpenCode, or Cowork at the
  router by writing their own config files from the dashboard. kcgrouter only
  touches its own provider entry and leaves the rest of the file intact.
- **Activity log** — every request, provider result, and admin action is
  retained with full metadata, filterable by type/source/connection, with
  request and response payloads captured for both successes and failures.
- **Usage analytics** — throughput, latency, and cost per connection, with
  server-side filtering and sorting over the request history. Request/response
  payloads are what grow the database, so the history card has its own **Clear
  history** action alongside the log page's **Clear logs**.
- **Real-time dashboard** — live activity stream and usage graph over SSE
  (`log:new`, `request:complete`, `account:cooldown`, `account:recovered`).

## Configuration

Everything is managed from the dashboard:

- **Providers** — add upstreams (name, transport, base URL, prefix) and their
  connections (API keys, optional token quota). Routes are addressed as
  `prefix/model-id`.
- **Connections** — test a connection, edit credentials, watch cooldown
  countdowns and auto-recovery status. Reorder them to set which one is tried
  first, and switch individual connections off without deleting them.
- **Models** — import a provider's catalog or add model IDs by hand, then
  enable the ones you want routable. Imported models start disabled.
- **Combos** — group connections into fallback or round-robin routes with
  per-member cost rates.
- **CLI Tools** — detect installed clients and write their router config.
- **Settings** — password, theme, and the API keys clients authenticate with.
  Each key has an **Access** dialog for its allowed providers, models, and
  combos plus a token limit, with a counter you can reset.

## API

- `/api/*` — dashboard API (session auth). Providers, accounts, models,
  combos, quota, usage, logs, settings, dashboard stats.
- `/v1/*` — chat completion gateway (API key auth). OpenAI- and
  Anthropic-compatible request/response formats are supported, including SSE
  streaming.
- `/api/events` — SSE event stream for the realtime dashboard.

## Environment

Secrets are generated automatically on first run. The important variables:

| Variable         | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `PORT`           | HTTP port the gateway + dashboard listen on                   |
| `DB_PATH`        | SQLite database path (default: `~/.kcgrouter/db/data.sqlite`)  |
| `ENCRYPTION_KEY` | Key used to encrypt provider credentials and API keys at rest |
| `SESSION_SECRET` | Secret for dashboard session cookies                          |

### Retry, failover, cooldown

The router protects upstreams at two levels:

1. **Per-request** (`fetchWithRetry`): retryable status codes are retried
   transparently (defaults: `502` 3× @ 3s, `503` 3× @ 2s, `504` 2× @ 3s,
   `429` 0 retries). Delays are jittered ±25% and `Retry-After` is honored.
   Per-provider overrides come from the UI.
2. **Per-account** (cooldown): a failed account is skipped for a computed
   window (rate limit → exponential backoff capped at 4 min, server error →
   10 s, auth → 5 min, all floored by `Retry-After`), then reused
   automatically.

See [`docs/retry.md`](docs/retry.md) for the complete design, tuning knobs,
and how to reproduce each behavior with the test suite.

## Development

```bash
bun install
bun run gen-env       # generate a local .env (secrets, session, ports)
bun dev               # start the dev server (hot reload)

bun run check         # biome check + autofix
bash scripts/test.sh  # full test suite (bun test)
bun run build         # bundle frontend into dist/
```

- Use Bun everywhere (`bun test`, `bun run`, `bunx`) — no npm scripts.
- SQLite via `bun:sqlite`, no ORM.
- Migrations live in `src/db/migrations/` (SQL strings run in order; keep
  semicolons out of comments — the runner splits on `;`). Seeders in
  `src/db/seeders/` run on every start, so they must be idempotent — that is
  where data backfills belong when a value cannot be computed in SQL.
- API keys authenticate through an indexed SHA-256 digest of the key rather
  than the argon2 hash. An argon2 comparison costs ~190 ms whether it matches
  or not, so the old scan-every-row lookup cost that much per stored key on
  every proxy request. These keys are 32 random bytes, so the slow KDF
  protected nothing. Keys created before that change are backfilled
  automatically (or promoted on first use) and need no regeneration.
