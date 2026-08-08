# KCG Router — Agent Guidelines

## Project

AI Router Gateway — a lightweight Bun-native AI proxy that forwards chat completion
requests (OpenAI-compatible & Anthropic-compatible) to upstream AI providers based on
**Combo** (provider account groups with fallback or round-robin strategies).

Single-user, self-contained: all data (providers, credentials, combos, usage history,
quotas, settings) stored locally in `bun:sqlite` — no external database dependency.

Supports 5 provider transports: `openai`, `anthropic`, `gemini`, `kiro`, `command-code`.

## Stack

- **Runtime**: Bun (`bun --hot src/index.ts`)
- **Language**: TypeScript (strict mode)
- **Database**: `bun:sqlite` (WAL mode, path: `~/.kcgrouter/db/data.sqlite`)
- **Server**: `Bun.serve` with built-in route matching, HMR
- **Frontend**: React 19, Tailwind CSS v4, shadcn/ui (New York style)
- **Linting/Formatting**: Biome 2.x
- **Testing**: `bun test` (Node.js `node:test` style with `bun:test` imports) + `fast-check` for property-based tests

## Build, Lint, and Test Commands

| Command          | Description                        |
| ---------------- | ---------------------------------- |
| `bun dev`        | Start dev server with HMR          |
| `bun start`      | Production mode (`NODE_ENV=production`) |
| `bun run build`  | Build frontend assets to `dist/`   |
| `bun run check`  | Biome check (lint + format)        |
| `bun run lint`   | Biome lint                         |
| `bun run format` | Biome format                       |
| `bun run test`   | Run all tests (discovers `src/**/*.test.ts`/`.tsx`) |
| `bun run gen-env`| Generate `.env` with random keys   |

### Running a single test

```bash
bun test src/server/services/__tests__/combo-engine.test.ts
```

## Architecture

```
Client (CLI tool / curl)
    │
    ▼
┌─ Bun.serve (src/index.ts) ────────────────────────────┐
│                                                        │
│  /v1/*  ──► API Key Auth ──► RouterService            │
│  /api/* ──► Session Auth ──► CRUD routes              │
│  /*     ──► Static index.html (React SPA)              │
│                                                        │
│  RouterService (src/server/services/router.service.ts) │
│    ├── FormatTranslator (OpenAI ↔ Anthropic ↔ Canonical)
│    ├── TokenSaver (compress tool_result messages)      │
│    ├── ComboEngine (resolve target → fallback chain)   │
│    ├── Provider Adapter (openai/anthropic/gemini/kiro/cc)
│    ├── UsageRecorder (log to bun:sqlite)               │
│    └── QuotaTracker (rolling-window token tracking)    │
│                                                        │
│  Services: Crypto, Session, Settings, ProviderRegistry │
│  DB: bun:sqlite (db/data.sqlite, WAL mode)             │
└────────────────────────────────────────────────────────┘
    │
    ▼
Upstream AI Providers (OpenAI, Anthropic, Gemini, Kiro, etc.)
```

### Key directories

| Path                          | Purpose                                      |
| ----------------------------- | -------------------------------------------- |
| `src/index.ts`                | Server entry point (Bun.serve)               |
| `src/server/routes/`          | API route handlers (v1, auth, combos, etc.)  |
| `src/server/services/`        | Business logic services                      |
| `src/server/middleware/`      | API key auth, session auth                   |
| `src/server/providers/`       | Provider adapters (transport-specific)       |
| `src/db/`                     | `bun:sqlite` client, migrations, seeders     |
| `src/components/`             | React components (providers, combos, usage, etc.) |
| `src/pages/`                  | React page-level components                  |
| `src/hooks/`                  | React hooks (useProviders, useCombos, etc.)  |
| `src/types/`                  | TypeScript type definitions                  |
| `src/lib/`                    | Shared utilities, API client                 |
| `scripts/`                    | Shell scripts (test, gen-env)                |

