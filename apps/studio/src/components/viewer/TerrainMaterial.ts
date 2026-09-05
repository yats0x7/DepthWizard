/**
 * Terrain material: a stock three.js material (Standard for lit Presentation mode, Basic for flat
 * Analysis mode) extended through onBeforeCompile with per-fragment colour layers, contours, flood
 * tint and an analytic hillshade. Colour only; vertex positions are never touched here.
 */
import * as THREE from 'three'
import type { HeightField } from '../../lib/terrain'

export type LayerId = 'texture' | 'hypsometric' | 'slope' | 'aspect' | 'hillshade'
export const LAYER_INDEX: Record<LayerId, number> = { texture: 0, hypsometric: 1, slope: 2, aspect: 3, hillshade: 4 }

export interface TerrainUniforms {
  uHeight: { value: THREE.Texture | null }
  uTexel: { value: THREE.Vector2 }
  uCell: { value: THREE.Vector2 }
  uHRange: { value: THREE.Vector2 }
  uLayer: { value: number }
  uContour: { value: number }
  uFlood: { value: number }
  uFloodOn: { value: number }
  uShade: { value: number }
  uSun: { value: THREE.Vector3 }
  uTexMix: { value: number }
  uVScale: { value: number }
  uSlopeMax: { value: number }
}

const VERT_HEAD = /* glsl */ `
varying vec2 vTUv;
`
const VERT_BODY = /* glsl */ `
#include <uv_vertex>
vTUv = uv;
`

const FRAG_HEAD = /* glsl */ `
varying vec2 vTUv;
uniform sampler2D uHeight;
uniform vec2 uTexel;
uniform vec2 uCell;
uniform vec2 uHRange;
uniform int uLayer;
uniform float uContour;
uniform float uFlood;
uniform float uFloodOn;
uniform float uShade;
uniform vec3 uSun;
uniform float uTexMix;
uniform float uVScale;
uniform float uSlopeMax;

vec3 dwTurbo(float t) {
  t = clamp(t, 0.0, 1.0);
  const vec4 kR = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
  const vec4 kG = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
  const vec4 kB = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
  const vec2 kR2 = vec2(-152.94239396, 59.28637943);
  const vec2 kG2 = vec2(4.27729857, 2.82956604);
  const vec2 kB2 = vec2(-89.90310912, 27.34824973);
  vec4 v4 = vec4(1.0, t, t * t, t * t * t);
  vec2 v2 = v4.zw * v4.z;
  return clamp(vec3(dot(v4, kR) + dot(v2, kR2), dot(v4, kG) + dot(v2, kG2), dot(v4, kB) + dot(v2, kB2)), 0.0, 1.0);
}
vec3 dwViridis(float t) {
  t = clamp(t, 0.0, 1.0);
  const vec3 c0 = vec3(0.2777273272234177, 0.005407344544966578, 0.3340998053353061);
  const vec3 c1 = vec3(0.1050930431085774, 1.404613529898575, 1.384590162594685);
  const vec3 c2 = vec3(-0.3308618287255563, 0.214847559468213, 0.09509516302823659);
  const vec3 c3 = vec3(-4.634230498983486, -5.799100973351585, -19.33244095627987);
  const vec3 c4 = vec3(6.228269936347081, 14.17993336680509, 56.69055260068105);
  const vec3 c5 = vec3(4.776384997670288, -13.74514537774601, -65.35303263337234);
  const vec3 c6 = vec3(-5.435455855934631, 4.645852612178535, 26.3124352495832);
  return clamp(c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6))))), 0.0, 1.0);
}
vec3 dwHsv(float h, float s, float v) {
  vec3 k = vec3(1.0, 2.0 / 3.0, 1.0 / 3.0);
  vec3 p = abs(fract(vec3(h) + k) * 6.0 - 3.0);
  return v * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s);
}
`

