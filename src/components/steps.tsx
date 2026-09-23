import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Download, Play, Pause, RotateCcw, Upload, Calculator, Plus, X, AlertTriangle } from 'lucide-react';
import { Button, Field, Note, OriginPicker, Segmented, Slider, Toggle } from './ui';
import { CodeArea, CodeChip } from './CodeArea';
import { PRESETS, SNIPPETS, visibleIn, type Contour, type MeshData, type Mode, type Op, type OrientedMesh, type Settings, type Toolpath, type TopAxis } from '../types';
import { SUPPORTED_EXT } from '../lib/loaders';
import { opOf } from '../lib/toolpath';
import { fillPlaceholders } from '../lib/gcode';
import { cn } from '../utils/cn';
import { useI18n, type Lang } from '../i18n';

const ICON = { size: 15, strokeWidth: 1.7 };
export const OP_COLOR: Record<Op, string> = { engrave: 'bg-accent', pocket: 'bg-[#a78bfa]', cut: 'bg-[#fbbf24]', off: 'bg-s4' };

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
  const { t, lang } = useI18n();
  const inp = useRef<HTMLInputElement>(null);
  return (
    <StepFrame title={t.stepModel.title} lead={t.stepModel.lead}>
      <input ref={inp} type="file" className="hidden" accept={SUPPORTED_EXT.map((e) => '.' + e).join(',')}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      <Button primary onClick={() => inp.current?.click()} icon={<Upload {...ICON} />} disabled={loading}>
        {loading ? t.stepModel.btnLoading : mesh ? t.stepModel.btnChange : t.stepModel.btnChoose}
      </Button>
      {mesh && (
        <div className="rounded-md border border-line bg-s2 px-3 py-2 text-[12px]">
          <div className="truncate text-fg">{mesh.name}</div>
          <div className="num text-fg3">{mesh.triangleCount.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')} {t.stepModel.triangles}</div>
        </div>
      )}
      <p className="text-[11px] text-fg3">{t.stepModel.formats}</p>
    </StepFrame>
  );
}

// 2 ------------------------------------------------------------------------------
const AXES: { v: TopAxis; l: string }[] = [{ v: '+z', l: 'Z+' }, { v: '-z', l: 'Z−' }, { v: '+x', l: 'X+' }, { v: '-x', l: 'X−' }, { v: '+y', l: 'Y+' }, { v: '-y', l: 'Y−' }];
export function OrientStep({ s, set, om, mode }: { s: Settings; set: (p: Partial<Settings>) => void; om: OrientedMesh | null; mode: Mode }) {
  const { t } = useI18n();
  const size = om ? [0, 1, 2].map((i) => om.max[i] - om.min[i]) : null;
  const suspicious = size && Math.max(...size) < 15;
  const dimLabels = [t.stepOrient.widthX, t.stepOrient.depthY, t.stepOrient.heightZ];
  return (
    <StepFrame title={t.stepOrient.title} lead={t.stepOrient.lead}>
      <div>
        <div className="mb-1 text-[12px] text-fg2">{t.stepOrient.topSide}</div>
        <Segmented value={s.topAxis} onChange={(v) => set({ topAxis: v, ops: {} })} cols={6}
          options={AXES.map((a) => ({ value: a.v, label: <span className="num">{a.l}</span>, hint: t.stepOrient.axisHint(a.l) }))} />
      </div>
      <div>
        <div className="mb-1 text-[12px] text-fg2">{t.stepOrient.planeRotation}</div>
        <Segmented value={String(s.rotZ) as '0' | '90' | '180' | '270'} onChange={(v) => set({ rotZ: Number(v) as 0 | 90 | 180 | 270, ops: {} })}
          options={[{ value: '0', label: '0°' }, { value: '90', label: '90°' }, { value: '180', label: '180°' }, { value: '270', label: '270°' }]} />
      </div>
      <Toggle label={t.stepOrient.mirror} checked={s.mirror} onChange={(v) => set({ mirror: v, ops: {} })} />
      {visibleIn(mode, 'experte') && (
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label={t.stepOrient.scale} value={s.scale} min={0.001} step={0.1} unit="×" onChange={(v) => set({ scale: v, ops: {} })} /></div>
          <Button onClick={() => set({ scale: s.scale === 25.4 ? 1 : 25.4, ops: {} })} title={t.stepOrient.scaleBtnTitle}>{s.scale === 25.4 ? t.stepOrient.scaleMm : t.stepOrient.scaleInchToMm}</Button>
        </div>
      )}
      {size && (
        <div className="num grid grid-cols-3 gap-2 text-[12px]">
          {dimLabels.map((l, i) => (
            <div key={l} className="rounded-md border border-line bg-s2 px-2.5 py-1.5"><div className="font-sans text-[10px] uppercase tracking-wide text-fg3">{l}</div><div className="text-fg">{size[i].toFixed(2)} mm</div></div>
          ))}
        </div>
      )}
      {suspicious && <Note kind="warn">{t.stepOrient.warnSmallModel}</Note>}
    </StepFrame>
  );
}

