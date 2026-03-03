FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    HF_HOME=/tmp/hf-cache \
    HF_HUB_ENABLE_HF_TRANSFER=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    cmake \
    curl \
    git \
    libgomp1 \
    ninja-build \
    pkg-config \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip setuptools wheel && \
    pip install --prefer-binary -r /app/requirements.txt

COPY start_server.py /app/start_server.py

ENV PORT=7860 \
    MODEL_REPO=unsloth/Qwen3.5-0.8B-GGUF \
    MODEL_FILE=Qwen3.5-0.8B-Q4_K_M.gguf \
    MODEL_DIR=/tmp/models \
    N_CTX=2048 \
    N_THREADS=2 \
    CHAT_FORMAT=chatml

EXPOSE 7860

CMD ["python", "/app/start_server.py"]
