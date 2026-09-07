import { ArrowRight, Compass, Download, Layers, MapPin, MousePointerClick, Plane, Ruler, ShieldCheck, Upload, Waves, Map as MapIcon } from 'lucide-react'
import { useStore } from '../../store'
import { Samples } from '../jobs/NewJob'
import { Button } from '../ui'

/**
 * The start page has to answer three questions before it asks for a file: what is this, what will
 * it give me, and can I try it without committing anything. The samples come first because the
 * fastest way to explain a height model is to let someone stand on one; everything below them is
 * for the person who wants to know what they are looking at before they click.
 */

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: 'It reads your image',
    body: 'A GeoTIFF carries a coordinate system and a pixel size, so heights can come out in real metres. A PNG or JPG has neither, so heights come out relative — still shaped correctly, just without a scale. The app tells you which one you got.',
  },
  {
    n: '02',
    title: 'A depth model looks at it',
    body: 'Depth Anything V2 runs across the image in overlapping tiles, so a scene far larger than the model can see in one go still comes out seamless. Each tile is aligned to its neighbours and blended, and a horizontally flipped pass is averaged in to cancel the model’s own left-right bias.',
  },
  {
    n: '03',
    title: 'The heights are anchored to the ground',
    body: 'The model only knows what is nearer and further, not how many metres. So we fetch a coarse public elevation map of the same footprint and fit the prediction to it: the elevation map supplies the slow, true shape of the land, and the model supplies the buildings, trees and edges it is far too coarse to see.',
  },
  {
    n: '04',
    title: 'You get a surface you can use',
    body: 'A Float32 GeoTIFF for GIS, a 16-bit heightmap, a hillshaded preview and a textured 3D mesh — plus the terrain in front of you, where every vertex is an exact sample of the model rather than a smoothed approximation of it.',
  },
]

const FEATURES: { icon: typeof Plane; title: string; body: string }[] = [
  { icon: Plane, title: 'Move through it', body: 'Orbit the whole scene, fly over it, or drop to walking height and follow a street.' },
  { icon: MousePointerClick, title: 'Measure any point', body: 'Click the surface for its height, its slope, and the direction the ground faces. Readings come from the height data itself, never from the display mesh.' },
  { icon: Ruler, title: 'Cut a cross-section', body: 'Two clicks draw a terrain profile between them, with distance, height gain and steepest grade.' },
  { icon: Waves, title: 'Raise a flood level', body: 'Slide a water plane up through the scene and watch what goes under, and what share of the ground it covers.' },
  { icon: Layers, title: 'Colour by what matters', body: 'The photo itself, height, steepness, which way slopes face, or shaded relief from a sun you can move.' },
  { icon: ShieldCheck, title: 'Check it against real data', body: 'Drop in a reference DSM or LiDAR raster and get RMSE, MAE, bias, NMAD, correlation, the share within 1 m and 3 m, and a signed error map.' },
  { icon: MapPin, title: 'Pin heights you know', body: 'One known point sets the zero. Two or more refit the scale as well, so a survey mark or a building of known height pulls the whole model onto the truth.' },
  { icon: Download, title: 'Take the data with you', body: 'GeoTIFF, 16-bit PNG, hillshade and a textured GLB, all written to disk and openable in QGIS, Blender or anything else.' },
]

const USES: { title: string; body: string }[] = [
  { title: 'Flood and disaster planning', body: 'Find what sits below a given water level before the water arrives.' },
  { title: 'Urban growth', body: 'Building heights and built volume over a district, from imagery you already have.' },
  { title: 'Line of sight', body: 'Whether a mast, a camera or a link can actually see what it is meant to see.' },
  { title: 'Site and solar survey', body: 'Slope, aspect and shading for somewhere no one has surveyed on the ground.' },
]

function Rule() {
  return <hr className="border-0 border-t border-line" />
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-[19px] font-semibold tracking-tight text-ink">{title}</h2>
      {sub && <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-ink-2">{sub}</p>}
    </div>
  )
}

