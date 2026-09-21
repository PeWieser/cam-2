import { useId, type ReactNode } from 'react';
import { cn } from '../utils/cn';
import type { OriginXY } from '../types';

export function Field({ label, value, onChange, min, max, step = 0.1, unit, hint }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; unit?: string; hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] text-fg2">{label}</label>
      <div className="flex h-8 items-center rounded-md border border-line bg-s2 transition-colors focus-within:border-accent">
        <input
          id={id}
          type="number"
          value={value}
          min={min} max={max} step={step}
          title={hint}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }}
          className="num h-full w-full bg-transparent px-2.5 text-[13px] text-fg outline-none"
        />
        {unit && <span className="num pr-2.5 text-[11px] text-fg3">{unit}</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] leading-snug text-fg3">{hint}</p>}
    </div>
  );
}

export function Slider({ label, value, onChange, min, max, step = 0.01, unit = 'mm', format }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; unit?: string; format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-[12px] text-fg2">{label}</span>
        <span className="num text-[12px] text-fg">{format ? format(value) : value.toFixed(2)} {unit}</span>
      </div>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} title={hint}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md py-1 text-left"
    >
      <span className="text-[12px] text-fg2">{label}</span>
      <span className={cn('relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-150', checked ? 'bg-accent' : 'bg-s4')}>
        <span className={cn('absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left] duration-150', checked ? 'left-[14px]' : 'left-[2px]')} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange, cols }: {
  options: { value: T; label: ReactNode; hint?: string }[]; value: T; onChange: (v: T) => void; cols?: number;
}) {
  return (
    // Spalten mindestens so breit wie ihr Text („Standard“ wird nicht abgeschnitten),
    // bei Platz gleichmäßig gestreckt.
    <div className="grid gap-1 rounded-lg bg-s3 p-1" style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(max-content, 1fr))` }} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value} title={o.hint}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 whitespace-nowrap rounded-md px-2.5 text-[12px] font-medium transition-colors duration-150',
            value === o.value ? 'bg-s1 text-fg shadow-[var(--mw-shadow)]' : 'text-fg2 hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({ children, onClick, primary, disabled, icon, className, title }: {
  children?: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean;
  icon?: ReactNode; className?: string; title?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        primary ? 'bg-accent text-accent-fg hover:brightness-110' : 'border border-line bg-s2 text-fg hover:bg-s3',
        className
      )}
    >
      {icon}{children}
    </button>
  );
}

const ORIGIN_GRID: OriginXY[] = [
  'back-left', 'back-center', 'back-right',
  'center-left', 'center', 'center-right',
  'front-left', 'front-center', 'front-right',
];
const ORIGIN_LABEL: Record<OriginXY, string> = {
  'back-left': 'hinten links', 'back-center': 'hinten Mitte', 'back-right': 'hinten rechts',
  'center-left': 'Mitte links', 'center': 'Mitte', 'center-right': 'Mitte rechts',
  'front-left': 'vorne links', 'front-center': 'vorne Mitte', 'front-right': 'vorne rechts',
};

export function OriginPicker({ value, onChange }: { value: OriginXY; onChange: (v: OriginXY) => void }) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative grid grid-cols-3 gap-1 rounded-lg border border-line bg-s2 p-2" role="radiogroup" aria-label="Nullpunkt XY">
        {ORIGIN_GRID.map((o) => (
          <button
            key={o} type="button" role="radio" aria-checked={value === o} title={ORIGIN_LABEL[o]}
            onClick={() => onChange(o)}
            className={cn('flex h-8 w-8 items-center justify-center rounded transition-colors duration-150', value === o ? 'bg-accent' : 'bg-s3 hover:bg-s4')}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', value === o ? 'bg-white' : 'bg-fg3')} />
          </button>
        ))}
      </div>
      <div className="text-[12px] leading-relaxed text-fg2">
        <div className="text-fg">{ORIGIN_LABEL[value]}</div>
        <div className="text-fg3">Oben = hinten (Y+),<br />unten = vorne (Y−)</div>
      </div>
    </div>
  );
}

export function Note({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'warn' | 'ok' | 'danger' }) {
  const color = { info: 'text-fg2 border-line', warn: 'text-warn border-warn/30', ok: 'text-ok border-ok/30', danger: 'text-danger border-danger/30' }[kind];
  return <div role="status" className={cn('rounded-md border bg-s2 px-3 py-2 text-[12px] leading-relaxed', color)}>{children}</div>;
}
