# DepthWizard: Beginner-Friendly Guide

This document explains the whole DepthWizard repository in simple language.

If you have never worked with elevation data, satellite imagery, machine learning, or 3D graphics,
start with the short version below. The later sections explain the technical words one by one.

## The short version

DepthWizard takes one normal-looking aerial or satellite image and estimates the height of things in
that image. It can turn the estimate into:

- a height image;
- a map-like elevation file;
- a 3D surface that you can fly over or walk around;
- measurements such as height, slope, direction of a slope, and cross-sections; and
- an accuracy report when you provide a trusted reference elevation file.

The important limitation is that one photograph does not contain perfect height information. The AI
first creates a *relative* depth estimate: it can often tell that one area is higher than another,
but it does not automatically know the true height above sea level. A georeferenced GeoTIFF, a
terrain elevation source, or known ground-control points can provide the missing scale.

## What problem does it solve?

Traditional elevation data is often collected using aircraft, LiDAR, surveying equipment, or stereo
satellite images. Those methods can be expensive, slow, or unavailable for a new location.

DepthWizard is useful when you need a fast first estimate from an image that you already have. It is
best thought of as a rapid analysis and visualization tool, not as a replacement for a professional
survey.

Examples:

- A disaster-response team can make a quick terrain model after a cloud-free satellite pass.
- A city-planning team can inspect the likely shape of buildings and surrounding land.
- A forestry or environmental team can inspect relief, slopes, and possible water paths.
- A researcher can compare an AI-produced surface with LiDAR data.
- A teacher or student can turn a remote-sensing image into an interactive 3D lesson.
- A developer can use the API to process many images from another application.

## The repository at a glance

```text
Depth-Wizard/
├── engine/                 Python processing engine and API
│   ├── depthwizard/
│   │   ├── raster/         Read and write image/elevation files
│   │   ├── depth/          AI model and large-image tiling
│   │   ├── calibrate/      Convert relative depth into metres
│   │   ├── analysis/       Slope, aspect, statistics, and terrain calculations
│   │   ├── eval/           Compare a result with reference data
│   │   ├── mesh/           Create the 3D GLB file
│   │   ├── imagery/        Search and fetch licensed map imagery
│   │   ├── benchmark/      Reproducible multi-scene experiments
│   │   ├── api/            FastAPI web endpoints and job management
│   │   ├── pipeline.py     Main end-to-end workflow
│   │   ├── cli.py          Command-line interface
│   │   └── config.py       Settings and environment variables
│   └── tests/              Python automated tests
├── apps/studio/            React web interface and Three.js viewer
├── apps/desktop/           Electron desktop shell
├── docker/                 Docker image instructions
├── data/                   Local samples, jobs, caches, and benchmark data
└── docs/                   Documentation, benchmark report, and this guide
```

`data/` is mostly ignored by Git because generated images, downloaded rasters, model files, and job
outputs can be very large. The small benchmark manifest, report, and error-map evidence are tracked.

## The complete workflow

The whole application follows this sequence:

```text
Input image
    ↓
Read pixels and map information
    ↓
AI estimates relative depth
    ↓
Optional terrain/GCP/semantic calibration
    ↓
Create elevation files and 3D files
    ↓
Open the result in the Studio viewer
    ↓
Optionally compare it with trusted reference data
```

### 1. Read the input image

The engine accepts:

- PNG, JPG, JPEG, WEBP, or BMP images; and
- GeoTIFF and other raster formats supported by Rasterio/GDAL.

An ordinary PNG or JPG usually contains colours only. A GeoTIFF can also contain a coordinate system
and a map position.

Large images are reduced to a manageable working size, currently at most 6000 pixels along their
longest side. This prevents an extremely large image from exhausting memory. The map transform is
scaled along with the image so that the result still lines up geographically.

### 2. Predict relative depth with AI

The default model is Depth Anything V2 Small. Base and Large versions can also be selected. The
model looks at visual clues such as edges, perspective, texture, and shading and produces one depth
value for each pixel.

This is not the same as measuring every point with a laser. The output is a ranking-like estimate:
for example, the roof may be higher than the road, but the numbers may not yet be metres.

#### Large-image tiling

