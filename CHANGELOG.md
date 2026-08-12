# Changelog

All notable changes to kcgrouter are documented in this file.

## [Unreleased]

### Added

- **Provider retry/failover/cooldown** (`docs/retry.md`):
  - `fetchWithRetry` — transparent retries per HTTP status code
    (`502` 3× @ 3s, `503` 3× @ 2s, `504` 2× @ 3s, `429` no retry), with
    network errors/timeouts mapped to the 502 rule and caller-abort
    propagation. Used by all 7 provider adapters.
  - Prefix-route account failover — a failed account is marked and the next
    available one is tried (404 when no accounts, 503 when all are cooling
    down, 502 when all attempts failed).
  - Account cooldown with exponential backoff (`provider_accounts.cooldown_until`
    + `backoff_level`, migration 015) — rate limits 1s→2s→4s… capped at 4 min,
    server errors 10 s, auth 5 min. Cooldown expired = account reused
    automatically (self-healing).
- **Retry observability**:
  - `request_logs.retries` column (migration 016) and a `RETRIED N×` badge in
    the Logs page.
  - `RetryMeta` / `ProviderError` carry status, `Retry-After`, and retry count
    end-to-end; `classifyError` uses the real status code.
  - SSE events `account:cooldown` / `account:recovered` with live log
    announcements; live cooldown countdown in connection rows.
- **Retry-After sync** — an upstream `Retry-After` hint floors the account
  cooldown, so a rate-limited account isn't picked again before the upstream
  asked us to wait.
- **Retry jitter** — ±25% jitter on retry delays to avoid thundering herds;
  `Retry-After`-driven delays are capped at 10 s in-request but the raw hint
  still reaches the account cooldown.
- **Per-provider retry policy UI** — `providers.retry_config` (migration 017)
  with a retry policy editor on the provider detail page; blank rules fall
  back to the global defaults.
- **Dashboard resilience metrics** — `GET /api/dashboard/stats` and new
  dashboard metrics (Retries, Cooling Down) plus a live cooldown chip in the
  provider connection table and retry badges in the packet/usage activity logs.

### Changed

- Adapter interface (`send`/`sendStream`) accepts an optional fifth `opts`
  argument to forward the provider's retry policy.
- `request:complete` SSE events now include `retries`.

### Fixed

- Encryption-mismatch surface: pre-existing `QuotaCard.tsx` TypeScript error.
- Qoder error messages no longer double-prefix the provider name.

---

## [0.8.3]

Baseline release (project setup, providers, combos, quota, dashboard).
