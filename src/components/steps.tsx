import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Download, Eye, EyeOff, Play, Pause, RotateCcw, Upload, Calculator, Scan } from 'lucide-react';
import { Button, Field, Note, OriginPicker, Segmented, Slider } from './ui';
import { PRESETS, type Contour, type OrientedMesh, type Settings, type Toolpath, type TopAxis, type MeshData } from '../types';
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
    <StepFrame title="Gravur festlegen" lead="Wie soll der Stichel den Linien folgen, und wie tief?">
      <Segmented value={s.strategy} onChange={(v) => set({ strategy: v })} options={[
        { value: 'contour', label: 'Umriss', hint: 'Jede Kontur wird genau abgefahren' },
        { value: 'centerline', label: 'Mittellinie', hint: 'Schrift & Zahlen als einzelner Strich in der Mitte' },
        { value: 'fill', label: 'Fläche', hint: 'Flächen mit Schraffur ausräumen' },
      ]} />
      <p className="-mt-2 text-[11.5px] leading-snug text-fg3">
        {s.strategy === 'contour' && 'Umrisslinien der Konturen – die klassische Gravur.'}
        {s.strategy === 'centerline' && 'Aus dünnen Formen (z. B. Buchstaben) wird die Strichmitte berechnet und nur einmal graviert.'}
        {s.strategy === 'fill' && 'Konturen plus 45°-Schraffur zum Ausräumen der Flächen.'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gravurtiefe" value={s.depth} min={0.01} step={0.05} unit="mm" onChange={(v) => set({ depth: v })} />
        <Field label="Zustellung je Durchgang" value={s.stepDown} min={0.01} step={0.05} unit="mm" onChange={(v) => set({ stepDown: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sicherheitshöhe" value={s.safeZ} min={0.5} step={0.5} unit="mm" onChange={(v) => set({ safeZ: v })} />
        {s.strategy === 'fill' && <Field label="Zeilenabstand" value={s.stepOver} min={0.05} step={0.05} unit="mm" onChange={(v) => set({ stepOver: v })} />}
      </div>
      <Note>{passes} Durchgang{passes > 1 ? 'e' : ''} je Kontur, zuletzt auf <span className="num">−{s.depth.toFixed(2)} mm</span>.</Note>
    </StepFrame>
  );
}

// 6 ------------------------------------------------------------------------------
export function SelectStep({ s, set, contours }: { s: Settings; set: (p: Partial<Settings>) => void; contours: Contour[] }) {
  const active = contours.filter((c) => !s.ignored.includes(c.id) && c.length >= s.minLength);
  const outer = contours.filter((c) => c.closed && c.depth === 0).map((c) => c.id);
  const toggle = (id: number) => set({ ignored: s.ignored.includes(id) ? s.ignored.filter((x) => x !== id) : [...s.ignored, id] });
  const allOuterIgnored = outer.length > 0 && outer.every((id) => s.ignored.includes(id));
  return (
    <StepFrame title="Konturen auswählen" lead="Klicke auf der Bühne auf eine Linie, um sie zu überspringen – zum Beispiel die Außenkante eines Würfels, wenn nur die Zahl graviert werden soll. Graue Linien werden nicht gefräst.">
      <div className="flex flex-wrap gap-1.5">
        <Button onClick={() => set({ ignored: allOuterIgnored ? s.ignored.filter((id) => !outer.includes(id)) : Array.from(new Set([...s.ignored, ...outer])) })}
          icon={allOuterIgnored ? <Eye {...ICON} /> : <EyeOff {...ICON} />} disabled={!outer.length}>
          Außenkante {allOuterIgnored ? 'einschließen' : 'überspringen'}
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
const SNIPPETS = [
  { l: 'Pause (M0)', t: 'M0 ; Pause – Weiter an der Maschine' },
  { l: 'Kühlung an', t: 'M8' }, { l: 'Kühlung aus', t: 'M9' },
  { l: 'Warten 2 s', t: 'G4 P2' }, { l: 'Werkzeuglänge messen', t: 'G38.2 Z-20 F50 ; Taster' },
];
export function ProgramStep({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  const [focus, setFocus] = useState<'start' | 'end'>('start');
  const add = (t: string) => focus === 'start' ? set({ startBlock: (s.startBlock.trimEnd() + '\n' + t).trim() }) : set({ endBlock: (s.endBlock.trimEnd() + '\n' + t).trim() });
  return (
    <StepFrame title="Programm-Rahmen" lead="Was die Maschine vor und nach der Gravur tun soll. Wähle eine Vorlage für deine Steuerung und ergänze bei Bedarf einzelne Befehle.">
      <div>
        <div className="mb-1 text-[12px] text-fg2">Vorlage</div>
        <Segmented value={s.presetId} cols={2} onChange={(id) => { const p = PRESETS.find((x) => x.id === id)!; set({ presetId: id, startBlock: p.start, endBlock: p.end }); }}
          options={PRESETS.map((p) => ({ value: p.id, label: p.name }))} />
      </div>
      <Block label="Start" value={s.startBlock} onChange={(v) => set({ startBlock: v, presetId: 'custom' })} onFocus={() => setFocus('start')} active={focus === 'start'} />
      <Block label="Ende" value={s.endBlock} onChange={(v) => set({ endBlock: v, presetId: 'custom' })} onFocus={() => setFocus('end')} active={focus === 'end'} />
      <div>
        <div className="mb-1 text-[12px] text-fg2">Befehl an <span className="text-fg">{focus === 'start' ? 'Start' : 'Ende'}</span> anhängen</div>
        <div className="flex flex-wrap gap-1.5">
          {SNIPPETS.map((x) => <button key={x.l} onClick={() => add(x.t)} className="h-7 rounded-md border border-line px-2 text-[11.5px] text-fg2 hover:bg-s3">{x.l}</button>)}
        </div>
      </div>
      <p className="text-[11px] text-fg3">Platzhalter: <span className="num">{'{rpm}'}</span> Drehzahl · <span className="num">{'{safe}'}</span> Sicherheitshöhe · <span className="num">{'{feed}'}</span> Vorschub</p>
    </StepFrame>
  );
}
function Block({ label, value, onChange, onFocus, active }: { label: string; value: string; onChange: (v: string) => void; onFocus: () => void; active: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[12px] text-fg2">{label}</div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} rows={5} spellCheck={false}
        className={cn('num w-full resize-y rounded-md border bg-s2 px-2.5 py-2 text-[12px] leading-relaxed text-fg outline-none transition-colors', active ? 'border-accent' : 'border-line')} />
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
  const lines = gcode ? gcode.split('\n').length : 0;
  return (
    <StepFrame title="Exportieren" lead="Der G-Code entspricht genau dem gezeigten Weg. Herunterladen oder mit Strg + C kopieren.">
      {!tp && <Note kind="warn">Noch kein Werkzeugweg berechnet – gehe zu „Berechnen“.</Note>}
      <div className="flex gap-2">
        <Button primary onClick={download} disabled={!gcode} icon={<Download {...ICON} />}>Herunterladen</Button>
        <Button onClick={copy} disabled={!gcode} icon={copied ? <Check {...ICON} /> : <Copy {...ICON} />}>{copied ? 'Kopiert' : 'Kopieren'}</Button>
      </div>
      {gcode && (
        <div className="num text-[12px] text-fg3"><span className="text-fg">{lines.toLocaleString('de-DE')}</span> Zeilen · <span className="text-fg">{(gcode.length / 1024).toFixed(0)} kB</span></div>
      )}
    </StepFrame>
  );
}

export { Scan };
