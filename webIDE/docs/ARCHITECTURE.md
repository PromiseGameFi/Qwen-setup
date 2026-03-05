# WebIDE v1 Architecture

## Components
- `apps/web`: Public React + Monaco frontend.
- `services/bridge`: Localhost daemon with workspace/model/agent APIs.
- `packages/protocol`: Shared zod schemas and TypeScript contracts.
- `packages/knowledge-pack`: Local retrieval corpus and scoring.

## Runtime Flow
1. Web app probes `http://127.0.0.1:4317/v1/ping`.
2. Web app obtains pairing token from `/v1/pairing/request`.
3. User opens local workspace through `/v1/workspaces/open`.
4. Model lifecycle controlled by `/v1/model/*` endpoints.
5. Agent run executes with checkpoints and SSE timeline.

## Security Model
- Bridge binds to localhost by default.
- Mutating routes require `x-webide-token` pairing token.
- Workspace path traversal is blocked by path root checks.
- Commands are policy-guarded (`allow`, `confirm`, `deny`).

## Persistence
- SQLite DB stored in `~/.webide/bridge.sqlite`.
- Checkpoint archives in `~/.webide/checkpoints/`.
- Model files in `~/.webide/models/`.