An AI model normally works on an image of a limited size. If the input is larger, DepthWizard cuts
it into overlapping pieces called *tiles*. It predicts each piece, aligns the pieces to one global
prediction, and blends their overlapping edges. This reduces visible seams between tiles.

#### Flip averaging, also called TTA

When enabled, the engine predicts the image normally and predicts a horizontally flipped copy. It
flips the second result back and averages the two. This is called *test-time augmentation* (TTA).
It can make the result less sensitive to the direction of objects in the image, at the cost of extra
processing time.

### 3. Calibrate the result

*Calibration* means converting the AI's relative values into a physically useful height scale. The
available routes are explained below.

#### Hybrid calibration: the normal GeoTIFF route

For a georeferenced image, the engine can download a coarse Digital Elevation Model (DEM). It uses
the DEM for the broad shape of the land and uses the AI prediction for sharper objects such as
buildings, tree groups, and walls.

In simple terms:

```text
final surface = broad terrain from DEM + above-ground structure from AI
```

The broad terrain is fitted robustly so that unusual objects do not distort the whole scene. The
structure is then scaled and added to the terrain.

#### Affine calibration

*Affine* here means a simple scale-and-shift adjustment:

```text
new height = scale × old height + offset
```

This fits the complete predicted surface to the DEM. It is useful when you want a direct mathematical
fit, but it does not separate terrain from objects as explicitly as hybrid calibration.

#### Prior calibration

A *prior* is an informed assumption. If there is no DEM, the user can provide an estimated 95th
percentile structural height, such as 20 metres for a typical urban scene. The engine uses that
estimate to turn relative depth into a useful approximate scale.

This does not discover the absolute height of the scene. It only gives the model a reasonable scale.

#### Semantic-prior calibration

The semantic route is an optional fourth route. It uses a lightweight colour/texture heuristic to
find likely flat surfaces such as roads, water, or bare ground. It treats those pixels as clues for
where the local ground plane should be and keeps positive structure above that plane.

It is deliberately off by default. A road-colour pixel may actually be a roof, shadow, or another
object, so this route can help some scenes and hurt others. The benchmark showed improvements on
some urban/sparse scenes and worse results on the hilly/forested cases. That is why the UI calls it
“opt-in” and the documentation reports the A/B results honestly.

#### Ground-control points, or GCPs

A *ground-control point* is a location whose real height is known. For example, a survey team may
know that a road point is 146.2 metres above the chosen vertical reference.

- One GCP can fix an offset, meaning the whole result moves up or down.
- Two or more GCPs can fit both the scale and the offset.

GCPs are especially useful for PNG/JPG inputs that have no map coordinates. In the Studio, choose
the GCP tool, click a point, enter its known height, then recalibrate.

### 4. Write the outputs

After processing, a job directory normally contains:

| File | Beginner explanation | Typical use |
|---|---|---|
| `dsm.tif` | Float32 GeoTIFF containing metric surface heights | GIS, science, further processing |
| `rdsm.tif` | Relative DSM GeoTIFF, usually values from 0 to 1 | Relative shape when no absolute scale exists |
| `heightmap.png` | 16-bit grayscale height image | Image tools or quick sharing |
| `preview.png` | Hillshaded visual preview | Fast inspection or thumbnails |
| `texture.jpg` | Colour image used on the 3D surface | Textured visualization |
| `mesh.glb` | 3D model in the GLB format | Blender, web viewers, AR/3D tools |
| `dem.tif` | DEM used during calibration, when applicable | Auditing the terrain input |
| `meta.json` | Machine-readable record of settings, timing, calibration, and files | Reproducibility and debugging |
| `metrics.json` | Accuracy numbers after validation | Quality assessment |
| `error_map.png` | Map showing where the result is above or below reference data | Finding weak areas |

`Float32` means the elevation file stores decimal numbers with enough precision for normal numeric
processing. `16-bit` means the PNG stores more height levels than an ordinary 8-bit image.

### 5. View the result in Studio

The Studio loads the height data and creates a regular grid of 3D points. The displayed mesh can use
fewer points for speed, but the important measurements come from the original full-resolution
height array. This means changing the display detail does not silently change the reported height.

