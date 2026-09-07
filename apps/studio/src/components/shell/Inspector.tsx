import { AlertCircle, Eye, Ruler, ShieldCheck } from 'lucide-react'
import { useStore, type Panel } from '../../store'
import { fmt } from '../../lib/format'
import { Segmented } from '../ui'
import { ViewPanel } from '../panels/ViewPanel'
import { AnalysePanel } from '../panels/AnalysePanel'
import { ValidatePanel } from '../panels/ValidatePanel'

/**
 * What you got, in one glance, before any control. The old build made you open a tab called "Data"
 * to discover whether your heights were in metres, and buried file warnings three levels down.
 */
function ResultSummary() {
  const meta = useStore((s) => s.meta)
  const hf = useStore((s) => s.heightField)
  if (!meta || !hf) return null
  const metric = meta.units === 'm'
  const warnings = meta.input.warnings ?? []
  const relief = hf.hMax - hf.hMin
  return (
    <div className="flex flex-col gap-2 border-b border-line px-4 py-3.5">
      <div className="flex items-baseline gap-2">
        <span className="num text-[26px] leading-none text-ink">{fmt(relief, metric ? 1 : 2)}</span>
        <span className="text-[13px] text-ink-2">{metric ? 'metres' : 'units'} from lowest to highest</span>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-2">
        {metric ? (
          <>Heights are in <b className="text-ink">real metres</b>, anchored to {meta.calibration.dem?.source ? 'a public elevation map' : 'the method below'}. Click anywhere on the surface to measure it.</>
        ) : (
          <>Heights are <b className="text-ink">relative</b>, 0 to 1, because this file carries no coordinates. Add two known heights under Measure to convert to metres.</>
        )}
      </p>
      {hf.sampledEvery > 1 && (
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          This scene is large, so the viewer reads every {hf.sampledEvery}th pixel to stay responsive.
          Downloads and accuracy checks still use the full-resolution model.
        </p>
      )}
      {warnings.map((w, i) => (
        <p key={i} className="flex gap-2 rounded-md border border-accent/35 bg-accent/5 px-2.5 py-2 text-[12.5px] leading-relaxed text-ink-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-accent" />
          <span>{w}</span>
        </p>
      ))}
    </div>
  )
}

export function Inspector() {
  const panel = useStore((s) => s.panel)
  const set = useStore((s) => s.set)
  const hasJob = useStore((s) => !!s.heightField)
  if (!hasJob) return null
  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-line bg-panel 2xl:w-[360px]">
      <ResultSummary />
      <div className="flex items-center justify-center border-b border-line px-3 py-3">
        <Segmented<Panel>
          id="panel"
          size="sm"
          value={panel}
          onChange={(v) => set('panel', v)}
          options={[
            { value: 'look', label: (<><Eye size={13} /> Look</>), title: 'How the surface is displayed' },
            { value: 'measure', label: (<><Ruler size={13} /> Measure</>), title: 'Read heights, slopes and cross-sections' },
            { value: 'check', label: (<><ShieldCheck size={13} /> Check</>), title: 'Compare with reference data and export' },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {panel === 'look' && <ViewPanel />}
        {panel === 'measure' && <AnalysePanel />}
        {panel === 'check' && <ValidatePanel />}
      </div>
    </aside>
  )
}