// 3 ------------------------------------------------------------------------------
export function SliceStep({ s, set, om, contours, level, setLevel, mode }: {
  s: Settings; set: (p: Partial<Settings>) => void; om: OrientedMesh | null; contours: Contour[]; level: number; setLevel: (i: number) => void; mode: Mode;
}) {
  const { t } = useI18n();
  const h = om ? om.max[2] - om.min[2] : 1;
  const offs = s.sliceOffsets;
  const setOff = (i: number, v: number) => { const n = [...offs]; n[i] = +v.toFixed(3); set({ sliceOffsets: n, ops: {} }); };
  const count = (i: number) => contours.filter((c) => c.level === i).length;
  return (
    <StepFrame title={t.stepSlice.title} lead={t.stepSlice.lead}>
      <div className="flex flex-col gap-1.5">
        {offs.map((o, i) => (
          <div key={i} onClick={() => setLevel(i)} className={cn('cursor-pointer rounded-md border p-2.5 transition-colors', level === i ? 'border-accent bg-s2' : 'border-line hover:bg-s2')}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-fg">{t.stepSlice.planeLabel(i + 1)}</span>
              <div className="flex items-center gap-2">
                <span className="num text-[11.5px] text-fg3">{t.stepSlice.contoursCount(count(i))}</span>
                {offs.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); const n = offs.filter((_, k) => k !== i); set({ sliceOffsets: n, ops: {} }); setLevel(Math.max(0, Math.min(level, n.length - 1))); }}
                    className="flex h-5 w-5 items-center justify-center rounded text-fg3 hover:bg-s3 hover:text-fg" aria-label={t.stepSlice.removePlane}><X size={13} strokeWidth={1.7} /></button>
                )}
              </div>
            </div>
            {level === i && (
              <div className="mt-2 flex flex-col gap-2">
                <Slider label={t.stepSlice.depthBelowTop} value={o} min={0} max={h} step={Math.max(h / 1000, 0.01)} onChange={(v) => setOff(i, v)} />
                <div className="flex gap-1.5">
                  {[0.05, 0.2, 0.5, 1].filter((v) => v < h).map((v) => (
                    <button key={v} onClick={() => setOff(i, v)} className={cn('num h-6 rounded border px-1.5 text-[11px] transition-colors', o === v ? 'border-accent text-accent' : 'border-line text-fg2 hover:bg-s3')}>{v}</button>
                  ))}
                  <button onClick={() => setOff(i, +(h / 2).toFixed(2))} className="h-6 rounded border border-line px-1.5 text-[11px] text-fg2 hover:bg-s3">{t.stepSlice.center}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <Button onClick={() => { set({ sliceOffsets: [...offs, +Math.min(h * 0.5, offs[offs.length - 1] + 1).toFixed(2)] }); setLevel(offs.length); }} icon={<Plus {...ICON} />} disabled={offs.length >= 4}>{t.stepSlice.addPlane}</Button>
      {visibleIn(mode, 'experte') && (
        <Field label={t.stepSlice.tolerance} value={s.tolerance} min={0.005} step={0.01} unit="mm" onChange={(v) => set({ tolerance: v })} hint={t.stepSlice.toleranceHint} />
      )}
      {!contours.length && <Note kind="warn">{t.stepSlice.warnNoIntersection}</Note>}
    </StepFrame>
  );
}

// 4 ------------------------------------------------------------------------------
export function OriginStep({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  const { t } = useI18n();
  return (
    <StepFrame title={t.stepOrigin.title} lead={t.stepOrigin.lead}>
      <OriginPicker value={s.originXY} onChange={(v) => set({ originXY: v })} />
      <div>
        <div className="mb-1 text-[12px] text-fg2">{t.stepOrigin.zOriginLabel}</div>
        <Segmented value={s.originZ} onChange={(v) => set({ originZ: v })}
          options={[
            { value: 'top', label: t.stepOrigin.zTop, hint: t.stepOrigin.zTopHint },
            { value: 'bottom', label: t.stepOrigin.zBottom, hint: t.stepOrigin.zBottomHint },
          ]} />
        {s.originZ === 'bottom' && <p className="mt-1.5 text-[11.5px] text-fg3">{t.stepOrigin.zSurfaceNote(s.material.toFixed(2))}</p>}
      </div>
    </StepFrame>
  );
}

// 5 ------------------------------------------------------------------------------
function Group({ color, title, sub, children }: { color: string; title: string; sub: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-s2 p-3">
      <div className="mb-2.5 flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', color)} /><span className="text-[12.5px] font-medium text-fg">{title}</span><span className="text-[11px] text-fg3">{sub}</span></div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}
export function MachiningStep({ s, set, om, mode }: { s: Settings; set: (p: Partial<Settings>) => void; om: OrientedMesh | null; mode: Mode }) {
  const { t } = useI18n();
  const h = om ? om.max[2] - om.min[2] : 0;
  const tool = s.tool;
  const isV = tool.tipAngle > 0;
  const width = tool.tipDia + 2 * s.engraveDepth * Math.tan((tool.tipAngle * Math.PI) / 360);
  const preset = PRESETS.find((p) => p.id === s.presetId) ?? PRESETS[0];

  if (mode === 'einfach') {
    return (
      <StepFrame title={t.stepMachining.titleSimple} lead={t.stepMachining.leadSimple}>
        <Field label={t.stepMachining.engraveDepth} value={s.engraveDepth} min={0.01} step={0.05} unit="mm" onChange={(v) => set({ engraveDepth: v })} hint={t.stepMachining.engraveDepthHint} />
        <div>
          <div className="mb-1 text-[12px] text-fg2">{t.stepMachining.toolChoice}</div>
          <Segmented value={isV ? 'v' : 'flat'} onChange={(v) => set({ tool: { ...tool, tipAngle: v === 'v' ? 30 : 0, tipDia: v === 'v' ? 0.2 : 2 } })}
            options={[{ value: 'v', label: t.stepMachining.toolV, hint: t.stepMachining.toolVHint }, { value: 'flat', label: t.stepMachining.toolFlat, hint: t.stepMachining.toolFlatHint }]} />
        </div>
        <div>
          <div className="mb-1 text-[12px] text-fg2">{t.stepMachining.machine}</div>
          <Segmented cols={2} value={preset.id} onChange={(v) => { const p = PRESETS.find((x) => x.id === v); if (p) set({ presetId: p.id, startBlock: p.start, endBlock: p.end }); }}
            options={PRESETS.map((p) => ({ value: p.id, label: p.name, hint: `Start:\n${p.start}\n\nEnde:\n${p.end}` }))} />
        </div>
        <Note>{t.stepMachining.engraveWidthNote(s.engraveDepth.toFixed(2), width.toFixed(2), preset.name)}</Note>
      </StepFrame>
    );
  }

  const experte = visibleIn(mode, 'experte');
  return (
    <StepFrame title={t.stepMachining.title} lead={t.stepMachining.lead}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.stepMachining.stepDown} value={s.stepDown} min={0.01} step={0.05} unit="mm" onChange={(v) => set({ stepDown: v })} />
        <Field label={t.stepMachining.safeZ} value={s.safeZ} min={0.5} step={0.5} unit="mm" onChange={(v) => set({ safeZ: v })} />
      </div>
      <Group color={OP_COLOR.engrave} title={t.stepMachining.engraveTitle} sub={t.stepMachining.engraveSub}>
        <Segmented value={s.engraveMode} onChange={(v) => set({ engraveMode: v })} options={[
          { value: 'contour', label: t.stepMachining.engraveModeContour, hint: t.stepMachining.engraveModeContourHint },
          { value: 'centerline', label: t.stepMachining.engraveModeCenterline, hint: t.stepMachining.engraveModeCenterlineHint }]} />
        {s.engraveMode === 'centerline' && (
          <>
            <p className="-mt-0.5 text-[11.5px] leading-relaxed text-fg3">
              {t.stepMachining.centerlineNotice}
            </p>
            <Field label={t.stepMachining.centerlineWidth} value={s.centerlineWidth} min={0.2} max={30} step={0.2} unit="mm"
              onChange={(v) => set({ centerlineWidth: v })}
              hint={t.stepMachining.centerlineWidthHint} />
          </>
        )}
        <Field label={t.stepMachining.engraveDepthShort} value={s.engraveDepth} min={0.01} step={0.05} unit="mm" onChange={(v) => set({ engraveDepth: v })} />
      </Group>
      <Group color={OP_COLOR.pocket} title={t.stepMachining.pocketTitle} sub={t.stepMachining.pocketSub}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.stepMachining.pocketDepth} value={s.pocketDepth} min={0.01} step={0.1} unit="mm" onChange={(v) => set({ pocketDepth: v })} />
          {experte && <Field label={t.stepMachining.pocketStepOver} value={s.pocketStepOver} min={0.05} step={0.05} unit="mm" onChange={(v) => set({ pocketStepOver: v })} />}
        </div>
      </Group>
      <Group color={OP_COLOR.cut} title={t.stepMachining.cutTitle} sub={t.stepMachining.cutSub}>
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label={t.stepMachining.material} value={s.material} min={0.1} step={0.1} unit="mm" onChange={(v) => set({ material: v })} /></div>
          {h > 0 && <Button onClick={() => set({ material: +h.toFixed(2) })} title={t.stepMachining.takeModelHeight}>= {h.toFixed(2)}</Button>}
        </div>
        {experte && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.stepMachining.cutOvershoot} value={s.cutOvershoot} min={0} step={0.1} unit="mm" onChange={(v) => set({ cutOvershoot: v })} />
            <div>
              <div className="mb-1 text-[12px] text-fg2">{t.stepMachining.cutDir}</div>
              <Segmented value={s.cutDir} onChange={(v) => set({ cutDir: v })} options={[{ value: 'climb', label: t.stepMachining.cutDirClimb }, { value: 'conventional', label: t.stepMachining.cutDirConv }]} />
            </div>
          </div>
        )}
        <div className={cn('grid gap-3', experte ? 'grid-cols-3' : 'grid-cols-1')}>
          <Field label={t.stepMachining.tabCount} value={s.tabCount} min={0} max={12} step={1} onChange={(v) => set({ tabCount: Math.round(v) })} />
          {experte && <Field label={t.stepMachining.tabWidth} value={s.tabWidth} min={0.5} step={0.5} unit="mm" onChange={(v) => set({ tabWidth: v })} />}
          {experte && <Field label={t.stepMachining.tabHeight} value={s.tabHeight} min={0.1} step={0.1} unit="mm" onChange={(v) => set({ tabHeight: v })} />}
        </div>
        {experte && <Toggle label={t.stepMachining.compensate} checked={s.compensate} onChange={(v) => set({ compensate: v })} />}
        <p className="text-[11px] leading-snug text-fg3">{t.stepMachining.cutNotes}</p>
      </Group>
    </StepFrame>
  );
}

