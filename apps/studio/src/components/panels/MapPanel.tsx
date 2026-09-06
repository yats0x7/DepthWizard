import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type Map as MapInstance, type Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapPin, Play, Search } from 'lucide-react'
import { api, type ImageryItem } from '../../lib/api'
import { useStore } from '../../store'
import { Button, Field, Input, Progress, Slider } from '../ui'
import { useRunOptions } from '../jobs/NewJob'

const DEFAULT_CENTER: [number, number] = [77.5946, 12.9716]

function bboxAround(center: [number, number], sizeKm: number): number[] {
  const [lon, lat] = center
  const halfLat = sizeKm / 2 / 110.574
  const halfLon = sizeKm / 2 / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 1e-6))
  return [lon - halfLon, lat - halfLat, lon + halfLon, lat + halfLat]
}

function areaKm2(bbox: number[]) {
  const lat = ((bbox[1] + bbox[3]) / 2) * (Math.PI / 180)
  return Math.abs(bbox[2] - bbox[0]) * 111.32 * Math.cos(lat) * Math.abs(bbox[3] - bbox[1]) * 110.574
}

export function MapPanel() {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapInstance | null>(null)
  const marker = useRef<Marker | null>(null)
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER)
  const [sizeKm, setSizeKm] = useState(3)
  const [query, setQuery] = useState('')
  const [coordinates, setCoordinates] = useState('')
  const [places, setPlaces] = useState<{ name: string; center: [number, number] }[]>([])
  const [items, setItems] = useState<ImageryItem[]>([])
  const [selected, setSelected] = useState<ImageryItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [opts] = useRunOptions()
  const refreshJobs = useStore((s) => s.refreshJobs)
  const openJob = useStore((s) => s.openJob)
  const bbox = useMemo(() => bboxAround(center, sizeKm), [center, sizeKm])

  useEffect(() => {
    if (!container.current) return
    const instance = new maplibregl.Map({
      container: container.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center,
      zoom: 11,
      attributionControl: { compact: true },
    })
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    const pin = new maplibregl.Marker({ color: '#22d3ee', draggable: true }).setLngLat(center).addTo(instance)
    pin.on('dragend', () => {
      const p = pin.getLngLat()
      setCenter([p.lng, p.lat])
    })
    map.current = instance
    marker.current = pin
    return () => {
      pin.remove()
      instance.remove()
      marker.current = null
      map.current = null
    }
  }, [])

  useEffect(() => {
    marker.current?.setLngLat(center)
    map.current?.flyTo({ center, duration: 500 })
    const feature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]],
        ]],
      },
      properties: {},
    }
    const source = map.current?.getSource('selection') as maplibregl.GeoJSONSource | undefined
    if (source) source.setData(feature as Parameters<typeof source.setData>[0])
    else if (map.current) {
      map.current.once('load', () => {
        if (!map.current || map.current.getSource('selection')) return
        map.current.addSource('selection', { type: 'geojson', data: feature as never })
        map.current.addLayer({ id: 'selection-fill', type: 'fill', source: 'selection', paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.12 } })
        map.current.addLayer({ id: 'selection-line', type: 'line', source: 'selection', paint: { 'line-color': '#22d3ee', 'line-width': 2 } })
      })
    }
  }, [bbox, center])

  async function findPlace() {
    if (!query.trim()) return
    setErr(null)
    try {
      const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`)
      if (!response.ok) throw new Error(`place search failed (${response.status})`)
      const data = await response.json()
      setPlaces(
        (data.features ?? []).flatMap((f: { geometry?: { coordinates?: number[] }; properties?: Record<string, string> }) => {
          const c = f.geometry?.coordinates
          if (!c || c.length < 2) return []
          const p = f.properties ?? {}
          return [{ name: [p.name, p.city, p.country].filter(Boolean).join(', '), center: [c[0], c[1]] as [number, number] }]
        }),
      )
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  function goToCoordinates() {
    const values = coordinates.split(',').map((value) => Number(value.trim()))
    if (values.length !== 2 || !values.every(Number.isFinite) || values[0] < -180 || values[0] > 180 || values[1] < -90 || values[1] > 90) {
      setErr('Coordinates must be longitude, latitude within EPSG:4326')
      return
    }
    setErr(null)
    setPlaces([])
    setCenter([values[0], values[1]])
  }

  async function findImagery() {
    setBusy(true)
    setErr(null)
    try {
      const found = await api.imagerySearch(bbox)
      setItems(found)
      setSelected(found[0] ?? null)
      if (!found.length) setErr('No licensed imagery covers this box. Try a smaller box or another place.')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function runSelected() {
    if (!selected) return
    setBusy(true)
    setErr(null)
    try {
      const job = await api.createFromArea(bbox, selected, opts)
      await refreshJobs()
      await openJob(job.id)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex gap-2">
        <Input value={query} placeholder="Search a place with Photon" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && findPlace()} />
        <Button size="sm" aria-label="Search place" onClick={findPlace}><Search size={14} /></Button>
      </div>
      <div className="flex gap-2">
        <Input value={coordinates} placeholder="longitude, latitude" onChange={(e) => setCoordinates(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goToCoordinates()} />
        <Button size="sm" aria-label="Go to coordinates" onClick={goToCoordinates}><MapPin size={14} /></Button>
      </div>
      {places.length > 0 && <div className="flex flex-col gap-1 rounded-lg border border-line-2 bg-panel-2 p-1">
        {places.map((place) => <button key={`${place.name}-${place.center.join(',')}`} className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-ink-2 hover:bg-raised" onClick={() => { setCenter(place.center); setPlaces([]) }}><MapPin size={13} className="text-accent" />{place.name || 'Unnamed place'}</button>)}
      </div>}
      <div ref={container} className="h-52 overflow-hidden rounded-panel border border-line-2" />
      <div className="flex flex-col gap-2">
        <Field label="Selection box" hint={`${areaKm2(bbox).toFixed(2)} km²`}>
          <Slider value={sizeKm} min={0.5} max={10} step={0.5} onChange={setSizeKm} format={(v) => `${v.toFixed(1)} km`} />
        </Field>
        <p className="text-[11px] text-ink-3">Drag the cyan pin to move the box. Imagery is fetched only inside this box.</p>
        <Button variant="primary" size="sm" disabled={busy} onClick={findImagery}>Find licensed imagery</Button>
      </div>
      {busy && <Progress value={0.5} active />}
      {items.length > 0 && <div className="flex flex-col gap-1.5">
        <span className="label">Available sources</span>
        {items.map((item) => <button key={`${item.source}-${item.id}`} onClick={() => setSelected(item)} className={`flex gap-2 rounded-lg border p-2 text-left ${selected?.id === item.id ? 'border-accent/60 bg-accent/10' : 'border-line-2 bg-panel-2 hover:bg-raised'}`}>
          {item.thumbnail ? <img src={item.thumbnail} alt="" className="h-10 w-14 rounded object-cover" /> : <span className="h-10 w-14 rounded bg-raised" />}
          <span className="min-w-0 flex-1"><span className="block truncate text-[12px] text-ink">{item.title}</span><span className="block text-[11px] text-ink-3">{item.source} · {item.date ?? 'undated'} · {item.gsd_m ? `${item.gsd_m} m` : 'unknown GSD'}</span><span className="block truncate text-[10px] text-ink-3">{item.license}</span></span>
        </button>)}
        <Button variant="primary" size="sm" disabled={!selected || busy} onClick={runSelected}><Play size={13} /> Fetch and run</Button>
      </div>}
      {selected?.attribution && <p className="text-[11px] leading-relaxed text-ink-3">Attribution: {selected.attribution}</p>}
      {err && <p className="text-[12px] text-danger">{err}</p>}
    </div>
  )
}
