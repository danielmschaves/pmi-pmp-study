FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

# Place the venv outside /workspace so a volume mount doesn't shadow it
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /workspace

# Install dependencies (layer-cached — only reruns when pyproject.toml changes)
COPY pyproject.toml .
RUN uv sync --no-install-project

# Pre-create data dirs (volume mount will overlay /workspace but these persist in image layer)
RUN mkdir -p data/raw data/processed study/quizzes materials

EXPOSE 8888

CMD ["jupyter", "notebook", \
     "--ip=0.0.0.0", \
     "--port=8888", \
     "--no-browser", \
     "--NotebookApp.token=", \
     "--NotebookApp.password=", \
     "--notebook-dir=/workspace"]
