import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

const LINE_H = 20;

/** Einfache G-Code-Tokenisierung für Syntaxfarben */
function tokenize(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const ci = line.indexOf(';');
  const code = ci >= 0 ? line.slice(0, ci) : line;
  const comment = ci >= 0 ? line.slice(ci) : '';
  const re = /([GM]\d+(?:\.\d+)?)|([XYZ][-+]?\d*\.?\d+)|([FS][-+]?\d*\.?\d+)|([A-Z][-+]?\d*\.?\d*)|(\s+)|(\S+)/g;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(code))) {
    const t = m[0];
    if (m[1]) out.push(<span key={k++} className={t.startsWith('G0') || t === 'G00' ? 'text-danger' : t.startsWith('M') ? 'text-warn' : 'text-accent'}>{t}</span>);
    else if (m[2]) out.push(<span key={k++} className="text-fg">{t[0]}<span className="text-fg2">{t.slice(1)}</span></span>);
    else if (m[3]) out.push(<span key={k++} className="text-ok">{t}</span>);
    else out.push(<span key={k++} className="text-fg2">{t}</span>);
  }
  if (comment) out.push(<span key={k++} className="text-fg3 italic">{comment}</span>);
  return out;
}

export default function CodeView({ code, highlightLine }: { code: string; highlightLine?: number | null }) {
  const lines = useMemo(() => code.split('\n'), [code]);
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 80 });

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const update = () => {
      const start = Math.max(0, Math.floor(el.scrollTop / LINE_H) - 10);
      const end = Math.min(lines.length, Math.ceil((el.scrollTop + el.clientHeight) / LINE_H) + 10);
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update); ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [lines.length]);

  useEffect(() => {
    if (highlightLine == null || !ref.current) return;
    const el = ref.current;
    const y = highlightLine * LINE_H;
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - LINE_H) el.scrollTo({ top: y - el.clientHeight / 2, behavior: 'smooth' });
  }, [highlightLine]);

  const gutter = String(lines.length).length;
  return (
    <div ref={ref} className="num h-full w-full overflow-auto bg-bg text-[12px]" style={{ lineHeight: `${LINE_H}px` }}>
      <div style={{ height: lines.length * LINE_H, position: 'relative' }}>
        {lines.slice(range.start, range.end).map((l, i) => {
          const n = range.start + i;
          return (
            <div key={n} className={`absolute left-0 right-0 flex whitespace-pre ${n === highlightLine ? 'bg-accent-soft' : ''}`} style={{ top: n * LINE_H, height: LINE_H }}>
              <span className="sticky left-0 shrink-0 select-none border-r border-line bg-bg pr-3 pl-3 text-right text-fg3" style={{ width: `${gutter + 3}ch` }}>{n + 1}</span>
              <span className="pl-4">{tokenize(l)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
