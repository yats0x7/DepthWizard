/**
 * Height field loading, exact-height terrain geometry and sampling.
 *
 * Geometry is sacred: every vertex is a DSM sample (no smoothing, no decimation error), every
 * readout comes from bilinear interpolation of the DSM array, never from the rendered mesh.
 */
import * as THREE from 'three'
import { fromUrl } from 'geotiff'
import type { Meta } from './api'

export interface HeightField {
  data: Float32Array // row-major, NaN where nodata
  width: number
  height: number
  dx: number // world units per column (metres when georeferenced, else 1)
  dy: number
  hMin: number
  hMax: number
  units: 'm' | 'relative'
  vscale: number // world units per height unit for display (1 for metres)
  /** Optional pixel -> map transform (affine a,b,c,d,e,f) when georeferenced. */
  transform: number[] | null
  epsg: number | null
}

export async function loadHeightField(url: string, meta: Meta): Promise<HeightField> {
  const tiff = await fromUrl(url, { allowFullFile: true })
  const image = await tiff.getImage()
  const width = image.getWidth()
  const height = image.getHeight()
  const nodata = image.getGDALNoData()
  const raster = (await image.readRasters({ interleave: true })) as unknown as ArrayLike<number>
  const data = new Float32Array(width * height)
  let hMin = Infinity
  let hMax = -Infinity
  for (let i = 0; i < data.length; i++) {
    const v = raster[i]
    if (v === nodata || !Number.isFinite(v)) data[i] = NaN
    else {
      data[i] = v
      if (v < hMin) hMin = v
      if (v > hMax) hMax = v
    }
  }
  if (!Number.isFinite(hMin)) {
    hMin = 0
    hMax = 1
  }
  const px = meta.input.pixel_size_m ?? [1, 1]
  const geo = meta.input.georeferenced
  return {
    data,
    width,
    height,
    dx: geo ? px[0] : 1,
    dy: geo ? px[1] : 1,
    hMin,
    hMax,
    units: meta.units,
    vscale: meta.units === 'm' ? 1 : meta.view.vertical_scale,
    transform: meta.input.transform,
    epsg: meta.input.epsg,
  }
}

/** World extents of the field (X east, Z south), centred on the origin. */
export function fieldSize(hf: HeightField) {
  const sx = (hf.width - 1) * hf.dx
  const sz = (hf.height - 1) * hf.dy
  return { sx, sz, size: Math.max(sx, sz), relief: (hf.hMax - hf.hMin) * hf.vscale }
}

export function worldToPixel(hf: HeightField, x: number, z: number): [number, number] {
  return [x / hf.dx + (hf.width - 1) / 2, z / hf.dy + (hf.height - 1) / 2]
}

export function pixelToWorld(hf: HeightField, col: number, row: number): [number, number] {
  return [(col - (hf.width - 1) / 2) * hf.dx, (row - (hf.height - 1) / 2) * hf.dy]
}

/** Map coordinates in the raster CRS for a pixel (centre), when georeferenced. */
export function pixelToMap(hf: HeightField, col: number, row: number): [number, number] | null {
  if (!hf.transform) return null
  const [a, b, c, d, e, f] = hf.transform
  const px = col + 0.5
  const py = row + 0.5
  return [a * px + b * py + c, d * px + e * py + f]
}

/** Bilinear DSM sample at fractional pixel coordinates; NaN when outside or on nodata. */
export function sampleHeight(hf: HeightField, col: number, row: number): number {
  if (!(col >= 0 && row >= 0 && col <= hf.width - 1 && row <= hf.height - 1)) return NaN
  const c0 = Math.floor(col)
  const r0 = Math.floor(row)
  const c1 = Math.min(c0 + 1, hf.width - 1)
  const r1 = Math.min(r0 + 1, hf.height - 1)
  const tx = col - c0
  const ty = row - r0
  const d = hf.data
  const w = hf.width
  const v00 = d[r0 * w + c0]
  const v01 = d[r0 * w + c1]
  const v10 = d[r1 * w + c0]
  const v11 = d[r1 * w + c1]
  const top = v00 * (1 - tx) + v01 * tx
  const bottom = v10 * (1 - tx) + v11 * tx
  const v = top * (1 - ty) + bottom * ty
  if (Number.isFinite(v)) return v
  // fall back to nearest valid corner so nodata edges do not swallow the probe
  const nearest = d[Math.round(row) * w + Math.round(col)]
  return Number.isFinite(nearest) ? nearest : NaN
}

