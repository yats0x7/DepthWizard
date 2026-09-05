import time

import pytest
from fastapi.testclient import TestClient

from depthwizard.api.app import create_app


@pytest.fixture
def client(cfg, fake_dem):
    app = create_app(cfg)
    with TestClient(app) as c:
        yield c


def _wait(client, jid, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = client.get(f"/api/jobs/{jid}").json()
        if st["status"] in ("done", "failed", "cancelled"):
            return st
        time.sleep(0.1)
    raise TimeoutError


def test_health_and_system(client):
    assert client.get("/api/health").json()["ok"]
    sysinfo = client.get("/api/system").json()
    assert "small" in sysinfo["models"] and "terrarium" in sysinfo["dem_sources"]


def test_job_flow(client, png_path):
    with png_path.open("rb") as fh:
        r = client.post("/api/jobs", files={"file": ("scene.png", fh, "image/png")})
    assert r.status_code == 202
    jid = r.json()["id"]
    st = _wait(client, jid)
    assert st["status"] == "done", st
    assert st["units"] == "relative"
    assert st["meta"]["files"]["rdsm"] == "rdsm.tif"
    assert client.get(f"/api/jobs/{jid}/files/rdsm.tif").status_code == 200
    assert client.get(f"/api/jobs/{jid}/files/mesh.glb").status_code == 200
    assert client.get(f"/api/jobs/{jid}/files/nope.txt").status_code == 404
    assert any(j["id"] == jid for j in client.get("/api/jobs").json())
    assert client.delete(f"/api/jobs/{jid}").json()["deleted"] == jid
    assert client.get(f"/api/jobs/{jid}").status_code == 404


def test_geotiff_validate_and_recalibrate(client, geotiff_path):
    with geotiff_path.open("rb") as fh:
        jid = client.post(
            "/api/jobs",
            files={"file": ("scene.tif", fh, "image/tiff")},
            data={"model": "small", "calibration": "hybrid", "dem_source": "terrarium"},
        ).json()["id"]
    st = _wait(client, jid)
    assert st["status"] == "done" and st["units"] == "m"
    r = client.post(
        f"/api/jobs/{jid}/recalibrate", json={"mode": "affine", "gcps": [{"row": 5, "col": 5, "z": 250}]}
    )
    assert r.status_code == 200 and r.json()["calibration"]["mode"] == "gcp"
    with geotiff_path.open("rb") as fh:
        r = client.post(f"/api/jobs/{jid}/validate", files={"file": ("ref.tif", fh, "image/tiff")})
    assert r.status_code == 200 and "raw" in r.json()


def test_semantic_prior_option(client, geotiff_path):
    with geotiff_path.open("rb") as fh:
        r = client.post(
            "/api/jobs",
            files={"file": ("scene.tif", fh, "image/tiff")},
            data={"semantic_prior": "true"},
        )
    st = _wait(client, r.json()["id"])
    assert st["status"] == "done", st
    assert st["meta"]["calibration"]["mode"] == "semantic"


def test_imagery_search_and_area_job_are_network_independent(client, geotiff_path, monkeypatch):
    from depthwizard.api import app as app_module
    from depthwizard.api import jobs as jobs_module
    from depthwizard.imagery.sources import ImageryItem

    item = ImageryItem(
        source="sentinel2",
        id="test-scene",
        title="Test scene",
        url="https://sentinel-cogs.s3.us-west-2.amazonaws.com/test.tif",
        bbox=[77.5, 12.9, 77.6, 13.0],
        license="test licence",
        attribution="test attribution",
    )
    monkeypatch.setattr(app_module, "search_imagery", lambda *args, **kwargs: [item])

    r = client.post(
        "/api/imagery/search",
        json={"bbox": [77.5, 12.9, 77.6, 13.0], "sources": ["sentinel2"]},
    )
    assert r.status_code == 200 and r.json()[0]["id"] == "test-scene"

    def fake_fetch(selected, bbox, out):
        import shutil

        shutil.copy2(geotiff_path, out)
        return {"source": selected.source, "id": selected.id, "attribution": selected.attribution}

    monkeypatch.setattr(jobs_module, "fetch_area", fake_fetch)
    r = client.post(
        "/api/jobs/from-area",
        json={"bbox": [77.5, 12.9, 77.6, 13.0], "item": item.to_dict()},
    )
    assert r.status_code == 202
    st = _wait(client, r.json()["id"])
    assert st["status"] == "done", st
    assert st["imagery"]["source"] == "sentinel2"
    assert st["meta"]["imagery"]["attribution"] == "test attribution"

    item_dict = item.to_dict()
    item_dict["url"] = "https://example.com/not-approved.tif"
    r = client.post(
        "/api/jobs/from-area",
        json={"bbox": [77.5, 12.9, 77.6, 13.0], "item": item_dict},
    )
    assert r.status_code == 422


def test_rejects_bad_upload(client, tmp_path):
    p = tmp_path / "x.txt"
    p.write_text("hi")
    with p.open("rb") as fh:
        assert client.post("/api/jobs", files={"file": ("x.txt", fh, "text/plain")}).status_code == 415


def test_events_stream(client, png_path):
    with png_path.open("rb") as fh:
        jid = client.post("/api/jobs", files={"file": ("scene.png", fh, "image/png")}).json()["id"]
    with client.stream("GET", f"/api/jobs/{jid}/events") as r:
        body = ""
        for chunk in r.iter_text():
            body += chunk
            if '"status": "done"' in body or '"status": "failed"' in body:
                break
    assert "event: status" in body


def test_samples_and_from_sample(client, cfg, png_path):
    d = cfg.data_dir / "samples"
    d.mkdir(parents=True, exist_ok=True)
    (d / "demo.png").write_bytes(png_path.read_bytes())
    names = [s["name"] for s in client.get("/api/samples").json()]
    assert "demo.png" in names
    r = client.post("/api/jobs/from-sample", json={"name": "demo.png", "model": "small"})
    assert r.status_code == 202
    assert _wait(client, r.json()["id"])["status"] == "done"
    assert client.post("/api/jobs/from-sample", json={"name": "missing.png"}).status_code == 404


def test_file_routes_reject_traversal(client, png_path, tmp_path, cfg):
    with png_path.open("rb") as fh:
        jid = client.post("/api/jobs", files={"file": ("scene.png", fh, "image/png")}).json()["id"]
    _wait(client, jid)
    assert client.get(f"/api/jobs/{jid}/files/input.png").status_code == 200
    r = client.get(f"/api/jobs/{jid}/files/input.%2F..%2F..%2Fmeta.json")
    assert r.status_code == 404 or "json" not in r.headers.get("content-type", "")
    assert client.get("/api/jobs/%2E%2E/files/meta.json").status_code == 404
    assert client.get(f"/api/jobs/{jid}/files/input.png%2F..%2Fmeta.json").status_code in (404, 200)
    assert (
        client.get("/%2E%2E/%2E%2E/etc/passwd")
        .headers.get("content-type", "")
        .startswith(("text/html", "application/json"))
    )
    assert client.get("/api/jobs/nope/files/meta.json").status_code == 404


def test_events_stream_ends_for_finished_job(client, png_path):
    with png_path.open("rb") as fh:
        jid = client.post("/api/jobs", files={"file": ("scene.png", fh, "image/png")}).json()["id"]
    _wait(client, jid)
    with client.stream("GET", f"/api/jobs/{jid}/events") as r:
        body = "".join(r.iter_text())
    assert body.count("event: status") == 1


def test_from_path_requires_token(client, png_path, cfg):
    assert client.post("/api/jobs/from-path", json={"path": str(png_path)}).status_code == 404
    cfg.desktop_token = "secret"
    r = client.post("/api/jobs/from-path", json={"path": str(png_path)}, headers={"X-DW-Token": "secret"})
    assert r.status_code == 202
    assert _wait(client, r.json()["id"])["status"] == "done"
    cfg.desktop_token = None


def test_bad_gcps_and_model_are_422(client, png_path):
    with png_path.open("rb") as fh:
        r = client.post("/api/jobs", files={"file": ("s.png", fh, "image/png")}, data={"gcps": "nope"})
    assert r.status_code == 422
    with png_path.open("rb") as fh:
        r = client.post("/api/jobs", files={"file": ("s.png", fh, "image/png")}, data={"model": "evil/repo"})
    assert r.status_code == 422


def test_validate_with_class_mask(client, geotiff_path, tmp_path):
    import numpy as np
    import rasterio

    with geotiff_path.open("rb") as fh:
        jid = client.post("/api/jobs", files={"file": ("scene.tif", fh, "image/tiff")}).json()["id"]
    _wait(client, jid)
    with rasterio.open(geotiff_path) as ds:
        profile = ds.profile
    profile.update(count=1, dtype="uint8", nodata=None)
    mask_path = tmp_path / "classes.tif"
    codes = np.ones((profile["height"], profile["width"]), np.uint8)
    codes[:, : profile["width"] // 2] = 2
    with rasterio.open(mask_path, "w", **profile) as ds:
        ds.write(codes, 1)
    with geotiff_path.open("rb") as ref, mask_path.open("rb") as cls:
        r = client.post(
            f"/api/jobs/{jid}/validate",
            files={"file": ("ref.tif", ref, "image/tiff"), "classes": ("classes.tif", cls, "image/tiff")},
            data={"class_names": '{"1": "urban", "2": "forest"}'},
        )
    assert r.status_code == 200, r.text
    assert set(r.json()["per_class"]) == {"urban", "forest"}


def test_delete_running_job_waits_for_worker(client, png_path):
    with png_path.open("rb") as fh:
        jid = client.post("/api/jobs", files={"file": ("scene.png", fh, "image/png")}).json()["id"]
    assert client.delete(f"/api/jobs/{jid}").status_code == 200
    assert client.get(f"/api/jobs/{jid}").status_code == 404
