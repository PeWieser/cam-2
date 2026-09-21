import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Download, Eye, EyeOff, Play, Pause, RotateCcw, Upload, Calculator, Scan } from 'lucide-react';
import { Button, Field, Note, OriginPicker, Segmented, Slider } from './ui';
import { PRESETS, buildCodeChips, type CodeChip, type Contour, type OrientedMesh, type Settings, type Toolpath, type TopAxis, type MeshData } from '../types';
import { SUPPORTED_EXT } from '../lib/loaders';
import { cn } from '../utils/cn';

const ICON = { size: 15, strokeWidth: 1.7 };

export function StepFrame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="fade-in flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg2">{lead}</p>
      </div>
      {children}
    </div>
  );
}

// 1 ------------------------------------------------------------------------------
export function ModelStep({ mesh, onFile, loading }: { mesh: MeshData | null; onFile: (f: File) => void; loading: boolean }) {
  const inp = useRef<HTMLInputElement>(null);
  return (
    <StepFrame title="Modell laden" lead="Ziehe eine 3D-Datei auf die Bühne oder wähle sie aus. Alles bleibt auf deinem Rechner.">
      <input ref={inp} type="file" className="hidden" accept={SUPPORTED_EXT.map((e) => '.' + e).join(',')}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      <Button primary onClick={() => inp.current?.click()} icon={<Upload {...ICON} />} disabled={loading}>
        {loading ? 'Wird gelesen…' : mesh ? 'Andere Datei wählen' : 'Datei wählen'}
      </Button>
      {mesh && (
        <div className="rounded-md border border-line bg-s2 px-3 py-2 text-[12px]">
          <div className="truncate text-fg">{mesh.name}</div>
          <div className="num text-fg3">{mesh.triangleCount.toLocaleString('de-DE')} Dreiecke</div>
        </div>
      )}
      <p className="text-[11px] text-fg3">STL · OBJ · 3MF · STEP · IGES</p>
    </StepFrame>
  );
}

// 2 ------------------------------------------------------------------------------
const AXES: { v: TopAxis; l: string }[] = [
  { v: '+z', l: 'Z+' }, { v: '-z', l: 'Z−' }, { v: '+x', l: 'X+' }, { v: '-x', l: 'X−' }, { v: '+y', l: 'Y+' }, { v: '-y', l: 'Y−' },
];
export function OrientStep({ s, set, om }: { s: Settings; set: (p: Partial<Settings>) => void; om: OrientedMesh | null }) {
  return (
    <StepFrame title="Oberseite festlegen" lead="Welche Seite des Modells soll nach oben – also zum Stichel – zeigen? Die Bühne zeigt das Ergebnis sofort.">
      <Segmented value={s.topAxis} onChange={(v) => set({ topAxis: v, ignored: [] })} cols={6}
        options={AXES.map((a) => ({ value: a.v, label: <span className="num">{a.l}</span>, hint: `Modellachse ${a.l} zeigt nach oben` }))} />
      {om && (
        <div className="num grid grid-cols-3 gap-2 text-[12px]">
          {['X', 'Y', 'Z'].map((ax, i) => (
            <div key={ax} className="rounded-md border border-line bg-s2 px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-fg3">{ax}</div>
              <div className="text-fg">{(om.max[i] - om.min[i]).toFixed(2)} mm</div>
            </div>
          ))}
        </div>
      )}
    </StepFrame>
  );
}

