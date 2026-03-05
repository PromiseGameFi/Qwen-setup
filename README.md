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

## Environment Configuration (`.env`)

All model/sidecar base URLs and API keys can be configured from `.env`.

1. Create local env file:

```bash
cp .env.example .env
```

2. Edit `.env` values you need:

- Frontend provider:
  - `VITE_MODEL_BASE_URL`
  - `VITE_MODEL_NAME`
  - `VITE_MODEL_API_KEY`
  - `VITE_SIDECAR_BASE_URL`
  - `VITE_TAVILY_API_KEY`
  - `VITE_BRAVE_API_KEY`
- Sidecar/runtime:
  - `MODEL_BASE_URL`
  - `TAVILY_API_KEY`
  - `BRAVE_API_KEY`
- Model startup script:
  - `HOST`, `PORT`, `MODEL_ALIAS`
  - `HF_MODEL_REPO`, `MLX_MODEL_REPO`, `MLX_MODEL_URL` (optional)

Notes:

- Frontend uses `VITE_*` vars as default settings.
- Sidecar loads `.env` on startup.
- `start_qwen_mlx_server.sh` sources `.env` automatically.
- `.env` is gitignored. Commit only `.env.example`.

## Agent Brain JSON

The assistant persona and first-chat welcome behavior are controlled by:

- `public/agent-brain.json`

How it works:

- The app injects this brain as a system prompt on each chat run.
- On the first assistant turn in a thread, it applies welcome rules from the JSON.
- It includes variation hints and a per-thread random seed so welcomes are not identical every time.
- Optional hard access gate uses `accessGate` from JSON + `VITE_DEMO_SECRET_CODE` from `.env`.
  - If gate is enabled and code is set, chat stays locked until correct code is entered.

## Quick Start (One Command)

1. Install dependencies

```bash
npm install
python3 -m pip install mlx-lm
cp .env.example .env
```

2. Start local model + sidecar + UI together

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

## Switch Local <-> Remote

Use Settings -> **Model Provider** quick actions:

- **Use Local Runtime** (original local flow)
- **Use HF Space** (remote Hugging Face endpoint)
- **OpenRouter** (no model hosting/build required)

Or switch from terminal:

```bash
npm run dev:all       # local model + sidecar + UI
npm run dev:all:hf    # remote model (HF/custom) + sidecar + UI
```

When using HF mode, align these `.env` values so frontend and sidecar hit the same endpoint:

```bash
VITE_PROVIDER_PRESET=hf_space
VITE_MODEL_BASE_URL=https://<your-space>.hf.space/v1
VITE_MODEL_NAME=Qwen3.5-0.8B-Q4_K_M.gguf
VITE_MODEL_API_KEY=
MODEL_BASE_URL=https://<your-space>.hf.space/v1
```

## No-Build Alternative: OpenRouter

If Hugging Face Space builds keep failing, use OpenRouter directly (no Docker build step).

1. Set `.env`:

```bash
VITE_PROVIDER_PRESET=openrouter
VITE_MODEL_BASE_URL=https://openrouter.ai/api/v1
VITE_MODEL_NAME=openrouter/auto
VITE_MODEL_API_KEY=sk-or-...
MODEL_BASE_URL=https://openrouter.ai/api/v1
```

2. Start remote mode:

```bash
npm run dev:all:hf
```

3. In app Settings:
- Preset: `OpenRouter (No Build)` or `Custom`
- Base URL: `https://openrouter.ai/api/v1`
- Model: any OpenRouter model id you want
- API Key: your OpenRouter key

## Hugging Face Space (Qwen3.5-0.8B)

For a free test deployment, this repo includes a ready-to-push Docker Space template at:

- `deploy/hf-space/`

Setup:

1. Create a new Hugging Face Space with **Docker** SDK.
2. Copy all files from `deploy/hf-space/` into that Space repo root.
3. In Space variables, set:
   - `MODEL_REPO=unsloth/Qwen3.5-0.8B-GGUF`
   - `MODEL_FILE=Qwen3.5-0.8B-Q4_K_M.gguf`
4. Wait for build/start, then use this app's Settings:
   - Preset: `Hugging Face Space`
   - Base URL: `https://<your-space-name>.hf.space/v1`
   - Model: `Qwen3.5-0.8B-Q4_K_M.gguf`
   - API Key: optional (only if set on the Space)

The Space serves OpenAI-compatible endpoints (`/v1/models`, `/v1/chat/completions`).

## Manual Fallback Startup (Three Terminals)

```bash
./scripts/start_qwen_mlx_server.sh
npm run dev:sidecar
npm run dev -- --host 127.0.0.1 --port 5173
```

## Health Checks

```bash
npm run dev:all:health
npm run dev:all:health:hf
curl http://127.0.0.1:1234/v1/models
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:5173
```

## Scripts

```bash
npm run dev           # frontend
npm run dev:ui        # frontend (same as dev)
npm run dev:sidecar   # agent runtime sidecar
npm run dev:all       # local model + sidecar + frontend supervisor
npm run dev:all:hf    # remote model + sidecar + frontend supervisor
npm run dev:all:health # local stack health probe
npm run dev:all:health:hf # HF/remote stack health probe
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
   - local: `npm run dev:all`
   - HF/remote: `npm run dev:all:hf`
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

If running with `npm run dev:all` or `npm run dev:all:hf`, press `Ctrl+C` in that terminal.

Manual cleanup:

```bash
kill $(lsof -tiTCP:1234 -sTCP:LISTEN) || true
kill $(lsof -tiTCP:8787 -sTCP:LISTEN) || true
kill $(lsof -tiTCP:5173 -sTCP:LISTEN) || true
```
