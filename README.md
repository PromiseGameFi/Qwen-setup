# Qwen Local Chat UI + Agent Runtime

Professional local chat app for Qwen with ChatGPT/Claude-style UX, local persistence, and advanced agentic modes.

## What’s Included

- No sign-in, local-first browser SPA
- OpenAI-compatible model provider support
- Streaming chat, markdown/code rendering, copyable code blocks
- IndexedDB chat persistence + JSON export/import
- New local sidecar (`agent-runtime`) for:
  - `Agent` mode (tool-using loop)
  - `Deep Think` mode (multi-pass + verifier)
  - `Deep Research` mode (web retrieval + strict citations)
  - `Swarm` mode (3-5 specialist agents + adjudication)
- Benchmark gate endpoints and settings dashboard

## Tech Stack

- Frontend: React + Vite + TypeScript + Tailwind + Zustand + Dexie
- Sidecar: Node.js + TypeScript + Fastify + SQLite (`better-sqlite3`)
- Testing: Vitest + React Testing Library + Playwright

## Installed Model in This Repo

- Base downloaded model: `models/Qwen3.5-9B`
- Runtime model used by local server: `models/Qwen3.5-9B-mlx-4bit`
- Symlink alias created by script: `Qwen3.5-9B -> models/Qwen3.5-9B-mlx-4bit`

## Quick Start (One Command)

1. Install dependencies

```bash
npm install
python3 -m pip install mlx-lm
```

2. Start model + sidecar + UI together

```bash
npm run dev:all
```

3. Open app

- `http://127.0.0.1:5173`

4. Verify settings

- Model Base URL: `http://127.0.0.1:1234/v1`
- Model Name: `Qwen3.5-9B`
- Sidecar Base URL: `http://127.0.0.1:8787`

Notes:

- First run can take longer if model download/conversion is needed.
- `dev:all` auto-restarts sidecar with bounded backoff if it drops.
- If model or UI exits, `dev:all` stops all services to avoid orphan listeners.

## Manual Fallback Startup (Three Terminals)

```bash
./scripts/start_qwen_mlx_server.sh
npm run dev:sidecar
npm run dev -- --host 127.0.0.1 --port 5173
```

## Health Checks

```bash
npm run dev:all:health
curl http://127.0.0.1:1234/v1/models
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:5173
```

## Scripts

```bash
npm run dev           # frontend
npm run dev:ui        # frontend (same as dev)
npm run dev:sidecar   # agent runtime sidecar
npm run dev:all       # model + sidecar + frontend supervisor
npm run dev:all:health # quick health probe for ports 1234/8787/5173
npm run build         # typecheck + frontend build
npm run typecheck     # TS project references (frontend + sidecar)
npm run lint          # eslint
npm run test          # vitest
npm run test:e2e      # playwright
```

## Agent Runtime API

- `POST /api/runs`
- `GET /api/runs/:runId/stream` (SSE with `Last-Event-ID` resume support + keepalive heartbeat)
- `GET /api/runs/:runId/events?afterId=<n>` (incremental events polling fallback)
- `POST /api/runs/:runId/cancel`
- `GET /api/runs/:runId`
- `GET /api/health`
- `POST /api/bench/run`
- `GET /api/bench/latest`

Default sidecar base URL: `http://127.0.0.1:8787`

## Mode Behavior

- `Chat`: direct chat path to model endpoint
- `Agent`: planning + tool trace + synthesis
- `Deep Think`: multiple candidate answers + verifier selection
- `Deep Research`: retrieval/extraction + citation-grounded synthesis
- `Swarm`: parallel role agents (`Retriever`, `Analyst`, `Skeptic`, optional `FactChecker`, optional `Synthesizer`) + adjudication

## Optional Research Provider Keys

You can use Tavily/Brave keys (optional).

- No API key is required for the local Qwen model endpoint.

- Enter keys in UI Settings (`Agent Runtime` section)
- Keys are posted to sidecar and stored locally in:
  - `agent-runtime/data/provider-keys.json`
- Env vars still override file values:
  - `TAVILY_API_KEY`
  - `BRAVE_API_KEY`

Without keys, the runtime uses degraded fallback search behavior.

## Troubleshooting Advanced Modes

If you see runtime stream errors such as `Cannot reach agent runtime ... /stream`:

1. Confirm stack health:
   - `npm run dev:all:health`
2. If sidecar is offline, restart the supervised stack:
   - `npm run dev:all`
3. Keep mode selected (`Agent`, `Deep Think`, `Deep Research`, `Swarm`) and retry.
   - The app now attempts reconnect/resume first, then incremental polling fallback before terminal failure.
4. Check ports are free if startup fails:
   - `1234` model
   - `8787` sidecar
   - `5173` UI

## Benchmark Gate

In settings, use **Run Benchmark** to generate latest report.

You can also trigger directly:

```bash
curl -X POST http://127.0.0.1:8787/api/bench/run
curl http://127.0.0.1:8787/api/bench/latest
```

## Distribution Mode for Runtime Model Download

`start_qwen_mlx_server.sh` supports distribution-friendly runtime model download.

Supported:

- `MLX_MODEL_REPO` (Hugging Face converted model repo)
- `MLX_MODEL_URL` (`.tar.gz` / `.tgz` / `.tar` / `.zip` archive)

Examples:

```bash
MLX_MODEL_REPO="your-org/Qwen3.5-9B-mlx-4bit" ./scripts/start_qwen_mlx_server.sh
```

```bash
MLX_MODEL_URL="https://your-cdn.example.com/Qwen3.5-9B-mlx-4bit.tar.gz" ./scripts/start_qwen_mlx_server.sh
```

Resolution order in script:

1. Reuse local converted model if present
2. Otherwise download converted model (repo/url)
3. Otherwise download base HF model and convert locally

## Storage Model

- Frontend (IndexedDB): chats, settings, run metadata
- Sidecar (SQLite): runs, tool/event traces, benchmark reports
- No cloud persistence in v1

## Export Contract

```ts
interface ExportBundleV1 {
  version: 1
  exportedAt: string
  threads: ChatThread[]
  messages: ChatMessage[]
  settings: AppSettings
  runs?: AgentRunRecord[]
}
```

## Stop Everything

If running with `npm run dev:all`, press `Ctrl+C` in that terminal.

Manual cleanup:

```bash
kill $(lsof -tiTCP:1234 -sTCP:LISTEN) || true
kill $(lsof -tiTCP:8787 -sTCP:LISTEN) || true
kill $(lsof -tiTCP:5173 -sTCP:LISTEN) || true
```