## Studio features in beginner language

### Landing page and new jobs

The landing page lets you:

- upload an image by clicking or dragging it;
- open one of the sample scenes;
- choose the model, calibration method, terrain source, and prior height;
- open the map picker before any image has been loaded; and
- see whether the engine is online and which device it is using.

The job list shows previous work. Jobs display their current state, including queued, fetching
imagery, reading, predicting, fetching terrain, calibrating, analysing, writing, done, failed, or
cancelled. A running job can be cancelled and a stored job can be deleted.

### Presentation mode

Presentation mode is designed to make the scene easy to look at:

- a sky and sun make the scene feel like a real environment;
- shadows make height differences easier to see;
- ambient occlusion darkens small spaces where surfaces meet;
- bloom and tone mapping make the image more polished; and
- the camera supports orbit, fly, and walk movement.

Presentation mode may offer vertical exaggeration, such as 2×, to make gentle terrain easier to see.
This changes only the display. It does not change the saved heights or measurement readouts.

### Analysis mode

Analysis mode is designed for measurement rather than visual polish:

- lighting is flatter and more neutral;
- vertical exaggeration is locked to 1×;
- wireframe can show the mesh vertices;
- the same exact geometry is used, without presentation effects; and
- the viewer can show analytical colour layers.

The same DSM is used in both modes. Presentation is not a different dataset.

### View panel

The View panel controls navigation and display:

- Orbit: rotate around the scene, zoom, and pan.
- Fly: move through the scene with free-flight movement.
- Walk: move at eye level while following the terrain.
- Overview, oblique, street, and top camera positions.
- Vertical exaggeration for display only.
- Image, height-colour, slope, aspect, and hillshade layers.
- Contour lines at a chosen height interval.
- Mesh detail, which trades visual speed for more displayed vertices.
- Minimap, sun position, shadows, and presentation effects.

### Analyse panel

The Analyse panel gives tools for reading the surface:

- Probe: click the surface to read its height.
- Pins: save important height readings and compare the last two.
- Profile/cross-section: click two points to see how height changes along a line.
- Flood level: place a horizontal water plane at a chosen height and see what fraction of valid
  pixels lie below it.
- Ground-control points: enter known heights and recalibrate.
- Recalibration: change the calibration route without rerunning the AI model.

For a georeferenced file, a probe can also show map coordinates, slope, and aspect.

### Data panel

The Data panel explains the job rather than just showing it. It shows:

- input filename, image size, map coordinate system, centre, and ground sample distance;
- AI model, processing device, tile size, flip averaging, and timing;
- calibration route, DEM source, fit quality, structural scale, and notes;
- height range, relief, median, slope statistics, valid-pixel fraction, and mesh size; and
- download buttons for each output file.

### Validate panel

The Validate panel lets you choose a trusted reference elevation raster. It compares the prediction
with that reference and can optionally accept a class raster for separate urban, sparse, hilly, or
forested scores.

### Map picker

The Map tab is for starting a new georeferenced job from a location:

1. Search for a place with Photon, a place-search service based on OpenStreetMap data.
2. Or enter `longitude, latitude` directly.
3. Drag the cyan pin to move the selection box.
4. Change the box size with the slider.
5. Search for available licensed imagery.
6. Choose an OpenAerialMap or Sentinel-2 result.
7. Check its date, source, licence, and expected ground resolution.
8. Click “Fetch and run”.

The engine fetches only the selected area from a georeferenced cloud-optimised GeoTIFF and then
runs the normal pipeline. A cloud-optimised GeoTIFF, or COG, is a GeoTIFF arranged so that small
parts can be downloaded efficiently without downloading the entire file.

The allowed pixel sources are OpenAerialMap and Sentinel-2. The OpenFreeMap/OpenStreetMap map in
the panel is only a visual basemap for navigation; it is not used as elevation or pixel imagery.
Google, Esri, and Mapbox satellite tiles are intentionally not used as processing sources.

The selected source's provider, date, licence, attribution, URL, and requested box are saved into
the job metadata and displayed on the job card. The server also checks that the URL belongs to an
approved source, has HTTPS, covers the requested box, and is not an oversized map request.

## What the technical terms mean