// 3 ------------------------------------------------------------------------------
export function SliceStep({ s, set, om, contours }: { s: Settings; set: (p: Partial<Settings>) => void; om: OrientedMesh | null; contours: Contour[] }) {
  const h = om ? om.max[2] - om.min[2] : 1;
  return (
    <StepFrame title="Schnittebene wählen" lead="Das Modell wird in dieser Höhe aufgeschnitten. Die blauen Linien sind, was der Stichel abfährt. Knapp unter der Oberkante erfasst du Schrift und Gravuren auf der Oberseite.">
      <Slider label="Tiefe unter Oberkante" value={s.sliceOffset} min={0} max={h} step={Math.max(h / 1000, 0.01)}
        onChange={(v) => set({ sliceOffset: +v.toFixed(3), ignored: [] })} />
      <div className="flex gap-1.5">
        {[0.05, 0.2, 0.5].filter((v) => v < h).map((v) => (
          <button key={v} onClick={() => set({ sliceOffset: v, ignored: [] })}
            className={cn('num h-7 rounded-md border px-2 text-[11.5px] transition-colors', s.sliceOffset === v ? 'border-accent text-accent' : 'border-line text-fg2 hover:bg-s3')}>
            {v} mm
          </button>
        ))}
        <button onClick={() => set({ sliceOffset: +(h / 2).toFixed(2), ignored: [] })}
          className="h-7 rounded-md border border-line px-2 text-[11.5px] text-fg2 transition-colors hover:bg-s3">Mitte</button>
      </div>
      <Field label="Kurvengenauigkeit" value={s.tolerance} min={0.005} step={0.01} unit="mm" onChange={(v) => set({ tolerance: v })}
        hint="Maximale Abweichung von der Originalkurve. Kleiner = feiner, längerer G-Code." />
      <Note kind={contours.length ? 'info' : 'warn'}>
        {contours.length
          ? <><span className="num">{contours.length}</span> Konturen gefunden (<span className="num">{contours.filter((c) => c.closed).length}</span> geschlossen).</>
          : 'Auf dieser Höhe schneidet die Ebene das Modell nicht. Schiebe den Regler etwas tiefer.'}
      </Note>
    </StepFrame>
  );
}

