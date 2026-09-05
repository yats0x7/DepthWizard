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
