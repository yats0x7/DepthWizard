import { Compass, Eye, Footprints, Layers3, MousePointer2, Plane, Sun } from 'lucide-react'
import { useStore, type Layer, type Nav } from '../../store'
import { Field, Section, Segmented, Select, Slider, Switch, Button } from '../ui'
import { fmt } from '../../lib/format'

export function ViewPanel() {
  const s = useStore()
  const hf = s.heightField
  const metric = hf?.units === 'm'
  const relief = hf ? hf.hMax - hf.hMin : 1
  const contourOptions = metric
    ? [0.5, 1, 2, 5, 10, 20, 50, 100].filter((v) => relief / v >= 2 && relief / v <= 400)
    : [0.02, 0.05, 0.1].filter((v) => relief / v >= 2 && relief / v <= 400)
  return (
    <>
      <Section title="Mode">
        <p className="text-[12px] leading-relaxed text-ink-3">
          {s.mode === 'presentation'
            ? 'Sky, sun shadows, ambient occlusion and tone mapping. The geometry is the same DSM as in Analysis.'
            : 'Flat, neutral lighting with an analytic hillshade. No post-processing. Exaggeration locked at 1.00.'}
        </p>
      </Section>
      <Section title="Navigate">
        <Segmented<Nav>
          id="nav"
          size="sm"
          value={s.nav}
          onChange={(v) => s.set('nav', v)}
          options={[
            { value: 'orbit', label: (<><MousePointer2 size={13} /> Orbit</>), title: 'Drag to orbit, scroll to zoom, right-drag to pan (1)' },
            { value: 'fly', label: (<><Plane size={13} /> Fly</>), title: 'Free flight with momentum (2)' },
            { value: 'walk', label: (<><Footprints size={13} /> Walk</>), title: 'Eye height follows the surface (3)' },
          ]}
        />
        <div className="grid grid-cols-4 gap-1.5">
          {(['overview', 'oblique', 'street', 'top'] as const).map((v) => (
            <Button key={v} size="sm" variant={s.viewpointName === v ? 'primary' : 'outline'} onClick={() => s.goTo(v)} className="capitalize">
              {v}
            </Button>
          ))}
        </div>
      </Section>
      <Section title="Vertical exaggeration" right={<span className={`num text-[12px] ${s.exaggeration !== 1 ? 'text-warm' : 'text-ink-3'}`}>×{s.exaggeration.toFixed(2)}</span>}>
        <Slider value={s.exaggeration} min={0.5} max={4} step={0.05} disabled={s.mode === 'analysis'} onChange={(v) => s.set('exaggeration', v)} format={(v) => `×${v.toFixed(2)}`} />
        <p className="text-[11px] text-ink-3">{s.mode === 'analysis' ? 'Locked at ×1.00 in Analysis mode so every reading matches the surface you see.' : 'Display only. Readouts always report true DSM heights.'}</p>
      </Section>
      <Section title="Surface layer">
        <Segmented<Layer>
          id="layer"
          size="sm"
          className="flex-wrap"
          value={s.layer}
          onChange={(v) => s.set('layer', v)}
          options={[
            { value: 'texture', label: 'Image' },
            { value: 'hypsometric', label: 'Height' },
            { value: 'slope', label: 'Slope', disabled: !s.meta?.input.georeferenced, title: s.meta?.input.georeferenced ? 'Slope in degrees' : 'Needs georeferencing' },
            { value: 'aspect', label: 'Aspect', disabled: !s.meta?.input.georeferenced, title: s.meta?.input.georeferenced ? 'Downslope direction' : 'Needs georeferencing' },
            { value: 'hillshade', label: 'Relief' },
          ]}
        />
        <Field label="Contours" hint={metric ? 'metres' : 'relative units'}>
          <Select value={String(s.contourStep)} onChange={(e) => s.set('contourStep', Number(e.target.value))}>
            <option value="0">Off</option>
            {contourOptions.map((v) => (
              <option key={v} value={v}>
                every {v} {metric ? 'm' : ''} (major every {v * 5})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mesh detail" hint={hf ? `stride ${Math.max(1, Math.ceil(Math.max(hf.width, hf.height) / s.meshDetail))} px` : ''}>
          <Select value={String(s.meshDetail)} onChange={(e) => s.set('meshDetail', Number(e.target.value))}>
            <option value="512">Light (512 grid)</option>
            <option value="1024">Balanced (1024 grid)</option>
            <option value="1536">High (1536 grid)</option>
            <option value="2048">Very high (2048 grid)</option>
            <option value="8192">Full resolution</option>
          </Select>
        </Field>
        {s.mode === 'analysis' && <Switch label="Wireframe (exact vertices)" checked={s.wireframe} onChange={(v) => s.set('wireframe', v)} />}
        <Switch label="Minimap" checked={s.showMinimap} onChange={(v) => s.set('showMinimap', v)} />
      </Section>
      {s.mode === 'presentation' && (
        <Section title="Light" right={<Sun size={14} className="text-warm" />}>
          <Field label="Sun azimuth" hint={`${Math.round(s.sun.azimuth)}° from north`}>
            <Slider value={s.sun.azimuth} min={0} max={360} step={1} onChange={(v) => s.set('sun', { ...s.sun, azimuth: v })} format={(v) => `${Math.round(v)}°`} />
          </Field>
          <Field label="Sun elevation" hint={s.sun.elevation < 20 ? 'raking light, long shadows' : ''}>
            <Slider value={s.sun.elevation} min={4} max={80} step={1} onChange={(v) => s.set('sun', { ...s.sun, elevation: v })} format={(v) => `${Math.round(v)}°`} />
          </Field>
          <Switch label="Shadows" checked={s.shadows} onChange={(v) => s.set('shadows', v)} />
          <Switch label="Ambient occlusion, bloom, vignette" checked={s.effects} onChange={(v) => s.set('effects', v)} />
        </Section>
      )}
      <Section title="Shortcuts" right={<Compass size={14} className="text-ink-3" />}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] text-ink-2">
          <dt><kbd className="kbd">Tab</kbd></dt><dd>Presentation / Analysis</dd>
          <dt><kbd className="kbd">1</kbd> <kbd className="kbd">2</kbd> <kbd className="kbd">3</kbd></dt><dd>Orbit / Fly / Walk</dd>
          <dt><kbd className="kbd">Shift</kbd>+click</dt><dd>Pin a height marker</dd>
          <dt><kbd className="kbd">L</kbd></dt><dd>Cycle surface layer</dd>
          <dt><kbd className="kbd">H</kbd></dt><dd>Hide panels</dd>
        </dl>
      </Section>
      <div className="flex items-center gap-2 px-4 py-3 text-[11px] text-ink-3">
        <Layers3 size={12} /> Mesh vertices are exact DSM samples; lower detail skips samples, never averages them. Readouts: {fmt(relief, metric ? 1 : 3)} {metric ? 'm' : ''} relief. <Eye size={12} />
      </div>
    </>
  )
}
