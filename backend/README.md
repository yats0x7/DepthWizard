# depthwizard backend

See the repository root README for the full guide.

```bash
uv sync --extra dev
uv run depthwizard run path/to/image.tif --out data/out
uv run uvicorn depthwizard.api.app:app --reload --port 8000
uv run pytest
```
