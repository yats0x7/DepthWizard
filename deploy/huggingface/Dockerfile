# DepthWizard as a single Hugging Face Space: the engine serves the API and the built studio.
# Spaces run the container as uid 1000 and expect the app on the port declared in README.md.
FROM node:22-slim AS studio
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/studio/package.json apps/studio/
RUN pnpm install --filter @depthwizard/studio --frozen-lockfile
COPY apps/studio apps/studio
RUN pnpm --filter @depthwizard/studio build

FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    HOME=/home/user \
    DW_DATA_DIR=/home/user/data \
    DW_STATIC_DIR=/app/static \
    HF_HOME=/home/user/data/hf \
    DW_MODEL=small \
    DW_DEM_SOURCE=terrarium
RUN apt-get update && apt-get install -y --no-install-recommends libexpat1 libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 user
COPY --from=ghcr.io/astral-sh/uv:0.11.16 /uv /usr/local/bin/uv
WORKDIR /app
COPY engine/pyproject.toml engine/README.md ./
COPY engine/depthwizard ./depthwizard
# CPU wheels only: Spaces' free tier has no GPU, and the CUDA build would not fit the image budget.
RUN uv pip install --system --no-cache . --extra-index-url https://download.pytorch.org/whl/cpu
COPY --from=studio /src/apps/studio/dist ./static
# Sample scenes ship with the Space so the demo works before anyone uploads anything.
COPY data/samples /home/user/data/samples
RUN mkdir -p /home/user/data && chown -R user:user /home/user /app
USER user
# Download the weights at build time so the first visitor does not wait for them.
RUN python -c "from depthwizard.depth.backbone import get_backbone; get_backbone()" || true
EXPOSE 7860
CMD ["depthwizard", "serve", "--host", "0.0.0.0", "--port", "7860"]
