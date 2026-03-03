import os
import subprocess
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download


def read_env(name: str, default: str) -> str:
    value = os.getenv(name, default).strip()
    return value or default


def main() -> None:
    repo_id = read_env("MODEL_REPO", "unsloth/Qwen3.5-0.8B-GGUF")
    filename = read_env("MODEL_FILE", "Qwen3.5-0.8B-Q4_K_M.gguf")
    model_dir = Path(read_env("MODEL_DIR", "/tmp/models"))
    port = read_env("PORT", "7860")
    n_ctx = read_env("N_CTX", "4096")
    n_threads = read_env("N_THREADS", "4")
    chat_format = read_env("CHAT_FORMAT", "chatml")
    api_key = os.getenv("API_KEY", "").strip()

    model_dir.mkdir(parents=True, exist_ok=True)

    token = os.getenv("HF_TOKEN", "").strip() or os.getenv("HUGGING_FACE_HUB_TOKEN", "").strip() or None
    model_path = hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        token=token,
        local_dir=str(model_dir),
    )

    command = [
        sys.executable,
        "-m",
        "llama_cpp.server",
        "--model",
        model_path,
        "--host",
        "0.0.0.0",
        "--port",
        port,
        "--n_ctx",
        n_ctx,
        "--n_threads",
        n_threads,
        "--chat_format",
        chat_format,
    ]

    if api_key:
        command.extend(["--api_key", api_key])

    print("Starting OpenAI-compatible model server:")
    print(" ".join(command))
    subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
