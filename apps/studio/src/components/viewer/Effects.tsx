import { EffectComposer, N8AO, Bloom, ToneMapping, Vignette, SMAA } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

export function Effects({ size }: { size: number }) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={size * 0.012} distanceFalloff={size * 0.03} intensity={1.6} quality="medium" halfRes depthAwareUpsampling />
      <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.28} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette eskil={false} offset={0.25} darkness={0.32} />
      <SMAA />
    </EffectComposer>
  )
}