export function sampleHeightWorld(hf: HeightField, x: number, z: number): number {
  const [c, r] = worldToPixel(hf, x, z)
  return sampleHeight(hf, c, r)
}

/** World Y for a height value (display scale, before user exaggeration). */
export function heightToY(hf: HeightField, h: number): number {
  return (h - hf.hMin) * hf.vscale
}

/** Slope (degrees) and aspect (degrees clockwise from north) from central differences of the DSM. */
export function sampleSlope(hf: HeightField, col: number, row: number): { slope: number; aspect: number } {
  const c = Math.round(col)
  const r = Math.round(row)
  const c0 = Math.max(0, c - 1)
  const c1 = Math.min(hf.width - 1, c + 1)
  const r0 = Math.max(0, r - 1)
  const r1 = Math.min(hf.height - 1, r + 1)
  const w = hf.width
  const d = hf.data
  const gx = (d[r * w + c1] - d[r * w + c0]) / ((c1 - c0) * hf.dx)
  const gy = (d[r1 * w + c] - d[r0 * w + c]) / ((r1 - r0) * hf.dy)
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return { slope: NaN, aspect: NaN }
  const slope = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI
  const aspect = ((Math.atan2(gx, -gy) * 180) / Math.PI + 360) % 360
  return { slope, aspect }
}

export interface ProfileSample {
  t: number // distance along the line, world units
  h: number
  col: number
  row: number
}

export function profileAlong(hf: HeightField, a: [number, number], b: [number, number], n = 256): ProfileSample[] {
  const out: ProfileSample[] = []
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const x = a[0] + (b[0] - a[0]) * t
    const z = a[1] + (b[1] - a[1]) * t
    const [col, row] = worldToPixel(hf, x, z)
    out.push({ t: t * len, h: sampleHeight(hf, col, row), col, row })
  }
  return out
}

/**
 * Regular-grid geometry with vertices at exact DSM samples. `stride` > 1 keeps every stride-th
 * sample (still exact samples, never averaged). Triangles touching nodata are dropped.
 */
export function buildTerrainGeometry(hf: HeightField, maxSide = 1536): { geometry: THREE.BufferGeometry; stride: number } {
  const stride = Math.max(1, Math.ceil(Math.max(hf.width, hf.height) / maxSide))
  const cols = Math.floor((hf.width - 1) / stride) + 1
  const rows = Math.floor((hf.height - 1) / stride) + 1
  const positions = new Float32Array(cols * rows * 3)
  const uvs = new Float32Array(cols * rows * 2)
  const valid = new Uint8Array(cols * rows)
  const cx = (hf.width - 1) / 2
  const cz = (hf.height - 1) / 2
  let p = 0
  let u = 0
  for (let j = 0; j < rows; j++) {
    const row = Math.min(j * stride, hf.height - 1)
    for (let i = 0; i < cols; i++) {
      const col = Math.min(i * stride, hf.width - 1)
      const h = hf.data[row * hf.width + col]
      const ok = Number.isFinite(h)
      valid[j * cols + i] = ok ? 1 : 0
      positions[p++] = (col - cx) * hf.dx
      positions[p++] = ok ? (h - hf.hMin) * hf.vscale : 0
      positions[p++] = (row - cz) * hf.dy
      uvs[u++] = col / (hf.width - 1)
      uvs[u++] = 1 - row / (hf.height - 1)
    }
  }
  const idx: number[] = []
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i
      const b = a + 1
      const c = a + cols
      const d = c + 1
      if (valid[a] && valid[c] && valid[b]) idx.push(a, c, b)
      if (valid[b] && valid[c] && valid[d]) idx.push(b, c, d)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return { geometry, stride }
}

/** Float texture of the full-resolution DSM for per-fragment contours, slope and colour ramps. */
export function buildHeightTexture(hf: HeightField): THREE.DataTexture {
  const data = new Float32Array(hf.width * hf.height)
  for (let i = 0; i < data.length; i++) {
    const v = hf.data[i]
    data[i] = Number.isFinite(v) ? v : hf.hMin
  }
  const tex = new THREE.DataTexture(data, hf.width, hf.height, THREE.RedFormat, THREE.FloatType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.flipY = true
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}
