---
title: Qwen3.5 0.8B OpenAI API
emoji: "🧠"
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
startup_duration_timeout: 2h
pinned: false
---

# Hugging Face Space Template (OpenAI-Compatible Qwen 0.8B)

This folder is ready to be used as a Docker Space that serves `Qwen3.5-0.8B` behind OpenAI-style endpoints:

- `GET /v1/models`
- `POST /v1/chat/completions` (with streaming)

## 1) Create the Space

1. Go to Hugging Face -> **New Space**.
2. Select **Docker** SDK.
3. Choose hardware:
   - For free testing: **CPU Basic**.
4. Create the Space.

## 2) Upload these files

Upload all files from this folder to the root of that Space repository:

- `Dockerfile`
- `requirements.txt`
- `start_server.py`
- `.dockerignore`
- `README.md` (this file)

## 3) Set Space Variables (Settings -> Variables and secrets)

Recommended defaults:

- `MODEL_REPO=unsloth/Qwen3.5-0.8B-GGUF`
- `MODEL_FILE=Qwen3.5-0.8B-Q4_K_M.gguf`
- `N_CTX=2048`
- `N_THREADS=2`
- `CHAT_FORMAT=chatml`

Optional:

- `API_KEY=<your-secret>` to require bearer auth.
- `HF_TOKEN=<token>` if your model repo is private.

## 4) Connect frontend

In this app's Settings:

- Preset: `Hugging Face Space`
- Base URL: `https://<your-space-name>.hf.space/v1`
- Model Name: `Qwen3.5-0.8B-Q4_K_M.gguf`
- API Key: only if you set `API_KEY` in the Space

## Notes

- Free CPU Spaces can sleep when idle and cold-start slowly.
- First boot includes model download, so startup may take a few minutes.
- If you hit memory pressure, use a smaller GGUF quantization file.