### Pixel, raster, and grid

A *pixel* is one small square in an image. A *raster* is a rectangular grid of pixels. A height
raster is an image where the number in each pixel means “height here” instead of “colour here”.

### RGB

RGB means red, green, and blue. Most ordinary colour images store three channels: one number for
red, one for green, and one for blue, for every pixel.

### DSM

DSM means *Digital Surface Model*. It describes the top surface of the world, including buildings,
trees, bridges, and the ground.

### DEM and DTM

DEM is commonly used for a *Digital Elevation Model*, a broad terrain-height dataset. A DTM, or
Digital Terrain Model, usually means bare ground with objects removed. In casual software usage the
terms can overlap, so always check what a particular data provider contains.

DepthWizard uses a coarse DEM for the broad land shape and adds AI-estimated above-ground structure
to produce a DSM.

### Relative DSM and metric DSM

- *Relative* means the shape is meaningful but the numbers do not have a trustworthy real-world
  unit. In DepthWizard this is normally a 0-to-1 rDSM.
- *Metric* means the values are intended to be in metres.

Metric does not automatically mean survey-grade. Its quality depends on the input, DEM, calibration,
and scene type.

### Georeferencing

*Georeferencing* tells software where an image belongs on Earth. It normally includes:

- a coordinate reference system;
- a map transform from pixel positions to map positions; and
- an image footprint or bounding box.

Without it, the engine can still estimate relative shape, but it cannot reliably know the scene's
location, pixel size in metres, or absolute terrain height.

### CRS, EPSG, and coordinates

A *coordinate reference system* (CRS) defines how locations are written as numbers. EPSG is a
catalogue of standard CRS identifiers. For example, `EPSG:4326` is the familiar longitude/latitude
system, while `EPSG:3857` is widely used by web maps.

### Ground sample distance, or GSD

GSD is the real-world size represented by one image pixel. A 10 m GSD means one pixel covers roughly
10 metres by 10 metres on the ground. Smaller GSD normally means more detail.

### Mesh and GLB

A *mesh* is a collection of points, edges, and triangles used to represent a 3D surface. A GLB is a
portable binary 3D file format. The generated mesh uses height values as the vertical position and
can carry the original colour texture.

### Hillshade

Hillshade is a fake light-and-shadow image made from heights. It assumes a sun direction and makes
slopes easier to see. It is a visualization, not another measurement.

### Slope and aspect

- *Slope* is how steep the surface is, usually shown in degrees. 0° is flat; larger values are
  steeper.
- *Aspect* is the compass direction the surface slopes toward. DepthWizard reports it as a bearing
  clockwise from north.

### Contours

A contour line connects locations with the same height. A map with a contour every 5 metres, for
example, has one line for each 5-metre height step.

### Flood plane

A flood plane is a flat horizontal surface placed at a chosen height. It helps answer a simple
question such as “which parts of this estimated surface are below 10 metres?” It is a visualization,
not a hydrology simulation.

### Calibration, scale, and offset

Calibration adjusts the AI's relative numbers to better match real heights. *Scale* stretches or
shrinks the height differences. *Offset* moves every height up or down by the same amount.

### RANSAC

RANSAC is a robust fitting method. It repeatedly tries to fit a pattern while ignoring points that
look like outliers. In this project, that helps a tall building or tree group from distorting the
estimated broad ground trend.

### Semantic prior

Semantic means “related to what a pixel represents”, such as road, water, roof, or vegetation. A
semantic prior is an assumption about those meanings that helps calibration. DepthWizard's current
route is intentionally lightweight; it is a colour/texture heuristic, not a large land-cover
segmentation model.

### Nodata

Nodata marks pixels where a value is missing or invalid. A transparent image edge or missing source
coverage should not be treated as a real height or included in accuracy calculations.

### API, JSON, and endpoint

An *API* is a way for one program to ask another program to do something. An *endpoint* is one API
URL, such as `POST /api/jobs`. JSON is a text format for structured data, for example:

```json
{
  "status": "done",
  "units": "m"
}
```

The React Studio uses these endpoints to create jobs, watch progress, load files, validate results,
and fetch imagery.

### SSE