// 4 ------------------------------------------------------------------------------
export function OriginStep({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  return (
    <StepFrame title="Nullpunkt setzen" lead="Wo steht der Stichel bei X0 Y0 Z0? Die Pfeile auf der Bühne zeigen den Punkt am Werkstück – dort wird an der Maschine der Nullpunkt angefahren.">
      <OriginPicker value={s.originXY} onChange={(v) => set({ originXY: v })} />
      <div>
        <div className="mb-1 text-[12px] text-fg2">Z-Nullpunkt</div>
        <Segmented value={s.originZ} onChange={(v) => set({ originZ: v })}
          options={[{ value: 'top', label: 'Oberfläche', hint: 'Z0 liegt auf der Werkstückoberfläche (üblich)' }, { value: 'bottom', label: 'Gravurgrund', hint: 'Z0 liegt am tiefsten Punkt der Gravur' }]} />
      </div>
    </StepFrame>
  );
}

// 5 ------------------------------------------------------------------------------
export function DepthStep({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  const passes = Math.max(1, Math.ceil(s.depth / Math.max(s.stepDown, 0.01) - 1e-9));
  return (
    <StepFrame title="Gravur festlegen" lead="Wie soll der Stichel den Linien folgen, und wie tief? Für Frontplatten typisch: Umriss oder Mittellinie, 0,1–0,4 mm tief.">
      <Segmented value={s.strategy} onChange={(v) => set({ strategy: v })} options={[
        { value: 'contour', label: 'Umriss', hint: 'Jede Kontur wird abgefahren' },
        { value: 'centerline', label: 'Mittellinie', hint: 'Schrift & Zahlen als einzelner Strich' },
        { value: 'fill', label: 'Fläche', hint: 'Flächen mit Schraffur ausräumen' },
      ]} />
      <p className="-mt-2 text-[11.5px] leading-snug text-fg3">
        {s.strategy === 'contour' && 'Umriss – klassische Liniengravur oder Außenkontur freistellen.'}
        {s.strategy === 'centerline' && 'Mittellinie – dünne Schrift und Zahlen als ein Strich.'}
        {s.strategy === 'fill' && 'Fläche – Kontur plus 45°-Schraffur zum Ausräumen.'}
      </p>
      {(s.strategy === 'contour' || s.strategy === 'fill') && (
        <div>
          <div className="mb-1 text-[12px] text-fg2">Werkzeug relativ zur Linie</div>
          <Segmented value={s.pathSide} onChange={(v) => set({ pathSide: v })} options={[
            { value: 'on', label: 'Auf Linie', hint: 'Stichel folgt der Kontur exakt (Gravur)' },
            { value: 'outside', label: 'Außen', hint: 'Schaftfräser außen – Platte freistellen' },
            { value: 'inside', label: 'Innen', hint: 'Schaftfräser innen – Tasche / Aussparung' },
          ]} />
          {s.pathSide !== 'on' && (
            <p className="mt-1 text-[11.5px] text-fg3">
              Offset um Schaft-Ø/2 = <span className="num">{(s.tool.shaftDia / 2).toFixed(2)} mm</span>
              {s.pathSide === 'outside' ? ' nach außen' : ' nach innen'} (im Schritt Werkzeug änderbar).
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gravurtiefe" value={s.depth} min={0.01} step={0.05} unit="mm" onChange={(v) => set({ depth: v })} />
        <Field label="Zustellung je Durchgang" value={s.stepDown} min={0.01} step={0.05} unit="mm" onChange={(v) => set({ stepDown: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sicherheitshöhe" value={s.safeZ} min={0.5} step={0.5} unit="mm" onChange={(v) => set({ safeZ: v })} />
        {s.strategy === 'fill' && <Field label="Zeilenabstand" value={s.stepOver} min={0.05} step={0.05} unit="mm" onChange={(v) => set({ stepOver: v })} />}
      </div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line bg-s2 px-3 py-2">
        <div>
          <div className="text-[12.5px] text-fg">Y spiegeln</div>
          <div className="text-[11px] text-fg3">Rückseitengravur – Front von hinten</div>
        </div>
        <button
          type="button" role="switch" aria-checked={s.mirrorY}
          onClick={() => set({ mirrorY: !s.mirrorY })}
          className={cn('relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-150', s.mirrorY ? 'bg-accent' : 'bg-s4')}
        >
          <span className={cn('absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left] duration-150', s.mirrorY ? 'left-[14px]' : 'left-[2px]')} />
        </button>
      </label>
      <Note>{passes} Durchgang{passes > 1 ? 'e' : ''} je Kontur, zuletzt auf <span className="num">{s.originZ === 'top' ? `−${s.depth.toFixed(2)}` : '0'} mm</span>.</Note>
    </StepFrame>
  );
}

// 6 ------------------------------------------------------------------------------
export function SelectStep({ s, set, contours }: { s: Settings; set: (p: Partial<Settings>) => void; contours: Contour[] }) {
  const active = contours.filter((c) => !s.ignored.includes(c.id) && c.length >= s.minLength);
  // „Außenkante“ = größte geschlossene Kontur(en): klar dominant in der Fläche (Plattenumriss)
  // oder alle depth-0, wenn es genau eine maximale Hülle gibt.
  const closed = contours.filter((c) => c.closed);
  const maxArea = closed.reduce((m, c) => Math.max(m, c.area), 0);
  const outer = closed
    .filter((c) => c.area >= maxArea * 0.85 || (c.depth === 0 && c.area >= maxArea * 0.5 && closed.filter((x) => x.depth === 0).length === 1))
    .map((c) => c.id);
  // Fallback: einfach die größte
  const outerIds = outer.length ? outer : (closed.sort((a, b) => b.area - a.area)[0] ? [closed.sort((a, b) => b.area - a.area)[0].id] : []);
  const toggle = (id: number) => set({ ignored: s.ignored.includes(id) ? s.ignored.filter((x) => x !== id) : [...s.ignored, id] });
  const allOuterIgnored = outerIds.length > 0 && outerIds.every((id) => s.ignored.includes(id));
  // Nur Features: alles außer den kleinen (nicht-äußeren)
  const featureOnly = () => {
    // ignore largest contour(s)
    set({ ignored: Array.from(new Set([...s.ignored, ...outerIds])) });
  };
  return (
    <StepFrame title="Konturen auswählen" lead="Klicke auf der Bühne auf eine Linie, um sie zu überspringen. Typisch bei Frontplatten: die große Außenkante weglassen und nur Schrift/Logo gravieren.">
      <div className="flex flex-wrap gap-1.5">
        <Button onClick={() => set({ ignored: allOuterIgnored ? s.ignored.filter((id) => !outerIds.includes(id)) : Array.from(new Set([...s.ignored, ...outerIds])) })}
          icon={allOuterIgnored ? <Eye {...ICON} /> : <EyeOff {...ICON} />} disabled={!outerIds.length}>
          Außenkante {allOuterIgnored ? 'einschließen' : 'überspringen'}
        </Button>
        <Button onClick={featureOnly} icon={<EyeOff {...ICON} />} disabled={!outerIds.length || allOuterIgnored}>
          Nur Features
        </Button>
        <Button onClick={() => set({ ignored: [] })} icon={<RotateCcw {...ICON} />} disabled={!s.ignored.length}>Alle einschließen</Button>
      </div>
      <Field label="Kürzer als … überspringen" value={s.minLength} min={0} step={0.1} unit="mm" onChange={(v) => set({ minLength: v })} hint="Filtert Kleinstkonturen wie Rundungsartefakte." />
      <div className="max-h-64 overflow-y-auto rounded-md border border-line">
        {contours.map((c) => {
          const off = s.ignored.includes(c.id) || c.length < s.minLength;
          return (
            <button key={c.id} onClick={() => toggle(c.id)}
              className={cn('flex w-full items-center gap-2 border-b border-line px-2.5 py-1.5 text-left text-[12px] last:border-b-0 hover:bg-s3', off && 'text-fg3')}>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', off ? 'bg-s4' : 'bg-accent')} />
              <span className="flex-1">Kontur {c.id + 1}{c.depth === 0 && c.closed ? ' · außen' : c.depth > 0 ? ` · Ebene ${c.depth}` : c.closed ? '' : ' · offen'}</span>
              <span className="num text-fg3">{c.length.toFixed(1)} mm</span>
            </button>
          );
        })}
      </div>
      <Note kind={active.length ? 'info' : 'warn'}>{active.length ? <><span className="num">{active.length}</span> von <span className="num">{contours.length}</span> Konturen werden gefräst.</> : 'Keine Kontur ausgewählt – es gäbe nichts zu fräsen.'}</Note>
    </StepFrame>
  );
}

// 7 ------------------------------------------------------------------------------
export function ToolStep({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  const t = s.tool;
  return (
    <StepFrame title="Werkzeug" lead="Der Stichel erscheint über dem Nullpunkt. Die Maße dienen der Darstellung und der Berechnung der Gravurbreite.">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Spitzenwinkel" value={t.tipAngle} min={5} max={120} step={5} unit="°" onChange={(v) => set({ tool: { ...t, tipAngle: v } })} />
        <Field label="Spitze Ø" value={t.tipDia} min={0.05} step={0.05} unit="mm" onChange={(v) => set({ tool: { ...t, tipDia: v } })} />
        <Field label="Schaft Ø" value={t.shaftDia} min={1} step={0.5} unit="mm" onChange={(v) => set({ tool: { ...t, shaftDia: v } })} />
      </div>
      <Note>Gravurbreite bei <span className="num">{s.depth.toFixed(2)} mm</span> Tiefe: <span className="num">{(t.tipDia + 2 * s.depth * Math.tan((t.tipAngle * Math.PI) / 360)).toFixed(2)} mm</span></Note>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Vorschub" value={s.feedXY} min={10} step={50} unit="mm/min" onChange={(v) => set({ feedXY: v })} />
        <Field label="Eintauchen" value={s.feedZ} min={10} step={10} unit="mm/min" onChange={(v) => set({ feedZ: v })} />
        <Field label="Drehzahl" value={s.rpm} min={0} step={500} unit="U/min" onChange={(v) => set({ rpm: v })} />
      </div>
    </StepFrame>
  );
}

// 8 ------------------------------------------------------------------------------
export function ComputeStep({ tp, stale, computing, onCompute, progress, setProgress, view, setView, canCompute }: {
  tp: Toolpath | null; stale: boolean; computing: boolean; onCompute: () => void;
  progress: number; setProgress: (v: number) => void; view: '3d' | 'top'; setView: (v: '3d' | 'top') => void; canCompute: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const speedRef = useRef(1);
  useEffect(() => {
    if (!playing || !tp) return;
    let raf = 0, last = performance.now();
    const total = tp.cutLength + tp.rapidLength;
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      const mmPerSec = Math.max(total / 20, 5) * speedRef.current; // ganze Fahrt ≈ 20 s
      const next = progressRef.current + (mmPerSec * dt) / total;
      if (next >= 1) { setProgress(1); setPlaying(false); return; }
      setProgress(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, tp]);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlaying(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <StepFrame title="Werkzeugweg berechnen" lead="Erst auf Knopfdruck wird der komplette Fahrweg berechnet – blau ist Fräsen, rot gestrichelt ist Eilgang. Danach kannst du den Stichel den Weg abfahren lassen.">
      <Button primary onClick={onCompute} disabled={!canCompute || computing} icon={<Calculator {...ICON} />}>
        {computing ? 'Berechne…' : tp && !stale ? 'Neu berechnen' : 'Werkzeugweg berechnen'}
      </Button>
      {tp && stale && <Note kind="warn">Einstellungen wurden geändert – der gezeigte Weg ist veraltet. Bitte neu berechnen.</Note>}
      {!canCompute && <Note kind="warn">Keine Konturen ausgewählt. Gehe zurück zu „Auswahl“ oder „Schnittebene“.</Note>}
      {tp && (
        <>
          <div className="num grid grid-cols-2 gap-2 text-[12px]">
            <Stat label="Fräsweg" v={`${tp.cutLength.toFixed(0)} mm`} />
            <Stat label="Eilgang" v={`${tp.rapidLength.toFixed(0)} mm`} />
            <Stat label="Durchgänge" v={String(tp.passes)} />
            <Stat label="Dauer ≈" v={fmtTime(tp.timeMin)} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[12px] text-fg2">
              <span>Simulation</span>
              <span className="num text-fg">{Math.round(progress * 100)} %</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { if (progress >= 1) setProgress(0); setPlaying(!playing); }} aria-label={playing ? 'Pause' : 'Abspielen'}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-s2 hover:bg-s3">
                {playing ? <Pause {...ICON} /> : <Play {...ICON} />}
              </button>
              <input type="range" min={0} max={1} step={0.0005} value={progress} onChange={(e) => { setPlaying(false); setProgress(parseFloat(e.target.value)); }} />
            </div>
          </div>
          <div>
            <div className="mb-1 text-[12px] text-fg2">Ansicht</div>
            <Segmented value={view} onChange={setView} options={[{ value: '3d', label: '3D' }, { value: 'top', label: 'Von oben (2D)' }]} />
          </div>
        </>
      )}
    </StepFrame>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return <div className="rounded-md border border-line bg-s2 px-2.5 py-1.5"><div className="font-sans text-[10.5px] uppercase tracking-wide text-fg3">{label}</div><div className="text-fg">{v}</div></div>;
}
export function fmtTime(min: number) {
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 60) return `${min.toFixed(1)} min`;
  return `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`;
}

// 9 ------------------------------------------------------------------------------
const CHIP_MIME = 'application/x-stichel-chip';

export function ProgramStep({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  const [focus, setFocus] = useState<'start' | 'end'>('start');
  const [dragOver, setDragOver] = useState<'start' | 'end' | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const chips = useMemo(() => buildCodeChips(), []);

  const applyChip = (chip: CodeChip, target: 'start' | 'end') => {
    if (chip.kind === 'preset-start') {
      set({ startBlock: chip.code, presetId: chip.id.replace('ps-', '') });
      return;
    }
    if (chip.kind === 'preset-end') {
      set({ endBlock: chip.code, presetId: chip.id.replace('pe-', '') });
      return;
    }
    // snippet: anhängen
    if (target === 'start') set({ startBlock: (s.startBlock.trimEnd() + '\n' + chip.code).trim(), presetId: 'custom' });
    else set({ endBlock: (s.endBlock.trimEnd() + '\n' + chip.code).trim(), presetId: 'custom' });
  };

  const onDrop = (target: 'start' | 'end', e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    setDraggingId(null);
    const raw = e.dataTransfer.getData(CHIP_MIME) || e.dataTransfer.getData('text/plain');
    if (!raw) return;
    try {
      const chip = JSON.parse(raw) as CodeChip;
      applyChip(chip, target);
    } catch {
      // plain text drop
      if (target === 'start') set({ startBlock: (s.startBlock.trimEnd() + '\n' + raw).trim(), presetId: 'custom' });
      else set({ endBlock: (s.endBlock.trimEnd() + '\n' + raw).trim(), presetId: 'custom' });
    }
  };

  return (
    <StepFrame title="Programm-Rahmen" lead="Was die Maschine vor und nach der Gravur tut. Ziehe Bausteine in die Code-Felder – sie werden zu G-Code. Oder wähle eine Vorlage.">
      <div>
        <div className="mb-1 text-[12px] text-fg2">Vorlage (setzt Start und Ende)</div>
        <Segmented value={s.presetId === 'custom' ? 'grbl' : s.presetId} cols={2}
          onChange={(id) => { const p = PRESETS.find((x) => x.id === id)!; set({ presetId: id, startBlock: p.start, endBlock: p.end }); }}
          options={PRESETS.map((p) => ({ value: p.id, label: p.name }))} />
      </div>

      <div>
        <div className="mb-1.5 text-[12px] text-fg2">Bausteine – ziehen oder klicken</div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              draggable
              title={chip.hint || chip.code}
              onDragStart={(e) => {
                setDraggingId(chip.id);
                e.dataTransfer.setData(CHIP_MIME, JSON.stringify(chip));
                e.dataTransfer.setData('text/plain', chip.code);
                e.dataTransfer.effectAllowed = 'copy';
                // Ghost: kurze Preview
                const ghost = document.createElement('div');
                ghost.className = 'num rounded-md border border-accent bg-s1 px-2 py-1 text-[11px] text-fg shadow-lg';
                ghost.textContent = chip.code.split('\n')[0];
                ghost.style.position = 'absolute'; ghost.style.top = '-1000px';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 0, 0);
                requestAnimationFrame(() => ghost.remove());
              }}
              onDragEnd={() => { setDraggingId(null); setDragOver(null); }}
              onClick={() => applyChip(chip, focus)}
              className={cn(
                'group relative h-7 select-none rounded-md border px-2 text-[11.5px] transition-all duration-150',
                draggingId === chip.id ? 'scale-95 border-accent bg-accent-soft text-accent opacity-60' : 'border-line bg-s2 text-fg2 hover:border-line-strong hover:text-fg',
                chip.kind.startsWith('preset') && 'border-dashed'
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-fg3">
          Klick hängt an <span className="text-fg">{focus === 'start' ? 'Start' : 'Ende'}</span>.
          Ziehen in ein Feld ersetzt (Vorlage) oder hängt an (Befehl).
        </p>
      </div>

      <DropBlock
        label="Start"
        value={s.startBlock}
        active={focus === 'start'}
        isOver={dragOver === 'start'}
        onChange={(v) => set({ startBlock: v, presetId: 'custom' })}
        onFocus={() => setFocus('start')}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOver('start'); }}
        onDragLeave={() => setDragOver((d) => (d === 'start' ? null : d))}
        onDrop={(e) => onDrop('start', e)}
      />
      <DropBlock
        label="Ende"
        value={s.endBlock}
        active={focus === 'end'}
        isOver={dragOver === 'end'}
        onChange={(v) => set({ endBlock: v, presetId: 'custom' })}
        onFocus={() => setFocus('end')}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOver('end'); }}
        onDragLeave={() => setDragOver((d) => (d === 'end' ? null : d))}
        onDrop={(e) => onDrop('end', e)}
      />

      <p className="text-[11px] text-fg3">
        Platzhalter: <span className="num">{'{rpm}'}</span> · <span className="num">{'{safe}'}</span> · <span className="num">{'{feed}'}</span>
      </p>
    </StepFrame>
  );
}

function DropBlock({ label, value, onChange, onFocus, active, isOver, onDragOver, onDragLeave, onDrop }: {
  label: string; value: string; onChange: (v: string) => void; onFocus: () => void; active: boolean; isOver: boolean;
  onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] text-fg2">{label}</span>
        {isOver && <span className="text-[11px] text-accent fade-in">Loslassen → wird zu Code</span>}
      </div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'relative rounded-md border transition-all duration-200',
          isOver ? 'border-accent bg-accent-soft ring-2 ring-accent/30 scale-[1.01]' : active ? 'border-accent' : 'border-line'
        )}
      >
        {isOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-accent-soft/80 fade-in">
            <span className="num rounded-md border border-accent bg-s1 px-3 py-1.5 text-[12px] text-accent shadow-sm">→ Code einfügen</span>
          </div>
        )}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          rows={5}
          spellCheck={false}
          className="num w-full resize-y rounded-md bg-s2 px-2.5 py-2 text-[12px] leading-relaxed text-fg outline-none"
        />
      </div>
    </div>
  );
}

// 10 -----------------------------------------------------------------------------
export function ExportStep({ gcode, fileName, tp }: { gcode: string; fileName: string; tp: Toolpath | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!gcode) return;
    await navigator.clipboard.writeText(gcode);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) { e.preventDefault(); copy(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcode]);
  const download = () => {
    const blob = new Blob([gcode], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = fileName.replace(/\.[^.]+$/, '') + '.gcode'; a.click(); URL.revokeObjectURL(a.href);
  };
  const lines = useMemo(() => (gcode ? gcode.split('\n') : []), [gcode]);
  return (
    <StepFrame title="Exportieren" lead="Prüfe den G-Code, dann herunterladen oder mit Strg + C kopieren. Der Code entspricht exakt dem Weg auf der Bühne.">
      {!tp && <Note kind="warn">Noch kein Werkzeugweg berechnet – gehe zu „Berechnen“.</Note>}
      <div className="flex gap-2">
        <Button primary onClick={download} disabled={!gcode} icon={<Download {...ICON} />}>Herunterladen</Button>
        <Button onClick={copy} disabled={!gcode} icon={copied ? <Check {...ICON} /> : <Copy {...ICON} />}>{copied ? 'Kopiert' : 'Kopieren'}</Button>
      </div>
      {gcode && (
        <div className="num text-[12px] text-fg3">
          <span className="text-fg">{lines.length.toLocaleString('de-DE')}</span> Zeilen ·{' '}
          <span className="text-fg">{(gcode.length / 1024).toFixed(1)} kB</span>
          {tp && <> · Fräsweg <span className="text-fg">{tp.cutLength.toFixed(0)} mm</span></>}
          <div className="mt-1 font-sans text-[11.5px] text-fg3">Vollständiger Code rechts neben der 3D-Ansicht.</div>
        </div>
      )}
    </StepFrame>
  );
}

export { Scan };
