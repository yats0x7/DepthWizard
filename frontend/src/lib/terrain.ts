import { fromUrl } from 'geotiff'
import Martini from '@mapbox/martini'
import * as THREE from 'three'

export interface HeightField {
  width: number
  height: number
  data: Float32Array // row-major, NaN = nodata
  min: number
  max: number
}

/** Load a single-band GeoTIFF (dsm.tif / rdsm.tif) into a Float32 heightfield. */
export async function loadHeightField(url: string, maxSide = 2049): Promise<HeightField> {
  const tiff = await fromUrl(url)
  const image = await tiff.getImage()
  const w0 = image.getWidth(), h0 = image.getHeight()
  const nodata = image.getGDALNoData()
  const f = Math.max(1, Math.max(w0, h0) / maxSide)
  const width = Math.round(w0 / f), height = Math.round(h0 / f)
  const rasters = await image.readRasters({ width, height, resampleMethod: 'bilinear' })
  const src = rasters[0] as ArrayLike<number>
  const data = new Float32Array(width * height)
  let min = Infinity, max = -Infinity
  for (let i = 0; i < data.length; i++) {
    const v = src[i]
    if (nodata !== null && v === nodata || !Number.isFinite(v) || v < -9000) { data[i] = NaN; continue }
    data[i] = v
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min)) { min = 0; max = 1 }
  return { width, height, data, min, max }
}

/** Resample a heightfield onto a (2^k + 1)^2 grid for Martini, filling nodata with the minimum. */
function toMartiniGrid(hf: HeightField, gridSize: number): Float32Array {
  const g = new Float32Array(gridSize * gridSize)
  const sx = (hf.width - 1) / (gridSize - 1), sy = (hf.height - 1) / (gridSize - 1)
  for (let y = 0; y < gridSize; y++) {
    const fy = y * sy, y0 = Math.floor(fy), y1 = Math.min(hf.height - 1, y0 + 1), ty = fy - y0
    for (let x = 0; x < gridSize; x++) {
      const fx = x * sx, x0 = Math.floor(fx), x1 = Math.min(hf.width - 1, x0 + 1), tx = fx - x0
      const a = hf.data[y0 * hf.width + x0], b = hf.data[y0 * hf.width + x1]
      const c = hf.data[y1 * hf.width + x0], d = hf.data[y1 * hf.width + x1]
      let v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
      if (!Number.isFinite(v)) v = Number.isFinite(a) ? a : Number.isFinite(b) ? b : Number.isFinite(c) ? c : Number.isFinite(d) ? d : hf.min
      g[y * gridSize + x] = v
    }
  }
  return g
}

export interface TerrainBuild {
  geometry: THREE.BufferGeometry
  gridSize: number
  triangles: number
}

/**
 * Build a terrain BufferGeometry with RTIN level-of-detail (Martini).
 * World units: X = east (pixel * dx), Z = south (pixel * dy), Y = height * vscale.
 * The mesh is centred on the origin in X/Z and its minimum height sits at Y = 0.
 */
export function buildTerrain(hf: HeightField, dx: number, dy: number, vscale: number, maxError: number,
  gridSize = 1025): TerrainBuild {
  const grid = toMartiniGrid(hf, gridSize)
  const martini = new Martini(gridSize)
  const tile = martini.createTile(grid)
  const { vertices, triangles } = tile.getMesh(maxError)
  const n = vertices.length / 2
  const pos = new Float32Array(n * 3)
  const uv = new Float32Array(n * 2)
  const worldW = (hf.width - 1) * dx, worldH = (hf.height - 1) * dy
  for (let i = 0; i < n; i++) {
    const gx = vertices[i * 2], gy = vertices[i * 2 + 1]
    const u = gx / (gridSize - 1), v = gy / (gridSize - 1)
    const h = grid[gy * gridSize + gx]
    pos[i * 3] = u * worldW - worldW / 2
    pos[i * 3 + 1] = (h - hf.min) * vscale
    pos[i * 3 + 2] = v * worldH - worldH / 2
    uv[i * 2] = u
    uv[i * 2 + 1] = 1 - v
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  // Martini emits clockwise triangles for a Y-up grid viewed from above; flip so normals point up.
  const idx = new Uint32Array(triangles.length)
  for (let i = 0; i < triangles.length; i += 3) { idx[i] = triangles[i]; idx[i + 1] = triangles[i + 2]; idx[i + 2] = triangles[i + 1] }
  geometry.setIndex(new THREE.BufferAttribute(idx, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return { geometry, gridSize, triangles: triangles.length / 3 }
}

/** Bilinear sample of the heightfield at fractional pixel coords. */
export function sampleHeight(hf: HeightField, col: number, row: number): number {
  const x = Math.min(Math.max(col, 0), hf.width - 1), y = Math.min(Math.max(row, 0), hf.height - 1)
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(hf.width - 1, x0 + 1), y1 = Math.min(hf.height - 1, y0 + 1)
  const tx = x - x0, ty = y - y0
  const a = hf.data[y0 * hf.width + x0], b = hf.data[y0 * hf.width + x1], c = hf.data[y1 * hf.width + x0], d = hf.data[y1 * hf.width + x1]
  const v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
  return Number.isFinite(v) ? v : NaN
}

/** Slope in degrees at a pixel (central differences). */
export function sampleSlope(hf: HeightField, col: number, row: number, dx: number, dy: number): number {
  const c = Math.round(col), r = Math.round(row)
  const l = sampleHeight(hf, c - 1, r), rr = sampleHeight(hf, c + 1, r), u = sampleHeight(hf, c, r - 1), d = sampleHeight(hf, c, r + 1)
  const gx = (rr - l) / (2 * dx), gy = (d - u) / (2 * dy)
  return Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI
}

/** Convert world X/Z (centred mesh) to fractional pixel col/row. */
export function worldToPixel(x: number, z: number, hf: HeightField, dx: number, dy: number): { col: number; row: number } {
  const worldW = (hf.width - 1) * dx, worldH = (hf.height - 1) * dy
  return { col: (x + worldW / 2) / dx, row: (z + worldH / 2) / dy }
}

export function pixelToWorld(col: number, row: number, hf: HeightField, dx: number, dy: number, vscale: number): THREE.Vector3 {
  const worldW = (hf.width - 1) * dx, worldH = (hf.height - 1) * dy
  const h = sampleHeight(hf, col, row)
  return new THREE.Vector3(col * dx - worldW / 2, (Number.isFinite(h) ? h - hf.min : 0) * vscale, row * dy - worldH / 2)
}

/** Pixel -> map coordinates using the GeoTIFF affine (a, b, c, d, e, f) and the working downscale. */
export function pixelToMap(col: number, row: number, transform: number[] | null, hfToWorking: number): [number, number] | null {
  if (!transform) return null
  const [a, b, c, d, e, f] = transform
  const wc = col * hfToWorking, wr = row * hfToWorking
  return [a * wc + b * wr + c, d * wc + e * wr + f]
}

export function fmt(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toFixed(digits) : '—'
}