SSE means *Server-Sent Events*. It is a simple live connection where the server sends progress
updates to the browser. That is how the job card can move from “Predicting” to “Calibrating” without
the user refreshing the page.

### Cache

A cache stores something already downloaded or calculated so it can be reused. DepthWizard caches
model weights, DEM tiles, imagery inputs, and benchmark inputs/results where appropriate. Caching
makes later runs faster and makes benchmark reruns less wasteful.

## Accuracy metrics in plain language

Validation compares the predicted height with a trusted reference height at the same pixels.

### Raw versus aligned results

- *Raw* compares the heights exactly as produced.
- *Aligned* first fits a scale and offset between prediction and reference, then compares them.

Raw results answer “are the absolute heights right?”. Aligned results answer more like “does the
surface have the right shape after correcting a global scale/height mismatch?”. Aligned results are
not a substitute for raw accuracy.

### Individual metrics

| Metric | Simple meaning |
|---|---|
| RMSE | Typical error with large mistakes penalized strongly |
| MAE | Average absolute error, in metres when comparing metric data |
| Bias | Average signed error; positive means predictions are generally too high |
| NMAD | A robust measure of typical error spread that is less affected by outliers |
| Pearson r | How similarly prediction and reference rise and fall; 1 is very similar pattern, 0 is no linear relationship |
| Within 1 m | Percentage of compared pixels whose absolute error is at most 1 metre |
| Within 3 m | Percentage of compared pixels whose absolute error is at most 3 metres |
| Error map | A picture showing the location and sign of errors |

RMSE and MAE are not percentages. A lower error is better. Pearson r is about pattern similarity,
not absolute correctness: a result can have a high r and still be shifted several metres too high.

## The benchmark that is included

The repository includes a reproducible benchmark manifest at
[`data/benchmark/manifest.json`](../data/benchmark/manifest.json) and its report at
[`docs/BENCHMARK.md`](BENCHMARK.md).

It contains eight real independent image/reference pairs:

- two urban scenes;
- two sparse/open-land scenes;
- two hilly scenes; and
- two forested scenes.

The imagery is Sentinel-2, and the independent reference products are AHN4 in the Netherlands or
USGS 3DEP in the United States. The report includes per-scene and per-class raw/aligned RMSE, MAE,
bias, NMAD, Pearson r, within-1-metre and within-3-metre percentages, licences, URLs, and tracked
error maps.

The measured class-level raw/aligned RMSE pairs are:

| Landscape | Raw RMSE | Aligned RMSE |
|---|---:|---:|
| Urban | 7.692 m | 6.001 m |
| Sparse | 10.497 m | 4.471 m |
| Hilly | 3.130 m | 2.998 m |
| Forested | 5.846 m | 4.735 m |

These numbers are evidence from this benchmark, not a guarantee for every future image. The weak
classes are shown instead of hidden.

To run the baseline benchmark from the repository root:

```bash
uv run --project engine depthwizard benchmark run \
  --manifest data/benchmark/manifest.json \
  --out data/benchmark

uv run --project engine depthwizard benchmark report \
  --root data/benchmark \
  --output docs/BENCHMARK.md
```

To run the semantic A/B into a separate cache:

```bash
uv run --project engine depthwizard benchmark run \
  --manifest data/benchmark/manifest.json \
  --out data/benchmark-semantic \
  --semantic-prior

uv run --project engine depthwizard benchmark report \
  --root data/benchmark \
  --output docs/BENCHMARK.md \
  --compare-root data/benchmark-semantic
```

The comparison code checks that the two runs contain the same scenes, bboxes, and source URLs and
that the comparison run really used semantic calibration.

## API features

The Python engine exposes a FastAPI server. The most important endpoints are:

