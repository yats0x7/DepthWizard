/**
 * Analytic sky dome: a camera-centred sphere with a small shader that blends zenith, horizon and
 * ground colours by view elevation and adds a sun disc with forward-scatter glow. Tone-mapped with
 * the scene so the terrain, fog and sky share one exposure.
 */
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`
const frag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uHaze;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y, -1.0, 1.0);
  float up = pow(max(h, 0.0), 0.42);
  vec3 sky = mix(uHorizon, uZenith, up);
  float cosA = clamp(dot(dir, uSunDir), -1.0, 1.0);
  // forward scatter: brightens the horizon band toward the sun
  float band = exp(-max(h, 0.0) * 6.0);
  sky += uSunColor * pow(max(cosA, 0.0), 6.0) * 0.18 * band * uHaze;
  sky += uSunColor * pow(max(cosA, 0.0), 48.0) * 0.55;
  float disc = smoothstep(0.99935, 0.99975, cosA);
  sky += uSunColor * disc * 6.0;
  // below the horizon: haze that darkens slowly so the terrain sits in a lit ground plane
  float below = clamp(-h, 0.0, 1.0);
  vec3 ground = mix(uHorizon * 0.93, uGround, pow(below, 0.55));
  sky = mix(ground, sky, smoothstep(-0.02, 0.01, h));
  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export interface SkyPalette {
  zenith: THREE.Color
  horizon: THREE.Color
  ground: THREE.Color
  sun: THREE.Color
}

/** Palette for a sun elevation in degrees: warm and low at dawn, blue and bright at noon. */
export function skyPalette(elevation: number): SkyPalette {
  const t = THREE.MathUtils.smoothstep(elevation, 2, 40)
  const zenith = new THREE.Color('#3c4f8a').lerp(new THREE.Color('#2458b8'), t)
  const horizon = new THREE.Color('#f2b27c').lerp(new THREE.Color('#c9dcee'), t)
  const ground = new THREE.Color('#6a5646').lerp(new THREE.Color('#7c8894'), t)
  const sun = new THREE.Color('#ffb36a').lerp(new THREE.Color('#fff3dc'), t)
  return { zenith, horizon, ground, sun }
}

export function SkyDome({ radius, sunDir, elevation }: { radius: number; sunDir: THREE.Vector3; elevation: number }) {
  const mesh = useRef<THREE.Mesh>(null!)
  const palette = useMemo(() => skyPalette(elevation), [elevation])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGround: { value: new THREE.Color() },
          uSunColor: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uHaze: { value: 1 },
        },
      }),
    [],
  )
  material.uniforms.uZenith.value.copy(palette.zenith)
  material.uniforms.uHorizon.value.copy(palette.horizon)
  material.uniforms.uGround.value.copy(palette.ground)
  material.uniforms.uSunColor.value.copy(palette.sun)
  material.uniforms.uSunDir.value.copy(sunDir)
  material.uniforms.uHaze.value = 1.6 - THREE.MathUtils.smoothstep(elevation, 5, 45)
  material.toneMapped = true

  useFrame(({ camera }) => {
    mesh.current.position.copy(camera.position)
  })
  return (
    <mesh ref={mesh} material={material} frustumCulled={false} renderOrder={-1000}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  )
}