### Endpoints

| Method | Path                          | Auth      | Description              |
| ------ | ----------------------------- | --------- | ------------------------ |
| POST   | `/v1/chat/completions`        | API Key   | OpenAI-compatible proxy  |
| POST   | `/v1/messages`                | API Key   | Anthropic-compatible proxy |
| GET/POST/PUT/DELETE | `/api/auth/*`        | Session\* | Auth endpoints           |
| GET/POST/PUT/DELETE | `/api/providers/*`   | Session   | Provider CRUD            |
| GET/POST/PUT/DELETE | `/api/combos/*`      | Session   | Combo CRUD               |
| GET    | `/api/usage/*`                | Session   | Usage history            |
| GET    | `/api/quota/*`                | Session   | Quota state              |
| GET/POST/PUT/DELETE | `/api/settings/*`    | Session   | App settings             |

\* `/api/auth/login` is public; all other `/api/*` require session auth.

## Code Conventions

- Use `bun` for everything (run, test, build, install, bunx)
- Prefer `Bun.file` over `node:fs` readFile/writeFile
- Use `Bun.$` template literals for shell commands (not `execa`)
- TypeScript strict mode: no implicit overrides, no unchecked index access
- Format: Biome, 2-space indent, double quotes, trailing commas
- Path aliases: `@/` maps to `src/`
- Database: raw SQL via `bun:sqlite` helpers (`query`, `run`, `get`, `all` in `src/db/client.ts`)
- Tests: `bun test` with `bun:test` imports, files named `*.test.ts`/`*.test.tsx`
- Test DB: each test run gets a unique `db/data.test.<random>.sqlite`

## Environment

| Variable          | Required | Purpose                          |
| ----------------- | -------- | -------------------------------- |
| `ENCRYPTION_KEY`  | Yes      | AES-256-GCM key for API key encryption |
| `SESSION_SECRET`  | Yes      | HMAC secret for session cookies  |
| `PORT`            | No       | Server port (default: 3000)      |
| `DB_PATH`         | No       | Override DB path (used in tests) |
| `KCGRouter_HOME`  | No       | Override home dir (default: `~/.kcgrouter/`) |

Generate secrets: `bun run gen-env`

### Custom port (`~/.kcgrouter/config.json`)

The server port can be persisted in `~/.kcgrouter/config.json` (or under
`KCGRouter_HOME` when set). Set it from the CLI with `kcgrouter --port <port>`.

```json
{
  "port": 8080
}
```

Resolution precedence (see `src/config.ts`): `PORT` env var > `config.json`
`port` field > default `3000`. Restart the server after changing the port.

Note: `bun dev` only respects the `PORT` env var (falling back to the
default `3000`) and ignores the persisted `config.json` port — the config
port applies to production/daemon runs (`bun start`, `kcgrouter`).

## Provider Adapters

Each transport has a dedicated adapter in `src/server/providers/<transport>/`:

- **openai** — Standard OpenAI chat completions API
- **anthropic** — Anthropic Messages API
- **gemini** — Google Gemini API
- **kiro** — Kiro-specific adapter with custom SSE handling
- **command-code** — Command/Code adapter

Adapters implement a common interface: `send()` for non-streaming and `sendStream()` for streaming.

## Common Tasks

### Adding a new API route

1. Add handler in `src/server/routes/<module>.routes.ts`
2. Register in `apiRoutes` or `v1Handlers` in `src/index.ts`

### Adding a new provider adapter

1. Create `src/server/providers/<name>/` with `adapter.ts`, `config.ts`, `index.ts`, `models.ts`
2. Follow the pattern in existing adapters (openai is the reference)
3. Register in `src/server/providers/registry.ts`

### Running the server

```bash
bun dev          # development with HMR
bun start        # production mode
```

### Running tests

```bash
bun run test     # all tests
bun test <file>  # single test file
```