| Endpoint | What it does |
|---|---|
| `GET /api/health` | Checks that the service is alive |
| `GET /api/system` | Reports model/device/default information |
| `GET /api/samples` | Lists sample images |
| `POST /api/jobs` | Uploads an image and starts a job |
| `POST /api/jobs/from-sample` | Starts a job from a sample already on disk |
| `POST /api/jobs/from-area` | Fetches selected licensed imagery and starts a job |
| `POST /api/imagery/search` | Searches OpenAerialMap and Sentinel-2 candidates |
| `GET /api/jobs` | Lists jobs |
| `GET /api/jobs/{id}` | Gets one job and its metadata |
| `GET /api/jobs/{id}/events` | Streams live job progress using SSE |
| `POST /api/jobs/{id}/cancel` | Requests cancellation |
| `DELETE /api/jobs/{id}` | Removes a job and its generated files |
| `GET /api/jobs/{id}/files/{name}` | Downloads one output file |
| `POST /api/jobs/{id}/validate` | Compares a job with a reference raster |
| `POST /api/jobs/{id}/recalibrate` | Changes calibration without rerunning AI inference |

There is also a protected desktop-only `POST /api/jobs/from-path` endpoint. The desktop shell gives
the engine a per-launch token so a local file can be processed without uploading it through the
browser.

## Command-line features

The command-line program is useful when you prefer scripts or terminal work:

```bash
# Process an image
uv run --directory engine depthwizard run image.tif --out output/scene

# Compare a finished job with a reference raster
uv run --directory engine depthwizard validate output/scene reference.tif

# Recalibrate an existing result with GCPs
uv run --directory engine depthwizard recalibrate output/scene --gcps gcps.json

# Download model weights before working offline
uv run --directory engine depthwizard prefetch small

# Start the API server
uv run --directory engine depthwizard serve --port 8000
```

The `run` command also supports model selection, calibration selection, DEM selection, a scene
height prior, GCP JSON, and `--semantic-prior`.

## Desktop, web, and Docker versions

### Web Studio plus local engine

The Studio is a browser application. During development, one process serves the Python API and one
serves the React interface:

```bash
pnpm install
uv sync --directory engine --extra dev
pnpm engine
pnpm studio
```

The browser opens the Studio at `http://127.0.0.1:5174` and the API normally runs at
`http://127.0.0.1:8000`.

### Desktop app

Electron is a desktop application framework. The Electron shell starts a local engine, serves the
built Studio, and provides native file opening and saving. This is useful when a user wants a
single application window instead of managing a browser and separate server.

```bash
pnpm studio:build
pnpm desktop
```

### Docker

Docker packages the engine and built Studio into a repeatable container image. This helps with
deployment and avoids manually installing every dependency. The default compose configuration binds
the service to localhost:

```bash
docker compose up --build
```

## How the code is organized internally

### `engine/depthwizard/pipeline.py`

This is the conductor. It calls image loading, AI prediction, DEM loading, calibration, analysis,
exports, and progress callbacks in the correct order. It also creates `meta.json` and handles
relative versus metric output decisions.

### `engine/depthwizard/raster/io.py`

This module understands input and output raster files. It reads colour channels, detects
georeferencing and nodata, downsizes large input, writes GeoTIFFs, creates hillshade previews, and
writes colour textures.

### `engine/depthwizard/depth/backbone.py`

This wraps the Depth Anything V2 model. It chooses a model preset, selects CPU/CUDA/MPS when
available, loads model weights, and produces a depth array.

### `engine/depthwizard/depth/tiling.py`

This handles overlapping tiles, global alignment, edge blending, and flip averaging for images too
large for one model pass.

### `engine/depthwizard/calibrate/`

- `dem.py` reads or resamples terrain data onto the image grid.
- `terrarium.py` downloads and decodes AWS Terrain Tiles.
- `fit.py` implements calibration, ground-trend fitting, GCP adjustment, and relative-height logic.
- `priors.py` detects likely flat surfaces for the optional semantic route.

### `engine/depthwizard/analysis/terrain.py`

This calculates slope, aspect, histograms, valid-pixel fractions, relief, and other surface
statistics.

### `engine/depthwizard/eval/metrics.py`

This compares prediction and reference arrays, calculates the validation metrics, and creates the
signed error map.

### `engine/depthwizard/mesh/glb.py`

This turns a height array and texture into a portable GLB 3D mesh. The viewer can display this mesh,
but numerical readouts still come from the height array.

### `engine/depthwizard/imagery/sources.py`

This searches public catalogues and fetches only the requested area from an approved georeferenced
source. It also records attribution and checks source URLs, HTTPS, coordinate bounds, box size, and
coverage.

