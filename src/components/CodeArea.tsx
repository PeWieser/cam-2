import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { cn } from '../utils/cn';

const LINE_H = 20;
const PAD = 8;
export const DND_TYPE = 'application/x-gravura-gcode';

/** Textfeld für G-Code-Blöcke mit Drop-Zone: Chips/Presets fallen als Zeilen hinein */
export function CodeArea({ label, value, onChange, onFocus, active, rows = 5 }: {
  label: string; value: string; onChange: (v: string) => void; onFocus?: () => void; active?: boolean; rows?: number;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [dropLine, setDropLine] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ from: number; count: number } | null>(null);

  const lineFromEvent = (e: DragEvent) => {
    const el = ta.current!;
    const r = el.getBoundingClientRect();
    const y = e.clientY - r.top + el.scrollTop - PAD;
    const lines = value === '' ? 0 : value.split('\n').length;
    return Math.max(0, Math.min(lines, Math.round(y / LINE_H)));
  };

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DND_TYPE) && !e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropLine(lineFromEvent(e));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const text = (e.dataTransfer.getData(DND_TYPE) || e.dataTransfer.getData('text/plain')).replace(/\r/g, '').trim();
    setDropLine(null);
    if (!text) return;
    const at = lineFromEvent(e);
    const lines = value === '' ? [] : value.split('\n');
    const ins = text.split('\n');
    lines.splice(at, 0, ...ins);
    onChange(lines.join('\n'));
    setFlash({ from: at, count: ins.length });
    setTimeout(() => setFlash(null), 700);
    ta.current?.focus();
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px] text-fg2">
        <span>{label}</span>
        {dropLine !== null && <span className="text-accent">Hier einfügen</span>}
      </div>
      <div className={cn('relative rounded-md border bg-s2 transition-colors duration-150', dropLine !== null ? 'border-accent ring-1 ring-accent' : active ? 'border-line-strong' : 'border-line')}>
        <textarea
          ref={ta} value={value} rows={rows} spellCheck={false}
          onChange={(e) => onChange(e.target.value)} onFocus={onFocus}
          onDragOver={onDragOver} onDragLeave={() => setDropLine(null)} onDrop={onDrop}
          className="num relative z-10 block w-full resize-y bg-transparent px-2.5 text-[12px] text-fg outline-none"
          style={{ lineHeight: `${LINE_H}px`, paddingTop: PAD, paddingBottom: PAD }}
        />
        {dropLine !== null && (
          <div className="pointer-events-none absolute left-2 right-2 z-20 h-[2px] rounded bg-accent shadow-[0_0_6px_var(--mw-accent)]" style={{ top: PAD + dropLine * LINE_H - 1 - (ta.current?.scrollTop ?? 0) }} />
        )}
        {flash && (
          <div className="pointer-events-none absolute left-0 right-0 z-0 rounded bg-accent-soft" style={{ top: PAD + flash.from * LINE_H - (ta.current?.scrollTop ?? 0), height: flash.count * LINE_H, animation: 'fadeout 700ms ease-out forwards' }} />
        )}
      </div>
      <style>{`@keyframes fadeout { from { opacity: 1 } to { opacity: 0 } }`}</style>
    </div>
  );
}

/** Ziehbarer Chip: zeigt beim Ziehen den echten Code als Drag-Bild */
export function CodeChip({ label, code, hint, onClick, primaryLabel }: { label: string; code: string; hint?: string; onClick?: () => void; primaryLabel?: ReactNode }) {
  const ghost = useRef<HTMLDivElement>(null);
  return (
    <>
      <button
        type="button" draggable title={hint ?? code} onClick={onClick}
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_TYPE, code);
          e.dataTransfer.setData('text/plain', code);
          e.dataTransfer.effectAllowed = 'copy';
          if (ghost.current) {
            ghost.current.textContent = code;
            e.dataTransfer.setDragImage(ghost.current, 12, 12);
          }
        }}
        className="group inline-flex h-7 cursor-grab items-center gap-1.5 rounded-md border border-line bg-s2 px-2 text-[11.5px] text-fg2 transition-colors hover:border-line-strong hover:text-fg active:cursor-grabbing"
      >
        <span className="h-3 w-[3px] rounded-sm bg-s4 group-hover:bg-accent" aria-hidden />
        {primaryLabel ?? label}
      </button>
      {/* Drag-Bild: Code-Kachel */}
      <div ref={ghost} className="num pointer-events-none fixed -left-[9999px] top-0 whitespace-pre rounded-md border border-accent bg-s1 px-3 py-2 text-[12px] text-fg shadow-lg" />
    </>
  );
}
