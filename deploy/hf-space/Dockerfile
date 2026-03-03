FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CMAKE_ARGS="-DGGML_BLAS=ON -DGGML_BLAS_VENDOR=OpenBLAS"

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    pkg-config \
    libopenblas-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip && pip install -r /app/requirements.txt

COPY start_server.py /app/start_server.py

ENV PORT=7860 \
    MODEL_REPO=unsloth/Qwen3.5-0.8B-GGUF \
    MODEL_FILE=Qwen3.5-0.8B-Q4_K_M.gguf \
    MODEL_DIR=/tmp/models \
    N_CTX=4096 \
    N_THREADS=4 \
    CHAT_FORMAT=chatml

EXPOSE 7860

CMD ["python", "/app/start_server.py"]