### `engine/depthwizard/benchmark/`

- `manifest.py` reads and validates the scene manifest.
- `runner.py` downloads missing inputs, runs scenes, caches results, records options and provenance,
  and writes the Markdown report.

### `engine/depthwizard/api/`

- `app.py` defines HTTP routes and validates requests.
- `jobs.py` manages background jobs, progress, cancellation, persistence, and area fetches.
- `schemas.py` defines the JSON request shapes used by the API.

### `apps/studio/src/`

- `App.tsx` assembles the main page.
- `store.ts` holds shared viewer/job state.
- `lib/api.ts` calls the Python API.
- `lib/terrain.ts` loads height data, samples exact values, and calculates viewer-side terrain data.
- `components/viewer/` contains the Three.js 3D world, camera, terrain, lighting, effects, and
  analytical material layers.
- `components/panels/` contains View, Analyse, Validate, Data, and Map panels.
- `components/jobs/` contains upload controls, run options, job cards, and progress display.
- `components/shell/` contains the landing page, sidebar, and inspector panel layout.

### `apps/desktop/src/`

- `main.ts` creates the Electron window, starts the engine, and handles native file operations.
- `preload.ts` exposes a small safe bridge between the web interface and native desktop actions.

## Licensing and data-source rules

The map picker uses sources chosen for processing permissions and attribution:

- OpenAerialMap imagery is treated as CC-BY 4.0 in the source metadata.
- Sentinel-2 imagery is labelled as free/open Copernicus data with attribution.
- AHN4 and USGS 3DEP are used as independent benchmark reference products under their stated public
  or open-government terms.
- OpenFreeMap/OpenStreetMap is used as the map display layer with attribution.

The viewer basemap and the pixel source are different things. Seeing a map behind the selection box
does not mean those map tiles are being downloaded as the input image.

## Where this is useful, and where it is not

### Good fits

- Early-stage site inspection.
- Rapid disaster or humanitarian mapping.
- Comparing broad terrain shape between locations.
- Visualizing height data for planning meetings.
- Producing an approximate 3D model from a newly available image.
- Research experiments where the result will be checked against reference data.

### Poor fits without more evidence

- Legal boundary or construction surveying.
- Safety-critical engineering.
- Exact tree height or building-height certification.
- Fine detail smaller than the image's GSD.
- Absolute heights from an ungeoreferenced PNG/JPG with no GCPs.

## Important limitations

1. The AI is estimating depth from one view. Occlusion, shadows, repeated patterns, clouds, unusual
   camera angles, and unfamiliar landscapes can confuse it.
2. A relative result is not automatically a metre result. Use georeferencing, a suitable DEM, or
   GCPs when absolute height matters.
3. A coarse source such as 10 m Sentinel-2 cannot represent every small roof, tree, road edge, or
   wall.
4. OpenAerialMap coverage is uneven. Some locations have excellent drone imagery and others have
   none.
5. The semantic prior is experimental and opt-in. Its benchmark results are mixed.
6. Aligned metrics can look much better than raw metrics because alignment removes global scale and
   offset errors. Always inspect both.
7. DEM downloads, imagery search, map tiles, and first-use model downloads need network access
   unless they are already cached.
8. The benchmark values in this repository describe eight tested scenes. They should not be read as
   a universal accuracy guarantee.

## Useful starting points

- Main project overview: [`README.md`](../README.md)
- Full benchmark evidence: [`docs/BENCHMARK.md`](BENCHMARK.md)
- Pitch/deployment summary: [`docs/PITCH_DECK.md`](PITCH_DECK.md)
- Python engine: [`engine/depthwizard/pipeline.py`](../engine/depthwizard/pipeline.py)
- Studio map picker: [`apps/studio/src/components/panels/MapPanel.tsx`](../apps/studio/src/components/panels/MapPanel.tsx)
- API routes: [`engine/depthwizard/api/app.py`](../engine/depthwizard/api/app.py)

If you remember only one sentence, remember this: DepthWizard is a fast way to turn one image into
an inspectable, measurable *estimated* 3D surface, with tools to calibrate it, validate it, and
understand how trustworthy the result is.
