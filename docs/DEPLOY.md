# Deploying DepthWizard

## Why not everything on Vercel

Vercel runs serverless functions with a 250 MB unzipped bundle limit, no persistent filesystem, no
GPU, and a function time limit. This engine carries PyTorch (553 MB on its own), transformers,
rasterio with native GDAL, OpenCV, SciPy and trimesh, loads a 95 MB model, and writes about 35 MB of
GeoTIFF, GLB and PNG per finished job that the viewer then streams back. The engine cannot run
there. The studio alone can, and it is useful only when pointed at an engine running elsewhere.

The Docker image serves the API **and** the built studio from one process, so the whole product is a
single container. That is the simplest deployment and the one to prefer.

## Option A, recommended: one Hugging Face Space

Free CPU tier, 16 GB RAM, no card required, and the model cache lives next door.

```bash
hf auth login                       # needs a token from huggingface.co/settings/tokens
hf repo create depthwizard --repo-type space --space_sdk docker
git clone https://huggingface.co/spaces/<your-username>/depthwizard /tmp/dw-space
cp -r deploy/huggingface/Dockerfile deploy/huggingface/README.md /tmp/dw-space/
# the build needs the repository itself, so point the Space at this GitHub repo instead of copying:
cd /tmp/dw-space && git remote add upstream https://github.com/yats0x7/DepthWizard
```

Simpler in practice: create the Space in the web UI, choose the **Docker** SDK, then in the Space's
settings set it to build from the `yats0x7/DepthWizard` repository with
`deploy/huggingface/Dockerfile` as the Dockerfile path. Push to `main` and the Space rebuilds.

Expect several minutes for the first build (PyTorch download) and minutes per scene on CPU rather
than the seconds a GPU takes. Job outputs are cleared when the Space restarts, which is fine for a
demo but not for keeping results.

## Option B: studio on Vercel, engine on a container host

Use this when a `vercel.app` URL matters. `vercel.json` at the repository root already builds only
the studio.

```bash
npm i -g vercel
vercel login
vercel --prod                       # builds apps/studio and deploys the static site
```

Then point the studio at the engine and let the engine accept that origin:

```bash
vercel env add VITE_API_BASE production      # value: https://<engine-host>
# on the engine host:
DW_CORS_ORIGINS='["https://<your-project>.vercel.app"]' depthwizard serve --host 0.0.0.0 --port 8000
```

Container hosts that fit the engine: Hugging Face Spaces (free), Railway (free credit, persistent
volume), Fly.io (free allowance, volumes), Render (needs a paid instance; the free tier's 512 MB of
memory is below what PyTorch needs). All of them build `docker/engine.Dockerfile` unchanged.

## Option C: your own machine or a VM

```bash
docker compose up --build           # http://localhost:8000, API and studio together
```

## Settings worth setting in production

| Variable | Why |
|---|---|
| `DW_CORS_ORIGINS` | JSON list of the origins allowed to call the API. Keep it narrow. |
| `DW_MODEL` | `small` on CPU hosts; `base` or `large` only with a GPU. |
| `DW_DATA_DIR` | Point at a mounted volume so jobs survive a restart. |
| `DW_HF_TOKEN` | Only needed for gated model repositories. |
| `DW_DESKTOP_TOKEN` | Leave unset on a server. It enables `/api/jobs/from-path`, which reads local files and belongs only to the desktop app. |

Run `depthwizard prefetch small` during the image build, as the Space Dockerfile does, so the first
visitor is not waiting on a model download.
