# DepthWizard engine + studio in one image (CPU by default; pass a CUDA base image for GPUs).
FROM node:22-slim AS studio
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/studio/package.json apps/studio/
RUN pnpm install --filter @depthwizard/studio --frozen-lockfile=false
COPY apps/studio apps/studio
RUN pnpm --filter @depthwizard/studio build

FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 UV_LINK_MODE=copy DW_DATA_DIR=/data DW_STATIC_DIR=/app/static
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 libgomp1 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY engine/pyproject.toml engine/README.md ./
COPY engine/depthwizard ./depthwizard
RUN uv pip install --system --no-cache . --extra-index-url https://download.pytorch.org/whl/cpu
COPY --from=studio /src/apps/studio/dist ./static
VOLUME ["/data"]
EXPOSE 8000
CMD ["depthwizard", "serve", "--host", "0.0.0.0", "--port", "8000"]
