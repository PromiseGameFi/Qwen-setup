# Qwen Local Chat UI

A professional local chat interface for Qwen, inspired by ChatGPT/Claude workflows.

- No sign-in or auth flows
- OpenAI-compatible local provider support (LM Studio / Ollama OpenAI mode / vLLM / custom)
- Streaming assistant responses with markdown + syntax-highlighted code blocks
- Persistent local chat history via IndexedDB
- JSON export/import and local data reset controls

## Stack

- React + Vite + TypeScript
- Tailwind CSS + custom theme tokens
- Zustand state management
- Dexie (IndexedDB)
- Vitest + Testing Library + Playwright

## Quick Start

```bash
npm install
npm run dev
```

Then open the URL printed by Vite (default `http://localhost:5173`).

## Installed Model Version (This Repo)

- Base downloaded model: `Qwen3.5-9B` at `models/Qwen3.5-9B`
- Runtime model used by the local server: `Qwen3.5-9B-mlx-4bit` at `models/Qwen3.5-9B-mlx-4bit`

## End-to-End Run Process (Downloaded Qwen3.5-9B)

Use this flow when you want the downloaded local model to power the UI.

1. Install frontend dependencies:

```bash
npm install
```

2. Install MLX runtime (one-time):

```bash
python3 -m pip install mlx-lm
```

3. Start the local model API in Terminal 1:

```bash
./scripts/start_qwen_mlx_server.sh
```

What this does:
- Reuses `models/Qwen3.5-9B` (or converts it to `models/Qwen3.5-9B-mlx-4bit` on first run).
- Starts an OpenAI-compatible server at `http://127.0.0.1:1234/v1`.
- Serves with model name `Qwen3.5-9B`.

4. Start the UI in Terminal 2:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

5. Open the app:
- `http://127.0.0.1:5173`

6. Ensure Settings match:
- Base URL: `http://127.0.0.1:1234/v1`
- Model: `Qwen3.5-9B`

7. Optional health checks:

```bash
curl http://127.0.0.1:1234/v1/models
curl http://127.0.0.1:5173
```

8. Stop services:
- Press `Ctrl+C` in each terminal.
- Or kill by port:

```bash
kill $(lsof -tiTCP:1234 -sTCP:LISTEN)
kill $(lsof -tiTCP:5173 -sTCP:LISTEN)
```

## Distribution Mode (Auto-Download Converted Runtime Model)

If you are distributing this project to users, host the preconverted runtime model and let the startup script download it automatically.

Supported download sources:

- `MLX_MODEL_REPO`: Hugging Face model repo containing converted MLX files
- `MLX_MODEL_URL`: direct `.tar.gz` / `.tgz` / `.tar` / `.zip` archive URL

User one-command startup examples:

```bash
MLX_MODEL_REPO="your-org/Qwen3.5-9B-mlx-4bit" ./scripts/start_qwen_mlx_server.sh
```

```bash
MLX_MODEL_URL="https://your-cdn.example.com/Qwen3.5-9B-mlx-4bit.tar.gz" ./scripts/start_qwen_mlx_server.sh
```

Optional:

```bash
MLX_MODEL_REPO="your-org/Qwen3.5-9B-mlx-4bit" MLX_MODEL_REVISION="main" ./scripts/start_qwen_mlx_server.sh
```

Behavior order in `start_qwen_mlx_server.sh`:
1. Reuse local converted model if already present.
2. Otherwise auto-download converted model (repo or URL).
3. Otherwise fall back to local conversion from `models/Qwen3.5-9B`.

## Connect to a Local Model

The UI calls `POST {baseUrl}/chat/completions` with OpenAI-compatible payloads.

### Provider presets in the app

- LM Studio: `http://127.0.0.1:1234/v1`
- Ollama OpenAI mode: `http://127.0.0.1:11434/v1`
- vLLM: `http://127.0.0.1:8000/v1`

### Example: LM Studio

1. Start LM Studio local server.
2. Load a compatible Qwen model.
3. Keep base URL as `http://127.0.0.1:1234/v1` in Settings.
4. Set model name to the served model identifier.

### Example: Use the Downloaded `models/Qwen3.5-9B` on Apple Silicon (MLX)

This repo includes a helper script that:
1. Converts the downloaded Hugging Face weights to MLX 4-bit format.
2. Starts an OpenAI-compatible server on `127.0.0.1:1234`.

```bash
./scripts/start_qwen_mlx_server.sh
```

Then in UI Settings:

- Base URL: `http://127.0.0.1:1234/v1`
- Model: `Qwen3.5-9B`

Optional overrides:

```bash
HOST=127.0.0.1 PORT=1234 PYTHON_BIN=python3 ./scripts/start_qwen_mlx_server.sh
```

### Example: vLLM (OpenAI API mode)

```bash
python -m vllm.entrypoints.openai.api_server \
  --model /Users/computer/Documents/GitHub/Qwen-setup/models/Qwen3.5-9B \
  --served-model-name Qwen3.5-9B \
  --host 127.0.0.1 \
  --port 8000
```

Then set:

- Base URL: `http://127.0.0.1:8000/v1`
- Model: `Qwen3.5-9B`

## Keyboard Shortcuts

- `Enter`: send message
- `Shift+Enter`: newline
- `Cmd/Ctrl+N`: new chat
- `Cmd/Ctrl+,`: open settings
- `Esc`: close overlays

## Scripts

```bash
npm run dev        # start local app
npm run build      # typecheck + production build
npm run preview    # preview production build
npm run lint       # eslint
npm run test       # vitest
npm run test:watch # vitest watch mode
npm run test:e2e   # playwright
./scripts/start_qwen_mlx_server.sh # convert + serve local Qwen3.5-9B via MLX
```

## Data Model

Local exports use this schema:

```ts
interface ExportBundleV1 {
  version: 1
  exportedAt: string
  threads: ChatThread[]
  messages: ChatMessage[]
  settings: AppSettings
}
```

## Notes

- The UI requires an OpenAI-compatible endpoint (`/v1/chat/completions` or `/chat/completions`).
- If you see a connection error, verify your local server is running and listening on the configured host/port.
