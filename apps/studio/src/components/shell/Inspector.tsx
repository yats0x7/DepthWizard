import { useStore, type Panel } from '../../store'
import { Segmented } from '../ui'
import { ViewPanel } from '../panels/ViewPanel'
import { AnalysePanel } from '../panels/AnalysePanel'
import { ValidatePanel } from '../panels/ValidatePanel'
import { DataPanel } from '../panels/DataPanel'
import { MapPanel } from '../panels/MapPanel'

export function Inspector() {
  const panel = useStore((s) => s.panel)
  const set = useStore((s) => s.set)
  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-line bg-panel 2xl:w-[340px]">
      <div className="flex items-center justify-center border-b border-line px-3 py-3">
        <Segmented<Panel>
          id="panel"
          size="sm"
          value={panel}
          onChange={(v) => set('panel', v)}
          options={[
            { value: 'view', label: 'View' },
            { value: 'analyse', label: 'Analyse' },
            { value: 'validate', label: 'Validate' },
            { value: 'data', label: 'Data' },
            { value: 'map', label: 'Map' },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {panel === 'view' && <ViewPanel />}
        {panel === 'analyse' && <AnalysePanel />}
        {panel === 'validate' && <ValidatePanel />}
        {panel === 'data' && <DataPanel />}
        {panel === 'map' && <MapPanel />}
      </div>
    </aside>
  )
}