export function Home({ onUpload, onMap }: { onUpload: () => void; onMap: () => void }) {
  const system = useStore((s) => s.system)
  const online = useStore((s) => s.online)

  return (
    <div className="h-full overflow-y-auto">
      <div className="rise mx-auto flex w-full max-w-3xl flex-col gap-12 px-8 py-14">
        {/* Hero */}
        <header className="flex flex-col gap-4">
          <span className="label">Digital surface models from a single image</span>
          <h1 className="text-[42px] font-semibold leading-[1.04] tracking-tight text-balance text-ink">
            How tall is everything in this photo?
          </h1>
          <p className="max-w-[62ch] text-[15.5px] leading-relaxed text-ink-2">
            Give DepthWizard one satellite or drone image. It works out the height of every point in
            it, anchors those heights to real metres using public elevation data, and hands back
            terrain you can fly through, measure and export.
          </p>
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1 text-[12.5px] text-ink-3">
            <span>One image in, no stereo pair</span>
            <span aria-hidden>·</span>
            <span>Runs on this machine</span>
            <span aria-hidden>·</span>
            <span>Nothing is uploaded anywhere</span>
          </p>
        </header>

        <Samples />

        <div className="flex flex-col gap-3">
          <span className="label">Or start from your own data</span>
          <div className="flex flex-wrap gap-2.5">
            <Button onClick={onUpload}>
              <Upload size={15} /> Open an image
            </Button>
            <Button onClick={onMap}>
              <MapIcon size={15} /> Pick a place on the map <ArrowRight size={14} className="text-ink-3" />
            </Button>
          </div>
        </div>

        <Rule />

        {/* How it works */}
        <section className="flex flex-col gap-7">
          <SectionHead
            title="What happens to your image"
            sub="Four steps, all of them on your own machine. The whole run takes roughly fifteen to thirty seconds for the sample scenes."
          />
          <ol className="flex flex-col gap-6">
            {STEPS.map((s) => (
              <li key={s.n} className="grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-1.5">
                <span className="num pt-0.5 text-[13px] text-accent">{s.n}</span>
                <h3 className="text-[14.5px] font-semibold tracking-tight text-ink">{s.title}</h3>
                <span />
                <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <Rule />

        {/* Features */}
        <section className="flex flex-col gap-7">
          <SectionHead
            title="What you can do with the result"
            sub="Everything below works on the height data itself, so a number you read here is a number you can defend."
          />
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 text-ink">
                  <f.icon size={16} className="text-accent" />
                  <h3 className="text-[14px] font-semibold tracking-tight">{f.title}</h3>
                </span>
                <p className="text-[13px] leading-relaxed text-ink-2">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <Rule />

        {/* Accuracy */}
        <section className="flex flex-col gap-6">
          <SectionHead title="How well does it actually do?" />
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { v: '3.0 m', l: 'RMSE on hilly terrain, measured against airborne LiDAR' },
              { v: '8', l: 'published test scenes across four kinds of terrain' },
              { v: '10 m', l: 'the pixel size of the satellite imagery those tests used' },
            ].map((n) => (
              <div key={n.l} className="flex flex-col gap-1.5">
                <span className="num text-[26px] leading-none text-ink">{n.v}</span>
                <span className="text-[12.5px] leading-relaxed text-ink-3">{n.l}</span>
              </div>
            ))}
          </div>
          <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-ink-2">
            One photograph cannot beat a stereo pair or a laser scan, and we do not claim it does.
            What it can do is cover the enormous amount of ground that has neither. Every run reports
            its own calibration quality, and every accuracy figure here comes from scenes whose
            imagery and reference data are both public and cited, so anyone can repeat the test.
          </p>
        </section>

        <Rule />

        {/* Uses */}
        <section className="flex flex-col gap-6">
          <SectionHead title="Where a height model like this is useful" />
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {USES.map((u) => (
              <div key={u.title} className="flex flex-col gap-1">
                <h3 className="text-[14px] font-semibold tracking-tight text-ink">{u.title}</h3>
                <p className="text-[13px] leading-relaxed text-ink-2">{u.body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-line pt-6 text-[12px] text-ink-3">
          <Compass size={13} />
          <span>DepthWizard{system?.version ? ` ${system.version}` : ''}</span>
          <span aria-hidden>·</span>
          <span>
            {online
              ? `engine running on ${system?.device?.toUpperCase() ?? 'this machine'}`
              : 'engine offline — start it to run anything'}
          </span>
        </footer>
      </div>
    </div>
  )
}
