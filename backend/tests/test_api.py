import time

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch, fake_backbone, fake_dem):
    monkeypatch.setenv("DW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("DW_MESH_MAX_SIDE", "64")
    import importlib

    from depthwizard import config

    importlib.reload(config)
    from depthwizard.depth import backbone as bbmod

    bbmod.set_backbone(fake_backbone)
    from depthwizard.api import app as appmod

    importlib.reload(appmod)
    return TestClient(appmod.app)


def _wait(client, job_id, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.1)
    raise TimeoutError


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"]


def test_job_flow(client, geotiff_path):
    with open(geotiff_path, "rb") as f:
        r = client.post("/api/jobs", files={"file": ("scene.tif", f, "image/tiff")},
                        data={"calibration": "hybrid"})
    assert r.status_code == 202
    job = _wait(client, r.json()["id"])
    assert job["status"] == "done", job
    assert job["meta"]["units"] == "m"
    jid = job["id"]
    assert client.get(f"/api/jobs/{jid}/files/dsm.tif").status_code == 200
    assert client.get(f"/api/jobs/{jid}/files/mesh.glb").status_code == 200
    assert client.get(f"/api/jobs/{jid}/files/nope.txt").status_code == 404

    r = client.post(f"/api/jobs/{jid}/recalibrate", json={"gcps": [{"row": 10, "col": 10, "z": 123}]})
    assert r.status_code == 200 and r.json()["calibration"]["mode"] == "gcp"

    dsm = client.get(f"/api/jobs/{jid}/files/dsm.tif").content
    r = client.post(f"/api/jobs/{jid}/validate", files={"file": ("ref.tif", dsm, "image/tiff")})
    assert r.status_code == 200 and r.json()["raw"]["rmse"] < 1e-3
    assert client.get("/api/jobs").json()[0]["id"] == jid
    assert client.delete(f"/api/jobs/{jid}").status_code == 204


def test_rejects_bad_type(client):
    r = client.post("/api/jobs", files={"file": ("x.txt", b"hello", "text/plain")})
    assert r.status_code == 415
