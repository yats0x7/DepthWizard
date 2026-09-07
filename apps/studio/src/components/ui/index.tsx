import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { motion, LayoutGroup } from 'motion/react'
import { Slider as RSlider, Switch as RSwitch, Tooltip as RTooltip } from 'radix-ui'
import { cn } from '../../lib/cn'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger'; size?: 'sm' | 'md' }>(
  ({ className, variant = 'outline', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[background,color,border,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45',
        size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-9 px-3.5 text-[13px]',
        variant === 'primary' && 'bg-accent text-ground hover:bg-[#3ddcf4]',
        variant === 'outline' && 'border border-line-2 bg-raised/60 text-ink hover:bg-raised hover:border-ink-3',
        variant === 'ghost' && 'text-ink-2 hover:bg-raised hover:text-ink',
        variant === 'danger' && 'border border-danger/40 text-danger hover:bg-danger/10',
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

export function Segmented<T extends string>({ value, options, onChange, id, size = 'md', className }: { value: T; options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[]; onChange: (v: T) => void; id: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <LayoutGroup id={id}>
      <div role="radiogroup" className={cn('relative inline-flex rounded-full border border-line-2 bg-panel-2 p-0.5', className)}>
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              role="radio"
              aria-checked={active}
              title={o.title}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={cn(
                'relative rounded-full font-medium transition-colors disabled:opacity-40',
                size === 'sm' && 'px-2.5 py-1 text-[12px]',
                size === 'md' && 'px-3 py-1.5 text-[13px]',
                size === 'lg' && 'px-4 py-2 text-[14px]',
                active ? 'text-ground' : 'text-ink-2 hover:text-ink',
              )}
            >
              {active && <motion.span layoutId={`${id}-pill`} transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }} className="absolute inset-0 rounded-full bg-accent" />}
              <span className="relative z-10 flex items-center gap-1.5">{o.label}</span>
            </button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}

export function Slider({ value, min, max, step, onChange, disabled, format, className }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean; format?: (v: number) => string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <RSlider.Root className="relative flex h-5 grow touch-none select-none items-center" value={[value]} min={min} max={max} step={step} disabled={disabled} onValueChange={([v]) => onChange(v)}>
        <RSlider.Track className="relative h-1 grow rounded-full bg-line-2">
          <RSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RSlider.Track>
        <RSlider.Thumb className="block h-4 w-4 rounded-full border-2 border-accent bg-ground shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-transform hover:scale-110 focus-visible:outline-2 disabled:opacity-40" aria-label="value" />
      </RSlider.Root>
      <span className="num w-14 shrink-0 text-right text-[12px] text-ink-2">{format ? format(value) : value}</span>
    </div>
  )
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <label className={cn('flex cursor-pointer items-center justify-between gap-3 text-[13px]', disabled && 'opacity-45')}>
      <span>{label}</span>
      <RSwitch.Root checked={checked} disabled={disabled} onCheckedChange={onChange} className="relative h-5 w-9 rounded-full border border-line-2 bg-panel-2 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent/30">
        <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-ink-2 transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent" />
      </RSwitch.Root>
    </label>
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('h-8 w-full rounded-lg border border-line-2 bg-panel-2 px-2 text-[13px] text-ink outline-none hover:border-ink-3 focus-visible:border-accent', className)}
      {...props}
    >
      {children}
    </select>
  )
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('h-8 w-full rounded-lg border border-line-2 bg-panel-2 px-2 text-[13px] text-ink outline-none placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-accent', className)} {...props} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export function Tip({ content, children, side = 'bottom' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Provider delayDuration={350}>
      <RTooltip.Root>
        <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
        <RTooltip.Portal>
          <RTooltip.Content side={side} sideOffset={6} className="z-50 max-w-64 rounded-lg border border-line-2 bg-raised px-2.5 py-1.5 text-[12px] text-ink shadow-panel">
            {content}
            <RTooltip.Arrow className="fill-raised" />
          </RTooltip.Content>
        </RTooltip.Portal>
      </RTooltip.Root>
    </RTooltip.Provider>
  )
}

export function Progress({ value, className, active }: { value: number; className?: string; active?: boolean }) {
  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-line', className)}>
      <div className="relative h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}>
        {active && <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent" style={{ animation: 'sheen 1.6s linear infinite' }} />}
      </div>
    </div>
  )
}

export function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'accent' | 'muted' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[12px] text-ink-3">{label}</span>
      <span className={cn('num text-[13px]', tone === 'accent' && 'text-accent', tone === 'accent' && 'text-accent')}>
        {value}
        {unit && <span className="ml-0.5 text-[11px] text-ink-3">{unit}</span>}
      </span>
    </div>
  )
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}