// 6 ------------------------------------------------------------------------------
export function SelectStep({ s, set, contours, brush, setBrush, mode }: {
  s: Settings; set: (p: Partial<Settings>) => void; contours: Contour[]; brush: Op; setBrush: (o: Op) => void; mode: Mode;
}) {
  const { t } = useI18n();
  const setOp = (id: number, op: Op) => { const ops = { ...s.ops }; if (op === 'engrave') delete ops[String(id)]; else ops[String(id)] = op; set({ ops }); };
  const outer = contours.filter((c) => c.closed && c.depth === 0);
  const counts: Record<Op, number> = { engrave: 0, pocket: 0, cut: 0, off: 0 };
  for (const c of contours) counts[c.length < s.minLength ? 'off' : opOf(s, c.id)]++;
  const levels = Math.max(...contours.map((c) => c.level), 0) + 1;
  return (
    <StepFrame title={t.stepSelect.title} lead={t.stepSelect.lead}>
      <div>
        <div className="mb-1 text-[12px] text-fg2">{t.stepSelect.assignOnClick}</div>
        <Segmented value={brush} onChange={setBrush} options={(['off', 'cut', 'pocket', 'engrave'] as Op[]).map((o) => ({
          value: o, label: <span className="flex items-center justify-center gap-1.5"><span className={cn('h-1.5 w-1.5 rounded-full', OP_COLOR[o])} />{t.ops[o]}</span>,
          hint: t.opHints[o],
        }))} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button onClick={() => { const ops = { ...s.ops }; outer.forEach((c) => { ops[String(c.id)] = 'off'; }); set({ ops }); }} disabled={!outer.length} title={t.stepSelect.outerOffTitle}>{t.stepSelect.outerOff}</Button>
        <Button onClick={() => { const ops = { ...s.ops }; outer.forEach((c) => { ops[String(c.id)] = 'cut'; }); set({ ops }); }} disabled={!outer.length} title={t.stepSelect.outerCutTitle}>{t.stepSelect.outerCut}</Button>
        <Button onClick={() => set({ ops: {} })} icon={<RotateCcw {...ICON} />} disabled={!Object.keys(s.ops).length}>{t.stepSelect.reset}</Button>
      </div>
      {visibleIn(mode, 'experte') && (
        <Field label={t.stepSelect.minLength} value={s.minLength} min={0} step={0.1} unit="mm" onChange={(v) => set({ minLength: v })} />
      )}
      <div className="max-h-72 overflow-y-auto rounded-md border border-line">
        {contours.map((c) => {
          const tooShort = c.length < s.minLength;
          const op = tooShort ? 'off' : opOf(s, c.id);
          return (
            <div key={c.id} className={cn('flex items-center gap-2 border-b border-line px-2.5 py-1 text-[12px] last:border-b-0', op === 'off' && 'text-fg3')}>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', OP_COLOR[op])} />
              <span className="flex-1 truncate">
                {levels > 1 ? t.stepSelect.planePrefix(c.level + 1) : ''}
                {t.stepSelect.lineNumber((c.id % 100000) + 1)}
                <span className="text-fg3">{c.closed ? (c.depth === 0 ? t.stepSelect.outer : t.stepSelect.inner(c.depth)) : t.stepSelect.open}</span>
              </span>
              <span className="num text-fg3">{c.length.toFixed(1)} mm</span>
              {!tooShort && (
                <select value={op} onChange={(e) => setOp(c.id, e.target.value as Op)} aria-label={t.stepSelect.opAria}
                  className="h-6 rounded border border-line bg-s2 px-1 text-[11px] text-fg outline-none focus:border-accent">
                  {(['engrave', 'pocket', 'cut', 'off'] as Op[]).map((o) => <option key={o} value={o}>{t.ops[o]}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>
      <div className="num flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-fg2">
        {(['engrave', 'pocket', 'cut', 'off'] as Op[]).map((o) => <span key={o} className="flex items-center gap-1.5"><span className={cn('h-1.5 w-1.5 rounded-full', OP_COLOR[o])} />{t.ops[o]} {counts[o]}</span>)}
      </div>
      {counts.engrave + counts.pocket + counts.cut === 0 && <Note kind="warn">{t.stepSelect.warnNoLines}</Note>}
    </StepFrame>
  );
}

// 7 ------------------------------------------------------------------------------
export function ToolStep({ s, set, mode }: { s: Settings; set: (p: Partial<Settings>) => void; mode: Mode }) {
  const { t } = useI18n();
  const tool = s.tool;
  const isV = tool.tipAngle > 0;
  const experte = visibleIn(mode, 'experte');
  const width = tool.tipDia + 2 * s.engraveDepth * Math.tan((tool.tipAngle * Math.PI) / 360);
  return (
    <StepFrame title={t.stepTool.title} lead={t.stepTool.lead}>
      <Segmented value={isV ? 'v' : 'flat'} onChange={(v) => set({ tool: { ...tool, tipAngle: v === 'v' ? 30 : 0, tipDia: v === 'v' ? 0.2 : 2 } })}
        options={[{ value: 'v', label: t.stepTool.toolV, hint: t.stepTool.toolVHint }, { value: 'flat', label: t.stepTool.toolFlat, hint: t.stepTool.toolFlatHint }]} />
      <div className={cn('grid gap-3', experte ? 'grid-cols-3' : 'grid-cols-1')}>
        {isV && experte && <Field label={t.stepTool.tipAngle} value={tool.tipAngle} min={5} max={120} step={5} unit="°" onChange={(v) => set({ tool: { ...tool, tipAngle: v } })} />}
        <Field label={isV ? t.stepTool.tipDiaV : t.stepTool.tipDiaFlat} value={tool.tipDia} min={0.05} step={0.05} unit="mm" onChange={(v) => set({ tool: { ...tool, tipDia: v } })} />
        {experte && <Field label={t.stepTool.shaftDia} value={tool.shaftDia} min={1} step={0.5} unit="mm" onChange={(v) => set({ tool: { ...tool, shaftDia: v } })} />}
      </div>
      <Note>{t.stepTool.engraveWidthNote(s.engraveDepth.toFixed(2), width.toFixed(2))}{isV && Object.values(s.ops).includes('cut') ? t.stepTool.warnVBitConical : ''}</Note>
      <div className={cn('grid gap-3', experte ? 'grid-cols-3' : 'grid-cols-2')}>
        <Field label={t.stepTool.feedXY} value={s.feedXY} min={10} step={50} unit={t.stepTool.unitMmMin} onChange={(v) => set({ feedXY: v })} />
        {experte && <Field label={t.stepTool.feedZ} value={s.feedZ} min={10} step={10} unit={t.stepTool.unitMmMin} onChange={(v) => set({ feedZ: v })} />}
        <Field label={t.stepTool.rpm} value={s.rpm} min={0} step={500} unit={t.stepTool.unitRpm} onChange={(v) => set({ rpm: v })} />
      </div>
    </StepFrame>
  );
}

// 8 ------------------------------------------------------------------------------
export function ComputeStep({ tp, stale, computing, onCompute, progress, setProgress, view, setView, canCompute }: {
  tp: Toolpath | null; stale: boolean; computing: boolean; onCompute: () => void;
  progress: number; setProgress: (v: number) => void; view: '3d' | 'top'; setView: (v: '3d' | 'top') => void; canCompute: boolean;
}) {
  const { t, lang } = useI18n();
  const [playing, setPlaying] = useState(false);
  const progressRef = useRef(progress); progressRef.current = progress;
  useEffect(() => {
    if (!playing || !tp) return;
    let raf = 0, last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      const next = progressRef.current + dt / 25; // ganze Fahrt ≈ 25 s
      if (next >= 1) { setProgress(1); setPlaying(false); return; }
      setProgress(next); raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, tp]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlaying(false); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <StepFrame title={t.stepCompute.title} lead={t.stepCompute.lead}>
      <Button primary onClick={onCompute} disabled={!canCompute || computing} icon={<Calculator {...ICON} />}>
        {computing ? t.stepCompute.btnComputing : tp && !stale ? t.stepCompute.btnRecompute : t.stepCompute.btnCompute}
      </Button>
      {tp && stale && <Note kind="warn">{t.stepCompute.warnStale}</Note>}
      {!canCompute && <Note kind="warn">{t.stepCompute.warnNoLines}</Note>}
      {tp?.warnings.map((w, i) => <Note key={i} kind="warn"><span className="flex gap-2"><AlertTriangle size={14} strokeWidth={1.7} className="mt-0.5 shrink-0" />{w}</span></Note>)}
      {tp && (
        <>
          <div className="num grid grid-cols-2 gap-2 text-[12px]">
            <Stat label={t.stepCompute.statCut} v={`${tp.cutLength.toFixed(0)} mm`} />
            <Stat label={t.stepCompute.statRapid} v={`${tp.rapidLength.toFixed(0)} mm`} />
            <Stat label={t.stepCompute.statPaths} v={`${tp.counts.engrave + tp.counts.pocket + tp.counts.cut}`} />
            <Stat label={t.stepCompute.statDuration} v={fmtTime(tp.timeMin, lang)} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[12px] text-fg2"><span>{t.stepCompute.simulation}</span><span className="num text-fg">{Math.round(progress * 100)} %</span></div>
            <div className="flex items-center gap-2">
              <button onClick={() => { if (progress >= 1) setProgress(0); setPlaying(!playing); }} aria-label={playing ? t.stepCompute.pause : t.stepCompute.play}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-s2 hover:bg-s3">{playing ? <Pause {...ICON} /> : <Play {...ICON} />}</button>
              <input type="range" min={0} max={1} step={0.0005} value={progress} onChange={(e) => { setPlaying(false); setProgress(parseFloat(e.target.value)); }} />
            </div>
          </div>
          <div>
            <div className="mb-1 text-[12px] text-fg2">{t.stepCompute.view}</div>
            <Segmented value={view} onChange={setView} options={[{ value: '3d', label: t.stepCompute.view3D }, { value: 'top', label: t.stepCompute.viewTop }]} />
          </div>
        </>
      )}
    </StepFrame>
  );
}
function Stat({ label, v }: { label: string; v: string }) {
  return <div className="rounded-md border border-line bg-s2 px-2.5 py-1.5"><div className="font-sans text-[10.5px] uppercase tracking-wide text-fg3">{label}</div><div className="text-fg">{v}</div></div>;
}
export function fmtTime(min: number, _lang: Lang = 'de') {
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 60) return `${min.toFixed(1)} min`;
  return `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`;
}

// 9 ------------------------------------------------------------------------------
export function ProgramStep({ s, set, mode }: { s: Settings; set: (p: Partial<Settings>) => void; mode: Mode }) {
  const { t } = useI18n();
  const [focus, setFocus] = useState<'start' | 'end'>('start');
  const experte = visibleIn(mode, 'experte');
  const append = (codeText: string) => focus === 'start'
    ? set({ startBlock: (s.startBlock.trimEnd() + '\n' + codeText).trim(), presetId: 'custom' })
    : set({ endBlock: (s.endBlock.trimEnd() + '\n' + codeText).trim(), presetId: 'custom' });
  return (
    <StepFrame title={t.stepProgram.title} lead={experte ? t.stepProgram.leadExpert : t.stepProgram.leadStandard}>
      <div>
        <div className="mb-1 text-[12px] text-fg2">{t.stepProgram.presets} <span className="text-fg3">{experte ? t.stepProgram.presetsHintExpert : t.stepProgram.presetsHintStandard}</span></div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <CodeChip key={p.id} label={p.name} code={focus === 'start' ? p.start : p.end} hint={`Start:\n${p.start}\n\nEnde:\n${p.end}`}
              primaryLabel={<span className={cn(s.presetId === p.id && 'text-accent')}>{p.name}</span>}
              onClick={() => set({ presetId: p.id, startBlock: p.start, endBlock: p.end })} />
          ))}
        </div>
      </div>
      {experte && (
        <>
          <CodeArea label={t.stepProgram.start} value={s.startBlock} onChange={(v) => set({ startBlock: v, presetId: 'custom' })} onFocus={() => setFocus('start')} active={focus === 'start'} />
          <CodeArea label={t.stepProgram.end} value={s.endBlock} onChange={(v) => set({ endBlock: v, presetId: 'custom' })} onFocus={() => setFocus('end')} active={focus === 'end'} />
        </>
      )}
      {experte && (
        <div>
          <div className="mb-1 text-[12px] text-fg2">{t.stepProgram.commands} <span className="text-fg3">{t.stepProgram.commandsHint(focus === 'start' ? t.stepProgram.start : t.stepProgram.end)}</span></div>
          <div className="flex flex-wrap gap-1.5">
            {SNIPPETS.map((x) => {
              const label = t.stepProgram.snippets[x.id]?.label ?? x.l;
              const desc = t.stepProgram.snippets[x.id]?.desc ?? x.d;
              return <CodeChip key={x.id} label={label} code={x.t} hint={`${desc}\n\n${x.t}`} onClick={() => append(x.t)} />;
            })}
          </div>
        </div>
      )}
      <div className="rounded-md border border-line bg-s2 p-2.5">
        <div className="mb-1 text-[11px] text-fg3">{t.stepProgram.previewTitle}</div>
        <pre className="num whitespace-pre-wrap text-[11.5px] leading-relaxed text-fg2">{fillPlaceholders(s.startBlock, s)}</pre>
      </div>
      {experte && <p className="text-[11px] text-fg3">{t.stepProgram.placeholdersHint}</p>}
    </StepFrame>
  );
}

// 10 -----------------------------------------------------------------------------
export function ExportStep({ gcode, fileName, tp, view, setView, mode }: { gcode: string; fileName: string; tp: Toolpath | null; view: 'code' | 'stage'; setView: (v: 'code' | 'stage') => void; mode: Mode }) {
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!gcode) return;
    try { await navigator.clipboard.writeText(gcode); } catch { const el = document.createElement('textarea'); el.value = gcode; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove(); }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) { e.preventDefault(); copy(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [gcode]);
  const download = () => {
    const blob = new Blob([gcode], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = fileName.replace(/\.[^.]+$/, '') + '.gcode'; a.click(); URL.revokeObjectURL(a.href);
  };
  const lines = gcode ? gcode.split('\n').length : 0;
  return (
    <StepFrame title={t.stepExport.title} lead={t.stepExport.lead}>
      {!tp && <Note kind="warn">{t.stepExport.warnNoToolpath}</Note>}
      <div className="flex gap-2">
        <Button primary onClick={download} disabled={!gcode} icon={<Download {...ICON} />}>{t.stepExport.download}</Button>
        <Button onClick={copy} disabled={!gcode} icon={copied ? <Check {...ICON} /> : <Copy {...ICON} />}>{copied ? t.stepExport.copied : t.stepExport.copy}</Button>
      </div>
      {gcode && (
        <>
          <div className="num text-[12px] text-fg3">
            {t.stepExport.stats(lines.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US'), (gcode.length / 1024).toFixed(0), fileName.replace(/\.[^.]+$/, '') + '.gcode')}
          </div>
          <div>
            <div className="mb-1 text-[12px] text-fg2">{t.stepExport.viewRight}</div>
            <Segmented value={view} onChange={setView} options={[{ value: 'code', label: t.stepExport.viewGcode }, { value: 'stage', label: t.stepExport.viewStage }]} />
          </div>
          {visibleIn(mode, 'experte') && (
            <div className="num flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg3">
              <span><span className="text-danger">G0</span> {t.stepExport.cheatsheet.rapid}</span>
              <span><span className="text-accent">G1</span> {t.stepExport.cheatsheet.cut}</span>
              <span><span className="text-warn">M3</span> {t.stepExport.cheatsheet.machine}</span>
              <span><span className="text-ok">F</span> {t.stepExport.cheatsheet.feed}</span>
            </div>
          )}
        </>
      )}
    </StepFrame>
  );
}
