# WebIDE v1 (Local-First Agentic Coding)

Standalone product under `webIDE/` implementing a public web IDE that pairs with a localhost bridge.

## What is implemented
- React + Vite + Monaco frontend in `apps/web`.
- Local bridge daemon in `services/bridge` with:
  - model lifecycle endpoints (`status`, `ensure`, `start`, `stop`)
  - workspace open/tree/file read-write endpoints
  - guarded command execution (`allow` / `confirm` / `deny`)
  - checkpoint create/restore
  - agent run orchestration + SSE timeline + cancel
- Shared protocol package with zod schemas/types.
- Knowledge-pack package with curated source manifest + lexical retrieval.
- Installer stubs for macOS/Linux/Windows.
- Baseline tests under `tests/`.

## Directory layout
- `apps/web`
- `services/bridge`
- `packages/protocol`
- `packages/knowledge-pack`
- `installers`
- `docs`
- `tests`

## Prerequisites
- Node.js 20+
- npm 10+
- `llama-server` available on PATH for local model serving
- A Qwen-compatible GGUF model URL (default can be overridden)

## Environment overrides (optional)
- `WEBIDE_MODEL_ID` (default `Qwen3.5-9B`)
- `WEBIDE_MODEL_FILE` (default `qwen3.5-9b-q4_k_m.gguf`)
- `WEBIDE_MODEL_URL` (download URL for GGUF)
- `WEBIDE_MODEL_SHA256` (optional checksum)
- `WEBIDE_MODEL_API_PORT` (default `8012`)
- `WEBIDE_ALLOWED_ORIGINS` (default `http://127.0.0.1:5174,http://localhost:5174`)

## Run
```bash
cd webIDE
npm install
npm run dev
```

Services:
- Web app: `http://127.0.0.1:5174`
- Bridge: `http://127.0.0.1:4317`
- Model API (when started): `http://127.0.0.1:8012/v1`

## Notes
- All bridge state is local in `~/.webide/`.
- Model downloads are resumable via `.part` file.
- Mutating bridge endpoints require a pairing token.
- SSE stream endpoint currently exposes run timelines on localhost.
