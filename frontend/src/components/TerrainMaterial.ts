import * as THREE from 'three'

/**
 * Terrain shader: draped texture or analytic layers (hypsometric tint, slope, aspect),
 * hillshade from a movable sun, optional contour lines and a flood level.
 */
export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

export const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D map;
  uniform int layer;        // 0 texture, 1 hypsometric, 2 slope, 3 aspect
  uniform float hMin;       // world Y of min height
  uniform float hMax;       // world Y of max height
  uniform float vscale;     // world Y per data unit
  uniform vec3 sunDir;
  uniform float contourStep; // in data units, 0 = off
  uniform float flood;       // world Y, < -1e8 = off
  uniform float texMix;      // blend of texture under analytic layers
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  vec3 turbo(float t) {
    t = clamp(t, 0.0, 1.0);
    const vec3 c0 = vec3(0.1140, 0.0628, 0.2248), c1 = vec3(6.7160, 3.1822, 7.5714), c2 = vec3(-66.094, -4.9279, -10.094);
    const vec3 c3 = vec3(228.766, 25.0498, -91.541), c4 = vec3(-334.835, -69.3174, 288.586), c5 = vec3(218.764, 67.5231, -305.204), c6 = vec3(-52.889, -21.5452, 110.517);
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
  }
  vec3 hyps(float t) { // green -> yellow -> brown -> white
    vec3 a = vec3(0.16, 0.42, 0.20), b = vec3(0.80, 0.75, 0.30), c = vec3(0.55, 0.36, 0.22), d = vec3(0.96, 0.96, 0.98);
    return t < 0.33 ? mix(a, b, t / 0.33) : t < 0.66 ? mix(b, c, (t - 0.33) / 0.33) : mix(c, d, (t - 0.66) / 0.34);
  }

  void main() {
    vec3 n = normalize(vNormalW);
    float t = (vPosW.y - hMin) / max(hMax - hMin, 1e-6);
    float slope = degrees(acos(clamp(n.y, 0.0, 1.0)));
    vec3 tex = texture2D(map, vUv).rgb;
    vec3 col;
    if (layer == 0) col = tex;
    else if (layer == 1) col = mix(tex, hyps(t), 0.85);
    else if (layer == 2) col = mix(tex, turbo(slope / 60.0), 0.9);
    else { float a = atan(n.x, n.z); col = mix(tex, 0.5 + 0.5 * vec3(cos(a), cos(a + 2.094), cos(a + 4.188)), 0.9); }
    float diff = clamp(dot(n, normalize(sunDir)), 0.0, 1.0);
    float light = 0.32 + 0.78 * diff;
    col *= light;
    if (contourStep > 0.0) {
      float h = (vPosW.y - hMin) / vscale;
      float f = abs(fract(h / contourStep + 0.5) - 0.5) * contourStep;
      float w = fwidth(h) * 1.2;
      float line = 1.0 - smoothstep(0.0, w, f);
      col = mix(col, vec3(0.05), line * 0.55);
    }
    if (flood > -1e8 && vPosW.y < flood) {
      float depth = clamp((flood - vPosW.y) / max(hMax - hMin, 1e-6) * 4.0, 0.15, 0.85);
      col = mix(col, vec3(0.05, 0.35, 0.75), depth);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`

export function makeTerrainMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      map: { value: texture }, layer: { value: 0 }, hMin: { value: 0 }, hMax: { value: 1 }, vscale: { value: 1 },
      sunDir: { value: new THREE.Vector3(-0.5, 0.8, -0.5) }, contourStep: { value: 0 }, flood: { value: -1e9 }, texMix: { value: 0.2 },
    },
    side: THREE.DoubleSide,
  })
}
