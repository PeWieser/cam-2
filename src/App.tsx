import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Redo2, Undo2, Upload } from 'lucide-react';
import favicon from './assets/favicon.svg';
import Stage from './components/Stage';
import CodeView from './components/CodeView';
import { ComputeStep, ExportStep, MachiningStep, ModelStep, OrientStep, OriginStep, ProgramStep, SelectStep, SliceStep, ToolStep, OP_COLOR } from './components/steps';
import { useSettings } from './store';
import { loadModelFile } from './lib/loaders';
import { activeContours, computeToolpath, levelZ, opOf, orientMesh, originPoint, settingsKey, sliceLevels } from './lib/toolpath';
import { generateGcode } from './lib/gcode';
import { OP_LABEL, STEPS, type MeshData, type Op, type StepId, type Toolpath } from './types';
import { cn } from './utils/cn';

export default function App() {
  return <ErrorBoundary><Workbench /></ErrorBoundary>;
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
  const [level, setLevel] = useState(0);
  const [brush, setBrush] = useState<Op>('off');
  const [exportView, setExportView] = useState<'code' | 'stage'>('code');

  // Abgeleitete Geometrie (günstig → live)
  const om = useMemo(() => (mesh ? orientMesh(mesh, s) : null), [mesh, s.topAxis, s.rotZ, s.mirror, s.scale]); // eslint-disable-line react-hooks/exhaustive-deps
  const contours = useMemo(() => (om ? sliceLevels(om, s.sliceOffsets, s.tolerance) : []), [om, s.sliceOffsets, s.tolerance]);
  const origin = useMemo(() => (om ? originPoint(om, s.originXY) : null), [om, s.originXY]);
  const opLookup = useCallback((id: number) => opOf(s, id), [s.ops]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeCount = activeContours(contours, s).length;
  const stale = !!tp && tp.settingsKey !== settingsKey(s);
  const gcode = useMemo(() => (tp && mesh && !stale ? generateGcode(tp, s, mesh.name) : ''), [tp, s, mesh, stale]);
  const sliceZ = om && s.sliceOffsets[level] !== undefined ? levelZ(om, s.sliceOffsets[level]) : null;

  const handleFile = useCallback(async (f: File) => {
    setError(null); setLoading(true);
    try {
      const m = await loadModelFile(f);
      setMesh(m); setTp(null); setProgress(0); setLevel(0);
      const o = orientMesh(m, s);
      set({ ops: {}, material: +(o.max[2] - o.min[2]).toFixed(2) });
      setStep('orient');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Datei konnte nicht gelesen werden.');
    } finally { setLoading(false); }
  }, [set, s]);

  const compute = useCallback(() => {
    if (!om) return;
    setComputing(true);
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
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'ArrowRight' && e.altKey) go(1);
      if (e.key === 'ArrowLeft' && e.altKey) go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const showPlane = step === 'slice' || step === 'orient';
  const showOrigin = !['model', 'orient', 'slice'].includes(step);
  const showTool = ['tool', 'compute', 'program', 'export'].includes(step);
  const showPath = ['compute', 'program', 'export'].includes(step) && !!tp && !stale;
  const showCode = step === 'export' && exportView === 'code' && !!gcode;
  const zTopWorld = om ? om.max[2] : null;
  const zProgramTop = s.originZ === 'top' ? 0 : s.material;

  const panel = (() => {
    switch (step) {
      case 'model': return <ModelStep mesh={mesh} onFile={handleFile} loading={loading} />;
      case 'orient': return <OrientStep s={s} set={set} om={om} />;
      case 'slice': return <SliceStep s={s} set={set} om={om} contours={contours} level={level} setLevel={setLevel} />;
      case 'origin': return <OriginStep s={s} set={set} />;
      case 'machining': return <MachiningStep s={s} set={set} om={om} />;
      case 'select': return <SelectStep s={s} set={set} contours={contours} brush={brush} setBrush={setBrush} />;
      case 'tool': return <ToolStep s={s} set={set} />;
      case 'compute': return <ComputeStep tp={tp} stale={stale} computing={computing} onCompute={compute} progress={progress} setProgress={setProgress} view={view} setView={setView} canCompute={activeCount > 0} />;
      case 'program': return <ProgramStep s={s} set={set} />;
      case 'export': return <ExportStep gcode={gcode} fileName={mesh?.name ?? 'programm'} tp={tp && !stale ? tp : null} view={exportView} setView={setExportView} />;
    }
  })();

  return (
    <div className="flex h-full flex-col bg-bg text-fg"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}>

      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-s1 px-3">
        <div className="flex items-center gap-2">
          <img src={favicon} alt="" aria-hidden="true" className="h-5 w-5 rounded-[5px]" />
          <span className="text-[13px] font-semibold tracking-tight">Gravura</span>
          <span className="hidden text-[12px] text-fg3 sm:block">· Frontplatten aus 3D-Modellen fräsen</span>
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
        <nav className="flex w-[168px] shrink-0 flex-col border-r border-line bg-s1 py-2" aria-label="Ablauf">
          {STEPS.map((x, i) => {
            const enabled = canGo(x.id);
            const done = i < idx;
            return (
              <button key={x.id} disabled={!enabled} onClick={() => setStep(x.id)} aria-current={step === x.id ? 'step' : undefined}
                className={cn('flex items-center gap-2.5 px-3 py-[7px] text-left text-[12.5px] transition-colors', step === x.id ? 'text-fg' : enabled ? 'text-fg2 hover:text-fg' : 'text-fg3/60')}>
                <span className={cn('num flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10.5px] transition-colors',
                  step === x.id ? 'border-accent bg-accent text-accent-fg' : done ? 'border-line-strong text-fg2' : 'border-line text-fg3')}>
                  {done ? <Check size={11} strokeWidth={2.2} /> : i + 1}
                </span>
                {x.title}
              </button>
            );
          })}
        </nav>

        <section className="flex w-[380px] shrink-0 flex-col border-r border-line bg-s1">
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

        <main className="relative min-w-0 flex-1">
          <div className={cn('h-full', showCode && 'hidden')}>
            <Stage
              mesh={om} sliceZ={sliceZ} showPlane={showPlane}
              contours={contours} opOf={opLookup} selectable={step === 'select'}
              onToggleContour={(id) => { const cur = opOf(s, id); const ops = { ...s.ops }; const next: Op = cur === brush ? 'engrave' : brush; if (next === 'engrave') delete ops[String(id)]; else ops[String(id)] = next; set({ ops }); }}
              origin={origin} originZ={om ? (s.originZ === 'top' ? om.max[2] : om.max[2] - s.material) : null} showOrigin={showOrigin}
              tool={showTool ? s.tool : null}
              toolpath={showPath ? tp : null} originForPath={origin} zTopWorld={zTopWorld} zProgramTop={zProgramTop}
              progress={progress} view={view} dimmed={showPath}
            />
          </div>
          {showCode && <div className="fade-in h-full"><CodeView code={gcode} /></div>}

          {!mesh && (
            <div className={cn('pointer-events-none absolute inset-0 flex items-center justify-center transition-colors duration-200', dragOver && 'bg-accent-soft')}>
              <div className={cn('flex flex-col items-center gap-3 rounded-xl border border-dashed px-14 py-12 transition-colors duration-200', dragOver ? 'border-accent' : 'border-line-strong')}>
                <Upload size={22} strokeWidth={1.5} className="text-fg3" />
                <div className="text-[13px] text-fg">3D-Datei hierher ziehen</div>
                <div className="text-[12px] text-fg3">oder links „Datei wählen“</div>
              </div>
            </div>
          )}
          {mesh && !showCode && (
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 text-[11px] text-fg3">
              {(['engrave', 'pocket', 'cut', 'off'] as Op[]).map((o) => <Legend key={o} color={OP_COLOR[o]} label={OP_LABEL[o]} />)}
              {showPath && <Legend color="bg-danger" label="Eilgang" />}
              <span>Ziehen: drehen · Rad: zoomen · Rechts: verschieben</span>
            </div>
          )}
          {step === 'select' && mesh && (
            <div className="pointer-events-none absolute top-3 left-3 rounded-md border border-line bg-s1/90 px-3 py-1.5 text-[12px] text-fg2 backdrop-blur">
              Klick auf eine Linie → <span className="text-fg">{OP_LABEL[brush]}</span>
            </div>
          )}
          {dragOver && mesh && <div className="pointer-events-none absolute inset-0 border-2 border-accent bg-accent-soft" />}
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
