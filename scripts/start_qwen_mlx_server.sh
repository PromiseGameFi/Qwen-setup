#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HF_MODEL_PATH="${1:-$ROOT_DIR/models/Qwen3.5-9B}"
MLX_MODEL_PATH="${2:-$ROOT_DIR/models/Qwen3.5-9B-mlx-4bit}"
MODEL_ALIAS="${MODEL_ALIAS:-Qwen3.5-9B}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-1234}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

# Auto-download options for distribution.
# Set one of these in the environment for one-command setup on user machines.
# Example:
#   MLX_MODEL_REPO="your-org/Qwen3.5-9B-mlx-4bit" ./scripts/start_qwen_mlx_server.sh
#   MLX_MODEL_URL="https://.../Qwen3.5-9B-mlx-4bit.tar.gz" ./scripts/start_qwen_mlx_server.sh
MLX_MODEL_REPO="${MLX_MODEL_REPO:-}"
MLX_MODEL_REVISION="${MLX_MODEL_REVISION:-main}"
MLX_MODEL_URL="${MLX_MODEL_URL:-}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "ERROR: Python runtime '$PYTHON_BIN' was not found."
  exit 1
fi

if ! "$PYTHON_BIN" -m pip show mlx-lm >/dev/null 2>&1; then
  echo "ERROR: mlx-lm is not installed for $PYTHON_BIN."
  echo "Install it with: $PYTHON_BIN -m pip install mlx-lm"
  exit 1
fi

is_converted_model_ready() {
  [ -f "$MLX_MODEL_PATH/config.json" ] && [ -f "$MLX_MODEL_PATH/model.safetensors" ]
}

download_from_hf_repo() {
  [ -n "$MLX_MODEL_REPO" ] || return 1
  command -v hf >/dev/null 2>&1 || {
    echo "ERROR: 'hf' CLI not found. Install with: $PYTHON_BIN -m pip install huggingface_hub"
    return 1
  }

  echo "[1/3] Downloading converted MLX model from Hugging Face repo: $MLX_MODEL_REPO@$MLX_MODEL_REVISION"
  mkdir -p "$MLX_MODEL_PATH"
  hf download "$MLX_MODEL_REPO" \
    --repo-type model \
    --revision "$MLX_MODEL_REVISION" \
    --local-dir "$MLX_MODEL_PATH" \
    >/dev/null
}

download_from_archive_url() {
  [ -n "$MLX_MODEL_URL" ] || return 1
  command -v curl >/dev/null 2>&1 || {
    echo "ERROR: curl is required for MLX_MODEL_URL downloads."
    return 1
  }

  local tmp_archive
  local tmp_extract
  tmp_archive="$(mktemp -t qwen_mlx_archive.XXXXXX)"
  tmp_extract="$(mktemp -d -t qwen_mlx_extract.XXXXXX)"

  cleanup_download_tmp() {
    rm -f "$tmp_archive"
    rm -rf "$tmp_extract"
  }
  trap cleanup_download_tmp RETURN

  echo "[1/3] Downloading converted MLX model archive from URL"
  curl -fL "$MLX_MODEL_URL" -o "$tmp_archive"

  case "$MLX_MODEL_URL" in
    *.tar.gz|*.tgz) tar -xzf "$tmp_archive" -C "$tmp_extract" ;;
    *.tar) tar -xf "$tmp_archive" -C "$tmp_extract" ;;
    *.zip)
      command -v unzip >/dev/null 2>&1 || {
        echo "ERROR: unzip is required for .zip archives."
        return 1
      }
      unzip -q "$tmp_archive" -d "$tmp_extract"
      ;;
    *)
      echo "ERROR: Unsupported archive extension in MLX_MODEL_URL. Use .tar.gz, .tgz, .tar, or .zip"
      return 1
      ;;
  esac

  local model_root
  model_root="$(find "$tmp_extract" -type f -name config.json | head -n 1 | xargs -I{} dirname "{}")"

  if [ -z "$model_root" ]; then
    echo "ERROR: Could not find config.json in downloaded archive."
    return 1
  fi

  mkdir -p "$MLX_MODEL_PATH"
  rsync -a --delete "$model_root"/ "$MLX_MODEL_PATH"/
}

if ! is_converted_model_ready; then
  if download_from_hf_repo || download_from_archive_url; then
    if ! is_converted_model_ready; then
      echo "ERROR: Download succeeded but MLX model files are incomplete at: $MLX_MODEL_PATH"
      exit 1
    fi
    echo "[2/3] Reusing downloaded converted MLX model: $MLX_MODEL_PATH"
  else
    if [ ! -d "$HF_MODEL_PATH" ]; then
      echo "ERROR: Downloaded HF model path not found: $HF_MODEL_PATH"
      echo "Provide one of the following:"
      echo "  1) Place base model at $HF_MODEL_PATH for local conversion"
      echo "  2) Set MLX_MODEL_REPO to a preconverted model repo"
      echo "  3) Set MLX_MODEL_URL to a preconverted model archive URL"
      exit 1
    fi

    echo "[1/3] Converting to MLX 4-bit model at: $MLX_MODEL_PATH"
    "$PYTHON_BIN" -m mlx_lm convert \
      --hf-path "$HF_MODEL_PATH" \
      --mlx-path "$MLX_MODEL_PATH" \
      -q \
      --q-bits 4 \
      --q-group-size 64 \
      --trust-remote-code

    echo "[2/3] Conversion complete"
  fi
else
  echo "[1/3] Reusing existing converted MLX model: $MLX_MODEL_PATH"
  echo "[2/3] Skipping download/conversion"
fi

ALIAS_PATH="$ROOT_DIR/$MODEL_ALIAS"
if [ ! -e "$ALIAS_PATH" ]; then
  ln -s "$MLX_MODEL_PATH" "$ALIAS_PATH"
fi

echo "[3/3] Starting OpenAI-compatible server on http://$HOST:$PORT/v1"
cd "$ROOT_DIR"
"$PYTHON_BIN" -m mlx_lm server \
  --model "$MODEL_ALIAS" \
  --host "$HOST" \
  --port "$PORT" \
  --trust-remote-code \
  --use-default-chat-template \
  --chat-template-args '{"enable_thinking":false}'
