import json

from depthwizard.benchmark.manifest import load_manifest
from depthwizard.benchmark.runner import benchmark_report, benchmark_run


def test_benchmark_manifest_rejects_unknown_landscape(tmp_path):
    p = tmp_path / "manifest.json"
    p.write_text(
        json.dumps(
            {
                "version": 1,
                "scenes": [
                    {
                        "id": "bad",
                        "landscape": "coastal",
                        "bbox": [0, 0, 1, 1],
                        "imagery": {"kind": "local", "source": "test", "path": "a.png"},
                        "reference": {"kind": "local", "source": "test", "path": "b.png"},
                    }
                ],
            }
        )
    )
    try:
        load_manifest(p)
    except ValueError as exc:
        assert "landscape" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("invalid landscape accepted")


def test_benchmark_run_is_cached_and_reports_local_scene(tmp_path, png_path, cfg):
    manifest_dir = tmp_path / "manifest"
    manifest_dir.mkdir()
    image = manifest_dir / "scene.png"
    reference = manifest_dir / "reference.png"
    image.write_bytes(png_path.read_bytes())
    reference.write_bytes(png_path.read_bytes())
    manifest = manifest_dir / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "version": 1,
                "scenes": [
                    {
                        "id": "local-urban",
                        "landscape": "urban",
                        "bbox": [77.5, 12.9, 77.51, 12.91],
                        "imagery": {
                            "kind": "local",
                            "source": "test imagery",
                            "path": "scene.png",
                            "license": "test",
                            "attribution": "test imagery",
                        },
                        "reference": {
                            "kind": "local",
                            "source": "test reference",
                            "path": "reference.png",
                            "license": "test",
                        },
                    }
                ],
            }
        )
    )
    root = tmp_path / "benchmark"
    results = benchmark_run(manifest, root, cfg)
    assert len(results) == 1
    assert results[0]["metrics"]["per_class"]["urban"]["aligned"]["n"] >= 16
    cached = benchmark_run(manifest, root, cfg)
    assert cached[0]["scene"]["id"] == "local-urban"
    report = benchmark_report(root, tmp_path / "BENCHMARK.md")
    text = report.read_text()
    assert "Per-scene results" in text and "Per-class weighted results" in text
    assert "local-urban" in text and "urban" in text
