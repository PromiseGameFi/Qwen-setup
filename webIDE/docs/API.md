# Bridge API Summary

Base URL: `http://127.0.0.1:4317`

## Core
- `GET /v1/ping`
- `POST /v1/pairing/request`
- `GET /v1/system/status`

## Model
- `GET /v1/model/status`
- `POST /v1/model/ensure`
- `POST /v1/model/start`
- `POST /v1/model/stop`

## Workspaces
- `POST /v1/workspaces/open`
- `GET /v1/workspaces`
- `GET /v1/workspaces/:id/tree`
- `GET /v1/workspaces/:id/file?path=...`
- `PUT /v1/workspaces/:id/file`
- `POST /v1/workspaces/:id/commands`

## Agent
- `POST /v1/agent/runs`
- `GET /v1/agent/runs/:id`
- `GET /v1/agent/runs/:id/events?afterId=...`
- `GET /v1/agent/runs/:id/stream`
- `POST /v1/agent/runs/:id/cancel`

## Checkpoints
- `POST /v1/checkpoints/create`
- `POST /v1/checkpoints/restore`