const FRAG_BODY = /* glsl */ `
{
  float hC = texture2D(uHeight, vTUv).r;
  float hR = texture2D(uHeight, vTUv + vec2(uTexel.x, 0.0)).r;
  float hL = texture2D(uHeight, vTUv - vec2(uTexel.x, 0.0)).r;
  float hU = texture2D(uHeight, vTUv + vec2(0.0, uTexel.y)).r;
  float hD = texture2D(uHeight, vTUv - vec2(0.0, uTexel.y)).r;
  float gx = (hR - hL) * uVScale / (2.0 * uCell.x);
  float gn = (hU - hD) * uVScale / (2.0 * uCell.y);
  vec3 nrm = normalize(vec3(-gx, 1.0, gn));
  float slopeDeg = degrees(atan(length(vec2(gx, gn))));
  float aspectDeg = mod(degrees(atan(-gx, -gn)) + 360.0, 360.0);
  float tH = (hC - uHRange.x) / max(uHRange.y - uHRange.x, 1e-6);

  vec3 texel = diffuseColor.rgb;
  vec3 layerCol = texel;
  if (uLayer == 1) layerCol = dwTurbo(tH);
  else if (uLayer == 2) layerCol = dwViridis(slopeDeg / uSlopeMax);
  else if (uLayer == 3) layerCol = dwHsv(aspectDeg / 360.0, 0.75, 0.95);
  else if (uLayer == 4) {
    float sh = clamp(dot(nrm, normalize(uSun)), 0.0, 1.0);
    layerCol = vec3(0.12 + 0.88 * sh);
  }
  if (uLayer != 0) {
    float lum = dot(texel, vec3(0.299, 0.587, 0.114));
    layerCol = mix(layerCol, layerCol * (0.55 + 0.9 * lum), uTexMix);
  }
  vec3 col = layerCol;

  if (uShade > 0.0 && uLayer != 4) {
    float sh = clamp(dot(nrm, normalize(uSun)), 0.0, 1.0);
    col *= mix(1.0, 0.3 + 0.85 * sh, uShade);
  }

  if (uContour > 0.0) {
    float f = hC / uContour;
    float d = max(fwidth(f), 1e-5);
    float minorDist = abs(fract(f + 0.5) - 0.5);
    float minorLine = 1.0 - smoothstep(0.0, d * 1.3, minorDist);
    float f5 = f / 5.0;
    float d5 = max(fwidth(f5), 1e-5);
    float majorDist = abs(fract(f5 + 0.5) - 0.5);
    float majorLine = 1.0 - smoothstep(0.0, d5 * 1.5, majorDist);
    float minorVis = 1.0 - smoothstep(0.12, 0.35, d);
    vec3 lineCol = uLayer == 0 ? vec3(1.0, 0.86, 0.45) : vec3(0.05);
    col = mix(col, lineCol, minorLine * 0.5 * minorVis);
    col = mix(col, lineCol, majorLine * 0.9);
  }

  if (uFloodOn > 0.5 && hC < uFlood) {
    float depth = (uFlood - hC) / max(uHRange.y - uHRange.x, 1e-6);
    float a = 0.5 + 0.45 * smoothstep(0.0, 0.15, depth);
    col = mix(col, vec3(0.08, 0.42, 0.72), a);
  }
  diffuseColor.rgb = col;
}
`

export function makeTerrainUniforms(hf: HeightField, heightTex: THREE.Texture): TerrainUniforms {
  return {
    uHeight: { value: heightTex },
    uTexel: { value: new THREE.Vector2(1 / hf.width, 1 / hf.height) },
    uCell: { value: new THREE.Vector2(hf.dx, hf.dy) },
    uHRange: { value: new THREE.Vector2(hf.hMin, hf.hMax) },
    uLayer: { value: 0 },
    uContour: { value: 0 },
    uFlood: { value: hf.hMin },
    uFloodOn: { value: 0 },
    uShade: { value: 0 },
    uSun: { value: new THREE.Vector3(-0.6, 0.7, 0.4) },
    uTexMix: { value: 0.35 },
    uVScale: { value: hf.vscale },
    uSlopeMax: { value: 60 },
  }
}

export function makeTerrainMaterial(
  kind: 'standard' | 'basic',
  map: THREE.Texture,
  uniforms: TerrainUniforms,
): THREE.MeshStandardMaterial | THREE.MeshBasicMaterial {
  const material =
    kind === 'standard'
      ? new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <uv_vertex>', VERT_BODY)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAG_BODY}`)
  }
  material.customProgramCacheKey = () => `dw-terrain-${kind}`
  return material
}

/** Sun direction (unit vector toward the sun) from azimuth (deg clockwise from north) and elevation. */
export function sunDirection(azimuthDeg: number, elevationDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = (azimuthDeg * Math.PI) / 180
  const el = (elevationDeg * Math.PI) / 180
  // north = -Z, east = +X
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize()
}
