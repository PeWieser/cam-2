import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Redo2, Undo2, Upload } from 'lucide-react';
import Stage from './components/Stage';
import { ComputeStep, DepthStep, ExportStep, ModelStep, OrientStep, OriginStep, ProgramStep, SelectStep, SliceStep, ToolStep } from './components/steps';
import { useSettings } from './store';
import { loadModelFile } from './lib/loaders';
import { computeToolpath, orientMesh, originPoint, settingsKey, sliceContours } from './lib/toolpath';
import { generateGcode } from './lib/gcode';
import { STEPS, type MeshData, type StepId, type Toolpath } from './types';
import { cn } from './utils/cn';

export default function App() {
  return (
    <ErrorBoundary>
      <Workbench />
    </ErrorBoundary>
  );
}

function Workbench() {
  const { settings: s, set, undo, redo, canUndo, canRedo } = useSettings();
  const [mesh, setMesh] = useState<MeshData | null>(null);
  const [step, setStep] = useState<StepId>('model');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tp, setTp] = useState<Toolpath | null>(null);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState<'3d' | 'top'>('3d');

  // Abgeleitete Geometrie (günstig → live)
  const om = useMemo(() => (mesh ? orientMesh(mesh, s.topAxis) : null), [mesh, s.topAxis]);
  const slice = useMemo(() => (om ? sliceContours(om, s.sliceOffset, s.tolerance) : null), [om, s.sliceOffset, s.tolerance]);
  const contours = slice?.contours ?? [];
  const origin = useMemo(() => (om ? originPoint(om, s.originXY) : null), [om, s.originXY]);
  const activeCount = contours.filter((c) => !s.ignored.includes(c.id) && c.length >= s.minLength).length;
  const stale = !!tp && tp.settingsKey !== settingsKey(s);
  const gcode = useMemo(() => (tp && mesh && !stale ? generateGcode(tp, s, mesh.name) : ''), [tp, s, mesh, stale]);

  const handleFile = useCallback(async (f: File) => {
    setError(null); setLoading(true);
    try {
      setMesh(await loadModelFile(f));
      setTp(null); setProgress(0);
      set({ ignored: [] });
      setStep('orient');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Datei konnte nicht gelesen werden.');
    } finally { setLoading(false); }
  }, [set]);

  const compute = useCallback(() => {
    if (!om) return;
    setComputing(true);
    // UI zuerst antworten lassen
    setTimeout(() => {
      try {
        const r = computeToolpath(om, contours, s);
        setTp(r); setProgress(0);
        if (!r) setError('Mit diesen Einstellungen entsteht kein Werkzeugweg.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Berechnung fehlgeschlagen.');
      } finally { setComputing(false); }
    }, 20);
  }, [om, contours, s]);

  // Tastatur: Pfeile für Schritte
  const idx = STEPS.findIndex((x) => x.id === step);
  const canGo = (id: StepId) => id === 'model' || !!mesh;
  const go = useCallback((dir: 1 | -1) => {
    const n = STEPS[idx + dir];
    if (n && canGo(n.id)) setStep(n.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, mesh]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight' && e.altKey) go(1);
      if (e.key === 'ArrowLeft' && e.altKey) go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // Sichtbarkeit je Schritt
  const showPlane = step === 'slice' || step === 'select' || step === 'orient';
  const showOrigin = step !== 'model' && step !== 'orient' && step !== 'slice';
  const showTool = step === 'tool' || step === 'compute' || step === 'program' || step === 'export';
  const showPath = (step === 'compute' || step === 'program' || step === 'export') && !!tp && !stale;
  const showGcode = step === 'export' && !!gcode;
  const zTopWorld = om ? om.max[2] : null;
  const zProgramTop = s.originZ === 'top' ? 0 : s.depth;

  const panel = (() => {
    switch (step) {
      case 'model': return <ModelStep mesh={mesh} onFile={handleFile} loading={loading} />;
      case 'orient': return <OrientStep s={s} set={set} om={om} />;
      case 'slice': return <SliceStep s={s} set={set} om={om} contours={contours} />;
      case 'origin': return <OriginStep s={s} set={set} />;
      case 'depth': return <DepthStep s={s} set={set} />;
      case 'select': return <SelectStep s={s} set={set} contours={contours} />;
      case 'tool': return <ToolStep s={s} set={set} />;
      case 'compute': return <ComputeStep tp={tp} stale={stale} computing={computing} onCompute={compute} progress={progress} setProgress={setProgress} view={view} setView={setView} canCompute={activeCount > 0} />;
      case 'program': return <ProgramStep s={s} set={set} />;
      case 'export': return <ExportStep gcode={gcode} fileName={mesh?.name ?? 'gravur'} tp={tp && !stale ? tp : null} />;
    }
  })();

  return (
    <div className="flex h-full flex-col bg-bg text-fg"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}>

      {/* Kopf */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-s1 px-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-accent text-[10px] font-bold text-accent-fg">S</span>
          <span className="text-[13px] font-semibold tracking-tight">Stichel</span>
          <span className="hidden text-[12px] text-fg3 sm:block">· 3D-Modell → Gravur-G-Code</span>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn onClick={undo} disabled={!canUndo} title="Rückgängig (Strg+Z)"><Undo2 size={15} strokeWidth={1.7} /></IconBtn>
          <IconBtn onClick={redo} disabled={!canRedo} title="Wiederholen (Strg+Shift+Z)"><Redo2 size={15} strokeWidth={1.7} /></IconBtn>
          {mesh && <span className="num ml-2 hidden max-w-[260px] truncate text-[12px] text-fg3 md:block">{mesh.name}</span>}
        </div>
      </header>

      {error && (
        <div role="status" className="flex items-center justify-between border-b border-danger/30 bg-s1 px-4 py-2 text-[12.5px] text-danger">
          <span>{error}</span>
          <button className="text-fg3 hover:text-fg" onClick={() => setError(null)}>Schließen</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Schritte */}
        <nav className="flex w-[168px] shrink-0 flex-col border-r border-line bg-s1 py-2" aria-label="Ablauf">
          {STEPS.map((x, i) => {
            const enabled = canGo(x.id);
            const done = i < idx;
            return (
              <button key={x.id} disabled={!enabled} onClick={() => setStep(x.id)} aria-current={step === x.id ? 'step' : undefined}
                className={cn('group flex items-center gap-2.5 px-3 py-[7px] text-left text-[12.5px] transition-colors',
                  step === x.id ? 'text-fg' : enabled ? 'text-fg2 hover:text-fg' : 'text-fg3/60')}>
                <span className={cn('num flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10.5px] transition-colors',
                  step === x.id ? 'border-accent bg-accent text-accent-fg' : done ? 'border-line-strong text-fg2' : 'border-line text-fg3')}>
                  {done ? <Check size={11} strokeWidth={2.2} /> : i + 1}
                </span>
                {x.title}
              </button>
            );
          })}
        </nav>

        {/* Panel */}
        <section className="flex w-[360px] shrink-0 flex-col border-r border-line bg-s1">
          <div className="min-h-0 flex-1 overflow-y-auto" key={step}>{panel}</div>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
            <button onClick={() => go(-1)} disabled={idx === 0} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-fg2 hover:text-fg disabled:opacity-30">
              <ChevronLeft size={15} strokeWidth={1.7} /> Zurück
            </button>
            {idx < STEPS.length - 1 && (
              <button onClick={() => go(1)} disabled={!mesh} className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-3 text-[12.5px] font-medium text-accent-fg hover:brightness-110 disabled:opacity-30">
                Weiter <ChevronRight size={15} strokeWidth={1.7} />
              </button>
            )}
          </div>
        </section>

        {/* Bühne + optional G-Code */}
        <main className="relative flex min-w-0 flex-1">
          <div className={cn('relative min-w-0', showGcode ? 'w-[48%]' : 'w-full')}>
            <Stage
              mesh={om} sliceZ={slice?.z ?? null} showPlane={showPlane}
              contours={contours} ignored={s.ignored} selectable={step === 'select'}
              onToggleContour={(id) => set({ ignored: s.ignored.includes(id) ? s.ignored.filter((x) => x !== id) : [...s.ignored, id] })}
              origin={origin} originZ={om ? (s.originZ === 'top' ? om.max[2] : om.max[2] - s.depth) : null} showOrigin={showOrigin}
              tool={showTool ? s.tool : null}
              toolpath={showPath ? tp : null} originForPath={origin} zTopWorld={zTopWorld} zProgramTop={zProgramTop}
              progress={progress} view={view} dimmed={showPath}
            />
            {!mesh && (
              <div className={cn('pointer-events-none absolute inset-0 flex items-center justify-center transition-colors duration-200', dragOver && 'bg-accent-soft')}>
                <div className={cn('flex flex-col items-center gap-3 rounded-xl border border-dashed px-14 py-12 transition-colors duration-200', dragOver ? 'border-accent' : 'border-line-strong')}>
                  <Upload size={22} strokeWidth={1.5} className="text-fg3" />
                  <div className="text-[13px] text-fg">3D-Datei hierher ziehen</div>
                  <div className="text-[12px] text-fg3">oder links „Datei wählen“</div>
                </div>
              </div>
            )}
            {mesh && (
              <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 text-[11px] text-fg3">
                <Legend color="bg-accent" label={step === 'select' ? 'wird gefräst' : 'Kontur'} />
                {step === 'select' && <Legend color="bg-s4" label="übersprungen" />}
                {showPath && <Legend color="bg-danger" label="Eilgang" />}
                <span>Ziehen: drehen · Rad: zoomen · Rechts: verschieben</span>
              </div>
            )}
            {dragOver && mesh && <div className="pointer-events-none absolute inset-0 border-2 border-accent bg-accent-soft" />}
          </div>
          {showGcode && (
            <aside className="flex w-[52%] flex-col border-l border-line bg-s1 fade-in">
              <GCodePane gcode={gcode} />
            </aside>
          )}
        </main>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, disabled, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title}
      className="flex h-7 w-7 items-center justify-center rounded-md text-fg2 transition-colors hover:bg-s3 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className={cn('h-[2px] w-4 rounded', color)} />{label}</span>;
}

function GCodePane({ gcode }: { gcode: string }) {
  const lines = useMemo(() => gcode.split('\n'), [gcode]);
  const MAX = 2000;
  const shown = lines.length > MAX ? lines.slice(0, MAX) : lines;
  const colorize = (line: string) => {
    const t = line.trim();
    if (!t) return 'text-fg3';
    if (t.startsWith(';')) return 'text-fg3 italic';
    if (/^G0\b/i.test(t)) return 'text-danger';
    if (/^G1\b/i.test(t)) return 'text-accent';
    if (/^M\d/i.test(t)) return 'text-warn';
    return 'text-fg';
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-fg3">G-Code</span>
        <span className="flex gap-3 text-[10.5px] text-fg3">
          <span><span className="text-accent">●</span> G1 Schnitt</span>
          <span><span className="text-danger">●</span> G0 Eilgang</span>
          <span><span className="text-warn">●</span> M-Befehle</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[#0c0c0e]">
        <table className="w-full border-collapse">
          <tbody>
            {shown.map((line, i) => (
              <tr key={i} className="hover:bg-white/[0.03]">
                <td className="num w-12 select-none whitespace-nowrap border-r border-line px-2 py-0 text-right align-top text-[10px] text-fg3">{i + 1}</td>
                <td className={cn('num whitespace-pre px-3 py-0 text-[12px] leading-5', colorize(line))}>{line || ' '}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lines.length > MAX && (
          <div className="border-t border-line px-3 py-2 text-[11px] text-fg3">
            … und {(lines.length - MAX).toLocaleString('de-DE')} weitere Zeilen in Download / Zwischenablage
          </div>
        )}
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (this.state.err) {
      return (
        <div className="flex h-full items-center justify-center bg-bg p-8 text-fg">
          <div className="max-w-md rounded-lg border border-line bg-s1 p-5">
            <div className="text-[14px] font-semibold">Etwas ist schiefgelaufen</div>
            <p className="mt-1 text-[12.5px] text-fg2">{this.state.err.message}</p>
            <button onClick={() => location.reload()} className="mt-4 h-8 rounded-md bg-accent px-3 text-[12.5px] font-medium text-accent-fg">Neu laden</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
