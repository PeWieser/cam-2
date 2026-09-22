import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Download, Play, Pause, RotateCcw, Upload, Calculator, Plus, X, AlertTriangle } from 'lucide-react';
import { Button, Field, Note, OriginPicker, Segmented, Slider, Toggle } from './ui';
import { CodeArea, CodeChip } from './CodeArea';
import { OP_LABEL, PRESETS, SNIPPETS, visibleIn, type Contour, type MeshData, type Mode, type Op, type OrientedMesh, type Settings, type Toolpath, type TopAxis } from '../types';
import { SUPPORTED_EXT } from '../lib/loaders';
import { opOf } from '../lib/toolpath';
import { fillPlaceholders } from '../lib/gcode';
import { cn } from '../utils/cn';

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
  const inp = useRef<HTMLInputElement>(null);
  return (
    <StepFrame title="Modell laden" lead="Ziehe die 3D-Datei deiner Frontplatte auf die Bühne oder wähle sie aus. Alles bleibt auf deinem Rechner.">
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
const AXES: { v: TopAxis; l: string }[] = [{ v: '+z', l: 'Z+' }, { v: '-z', l: 'Z−' }, { v: '+x', l: 'X+' }, { v: '-x', l: 'X−' }, { v: '+y', l: 'Y+' }, { v: '-y', l: 'Y−' }];
export function OrientStep({ s, set, om, mode }: { s: Settings; set: (p: Partial<Settings>) => void; om: OrientedMesh | null; mode: Mode }) {
  const size = om ? [0, 1, 2].map((i) => om.max[i] - om.min[i]) : null;
  const suspicious = size && Math.max(...size) < 15;
  return (
    <StepFrame title="Ausrichten" lead="Welche Seite zeigt nach oben zum Fräser? Drehe die Platte so, wie sie später auf der Maschine liegt.">
      <div>
        <div className="mb-1 text-[12px] text-fg2">Oberseite</div>
        <Segmented value={s.topAxis} onChange={(v) => set({ topAxis: v, ops: {} })} cols={6}
          options={AXES.map((a) => ({ value: a.v, label: <span className="num">{a.l}</span>, hint: `Modellachse ${a.l} zeigt nach oben` }))} />
      </div>
      <div>
        <div className="mb-1 text-[12px] text-fg2">Drehung in der Ebene</div>
        <Segmented value={String(s.rotZ) as '0' | '90' | '180' | '270'} onChange={(v) => set({ rotZ: Number(v) as 0 | 90 | 180 | 270, ops: {} })}
          options={[{ value: '0', label: '0°' }, { value: '90', label: '90°' }, { value: '180', label: '180°' }, { value: '270', label: '270°' }]} />
      </div>
      <Toggle label="Spiegeln (Gravur von der Rückseite, z. B. Acryl)" checked={s.mirror} onChange={(v) => set({ mirror: v, ops: {} })} />
      {visibleIn(mode, 'experte') && (
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label="Maßstab" value={s.scale} min={0.001} step={0.1} unit="×" onChange={(v) => set({ scale: v, ops: {} })} /></div>
          <Button onClick={() => set({ scale: s.scale === 25.4 ? 1 : 25.4, ops: {} })} title="Datei in Zoll → Millimeter">{s.scale === 25.4 ? 'mm' : 'Zoll → mm'}</Button>
        </div>
      )}
      {size && (
        <div className="num grid grid-cols-3 gap-2 text-[12px]">
          {['Breite X', 'Tiefe Y', 'Höhe Z'].map((l, i) => (
            <div key={l} className="rounded-md border border-line bg-s2 px-2.5 py-1.5"><div className="font-sans text-[10px] uppercase tracking-wide text-fg3">{l}</div><div className="text-fg">{size[i].toFixed(2)} mm</div></div>
          ))}
        </div>
      )}
      {suspicious && <Note kind="warn">Das Modell ist sehr klein – wurde es in Zoll gespeichert? Dann „Zoll → mm“.</Note>}
    </StepFrame>
  );
}

// 3 ------------------------------------------------------------------------------
export function SliceStep({ s, set, om, contours, level, setLevel, mode }: {
  s: Settings; set: (p: Partial<Settings>) => void; om: OrientedMesh | null; contours: Contour[]; level: number; setLevel: (i: number) => void; mode: Mode;
}) {
  const h = om ? om.max[2] - om.min[2] : 1;
  const offs = s.sliceOffsets;
  const setOff = (i: number, v: number) => { const n = [...offs]; n[i] = +v.toFixed(3); set({ sliceOffsets: n, ops: {} }); };
  const count = (i: number) => contours.filter((c) => c.level === i).length;
  return (
    <StepFrame title="Schnittebenen" lead="Die Platte wird waagerecht aufgeschnitten; die Linien des Schnitts werden gefräst. Knapp unter der Oberkante findest du Schrift und Löcher. Liegt Schrift erhaben über der Platte, füge eine zweite Ebene tiefer hinzu, um Löcher und Umriss zu erfassen.">
      <div className="flex flex-col gap-1.5">
        {offs.map((o, i) => (
          <div key={i} onClick={() => setLevel(i)} className={cn('cursor-pointer rounded-md border p-2.5 transition-colors', level === i ? 'border-accent bg-s2' : 'border-line hover:bg-s2')}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-fg">Ebene {i + 1}</span>
              <div className="flex items-center gap-2">
                <span className="num text-[11.5px] text-fg3">{count(i)} Konturen</span>
                {offs.length > 1 && (
                  <button onClick={(e) => { e.stopPropagation(); const n = offs.filter((_, k) => k !== i); set({ sliceOffsets: n, ops: {} }); setLevel(Math.max(0, Math.min(level, n.length - 1))); }}
                    className="flex h-5 w-5 items-center justify-center rounded text-fg3 hover:bg-s3 hover:text-fg" aria-label="Ebene entfernen"><X size={13} strokeWidth={1.7} /></button>
                )}
              </div>
            </div>
            {level === i && (
              <div className="mt-2 flex flex-col gap-2">
                <Slider label="Tiefe unter Oberkante" value={o} min={0} max={h} step={Math.max(h / 1000, 0.01)} onChange={(v) => setOff(i, v)} />
                <div className="flex gap-1.5">
                  {[0.05, 0.2, 0.5, 1].filter((v) => v < h).map((v) => (
                    <button key={v} onClick={() => setOff(i, v)} className={cn('num h-6 rounded border px-1.5 text-[11px] transition-colors', o === v ? 'border-accent text-accent' : 'border-line text-fg2 hover:bg-s3')}>{v}</button>
                  ))}
                  <button onClick={() => setOff(i, +(h / 2).toFixed(2))} className="h-6 rounded border border-line px-1.5 text-[11px] text-fg2 hover:bg-s3">Mitte</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <Button onClick={() => { set({ sliceOffsets: [...offs, +Math.min(h * 0.5, offs[offs.length - 1] + 1).toFixed(2)] }); setLevel(offs.length); }} icon={<Plus {...ICON} />} disabled={offs.length >= 4}>Ebene hinzufügen</Button>
      {visibleIn(mode, 'experte') && (
        <Field label="Kurvengenauigkeit" value={s.tolerance} min={0.005} step={0.01} unit="mm" onChange={(v) => set({ tolerance: v })} hint="Maximale Abweichung von der Originalkurve. Kleiner = feiner, längerer G-Code." />
      )}
      {!contours.length && <Note kind="warn">Auf dieser Höhe schneidet die Ebene das Modell nicht. Schiebe den Regler etwas tiefer.</Note>}
    </StepFrame>
  );
}

// 4 ------------------------------------------------------------------------------
export function OriginStep({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  return (
    <StepFrame title="Nullpunkt" lead="Wo steht der Fräser bei X0 Y0 Z0? Die Pfeile zeigen den Punkt an der Platte – dort wird an der Maschine der Nullpunkt angetastet.">
      <OriginPicker value={s.originXY} onChange={(v) => set({ originXY: v })} />
      <div>
        <div className="mb-1 text-[12px] text-fg2">Z-Nullpunkt</div>
        <Segmented value={s.originZ} onChange={(v) => set({ originZ: v })}
          options={[{ value: 'top', label: 'Oberfläche', hint: 'Z0 auf der Plattenoberfläche (üblich für Gravuren)' }, { value: 'bottom', label: 'Unterseite', hint: 'Z0 auf der Opferplatte – sicherer bei Durchbrüchen' }]} />
        {s.originZ === 'bottom' && <p className="mt-1.5 text-[11.5px] text-fg3">Die Oberfläche liegt dann bei Z {s.material.toFixed(2)} (Materialstärke).</p>}
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
  const h = om ? om.max[2] - om.min[2] : 0;
  const t = s.tool;
  const isV = t.tipAngle > 0;
  const width = t.tipDia + 2 * s.engraveDepth * Math.tan((t.tipAngle * Math.PI) / 360);
  const preset = PRESETS.find((p) => p.id === s.presetId) ?? PRESETS[0];

  if (mode === 'einfach') {
    return (
      <StepFrame title="Gravur" lead="Wie tief gefräst wird und womit. Material, Vorschub und Programmrahmen stehen auf bewährten Werten – unter „Standard“ und „Experte“ kommen sie dazu.">
        <Field label="Gravurtiefe" value={s.engraveDepth} min={0.01} step={0.05} unit="mm" onChange={(v) => set({ engraveDepth: v })} hint="0,3 mm ist für Schrift meist genau richtig." />
        <div>
          <div className="mb-1 text-[12px] text-fg2">Werkzeug</div>
          <Segmented value={isV ? 'v' : 'flat'} onChange={(v) => set({ tool: { ...t, tipAngle: v === 'v' ? 30 : 0, tipDia: v === 'v' ? 0.2 : 2 } })}
            options={[{ value: 'v', label: 'V-Stichel', hint: 'Kegelförmig – feine Linien, Breite wächst mit der Tiefe' }, { value: 'flat', label: 'Schaftfräser', hint: 'Zylindrisch – überall gleich breite Nut' }]} />
        </div>
        <div>
          <div className="mb-1 text-[12px] text-fg2">Maschine</div>
          <Segmented cols={2} value={preset.id} onChange={(v) => { const p = PRESETS.find((x) => x.id === v); if (p) set({ presetId: p.id, startBlock: p.start, endBlock: p.end }); }}
            options={PRESETS.map((p) => ({ value: p.id, label: p.name, hint: `Start:\n${p.start}\n\nEnde:\n${p.end}` }))} />
        </div>
        <Note>Gravurbreite bei <span className="num">{s.engraveDepth.toFixed(2)} mm</span> Tiefe: <span className="num">{width.toFixed(2)} mm</span>. Alles andere übernimmt {preset.name}.</Note>
      </StepFrame>
    );
  }

  const experte = visibleIn(mode, 'experte');
  return (
    <StepFrame title="Bearbeitung" lead="Drei Arten, die du im nächsten Schritt einzelnen Linien zuweist: Gravur (Standard), Tasche und Durchbruch. Hier legst du für jede die Tiefen fest.">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Zustellung je Durchgang" value={s.stepDown} min={0.01} step={0.05} unit="mm" onChange={(v) => set({ stepDown: v })} />
        <Field label="Sicherheitshöhe" value={s.safeZ} min={0.5} step={0.5} unit="mm" onChange={(v) => set({ safeZ: v })} />
      </div>
      <Group color={OP_COLOR.engrave} title="Gravur" sub="Schrift, Linien, Skalen">
        <Segmented value={s.engraveMode} onChange={(v) => set({ engraveMode: v })} options={[
          { value: 'contour', label: 'Umriss abfahren', hint: 'Jede Linie wird genau abgefahren' },
          { value: 'centerline', label: 'Mittellinie', hint: 'Schrift als ein Strich in der Mitte' }]} />
        {s.engraveMode === 'centerline' && (
          <p className="-mt-0.5 text-[11.5px] leading-relaxed text-fg3">
            Die Mittellinien erscheinen sofort <span className="text-[#22d3ee]">zyan</span> in der Ansicht – ein Strich wird dabei
            in einem Zug gefräst, ohne dass der Kopf zwischendurch abhebt. Breite Flächen (z. B. die Plattenkante) haben keine
            sinnvolle Mitte und werden weiterhin entlang ihres Umrisses graviert.
          </p>
        )}
        <Field label="Tiefe" value={s.engraveDepth} min={0.01} step={0.05} unit="mm" onChange={(v) => set({ engraveDepth: v })} />
      </Group>
      <Group color={OP_COLOR.pocket} title="Tasche" sub="Flächen bis zu einer Tiefe ausräumen">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tiefe" value={s.pocketDepth} min={0.01} step={0.1} unit="mm" onChange={(v) => set({ pocketDepth: v })} />
          {experte && <Field label="Zeilenabstand" value={s.pocketStepOver} min={0.05} step={0.05} unit="mm" onChange={(v) => set({ pocketStepOver: v })} />}
        </div>
      </Group>
      <Group color={OP_COLOR.cut} title="Durchbruch" sub="Löcher, Fenster, Plattenumriss">
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label="Materialstärke" value={s.material} min={0.1} step={0.1} unit="mm" onChange={(v) => set({ material: v })} /></div>
          {h > 0 && <Button onClick={() => set({ material: +h.toFixed(2) })} title="Modellhöhe übernehmen">= {h.toFixed(2)}</Button>}
        </div>
        {experte && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Übermaß nach unten" value={s.cutOvershoot} min={0} step={0.1} unit="mm" onChange={(v) => set({ cutOvershoot: v })} />
            <div>
              <div className="mb-1 text-[12px] text-fg2">Fräsrichtung</div>
              <Segmented value={s.cutDir} onChange={(v) => set({ cutDir: v })} options={[{ value: 'climb', label: 'Gleichlauf' }, { value: 'conventional', label: 'Gegenlauf' }]} />
            </div>
          </div>
        )}
        <div className={cn('grid gap-3', experte ? 'grid-cols-3' : 'grid-cols-1')}>
          <Field label="Haltestege" value={s.tabCount} min={0} max={12} step={1} onChange={(v) => set({ tabCount: Math.round(v) })} />
          {experte && <Field label="Stegbreite" value={s.tabWidth} min={0.5} step={0.5} unit="mm" onChange={(v) => set({ tabWidth: v })} />}
          {experte && <Field label="Steghöhe" value={s.tabHeight} min={0.1} step={0.1} unit="mm" onChange={(v) => set({ tabHeight: v })} />}
        </div>
        {experte && <Toggle label="Werkzeugradius ausgleichen (Löcher innen, Umriss außen)" checked={s.compensate} onChange={(v) => set({ compensate: v })} />}
        <p className="text-[11px] leading-snug text-fg3">Haltestege nur am Plattenumriss. Durchbrüche werden zuletzt gefräst, der Umriss ganz am Ende.</p>
      </Group>
    </StepFrame>
  );
}

// 6 ------------------------------------------------------------------------------
export function SelectStep({ s, set, contours, brush, setBrush, mode }: {
  s: Settings; set: (p: Partial<Settings>) => void; contours: Contour[]; brush: Op; setBrush: (o: Op) => void; mode: Mode;
}) {
  const setOp = (id: number, op: Op) => { const ops = { ...s.ops }; if (op === 'engrave') delete ops[String(id)]; else ops[String(id)] = op; set({ ops }); };
  const outer = contours.filter((c) => c.closed && c.depth === 0);
  const counts: Record<Op, number> = { engrave: 0, pocket: 0, cut: 0, off: 0 };
  for (const c of contours) counts[c.length < s.minLength ? 'off' : opOf(s, c.id)]++;
  const levels = Math.max(...contours.map((c) => c.level), 0) + 1;
  return (
    <StepFrame title="Linien zuweisen" lead="Wähle unten eine Bearbeitung und klicke auf der Bühne die Linien an, die sie bekommen sollen. Erneutes Klicken setzt sie auf Gravur zurück.">
      <div>
        <div className="mb-1 text-[12px] text-fg2">Beim Klick zuweisen</div>
        <Segmented value={brush} onChange={setBrush} options={(['off', 'cut', 'pocket', 'engrave'] as Op[]).map((o) => ({
          value: o, label: <span className="flex items-center justify-center gap-1.5"><span className={cn('h-1.5 w-1.5 rounded-full', OP_COLOR[o])} />{OP_LABEL[o]}</span>,
          hint: { off: 'Nicht fräsen', cut: 'Durchfräsen (Loch/Umriss)', pocket: 'Fläche ausräumen', engrave: 'Gravieren' }[o],
        }))} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button onClick={() => { const ops = { ...s.ops }; outer.forEach((c) => { ops[String(c.id)] = 'off'; }); set({ ops }); }} disabled={!outer.length} title="Plattenrand nicht bearbeiten">Außenkante aus</Button>
        <Button onClick={() => { const ops = { ...s.ops }; outer.forEach((c) => { ops[String(c.id)] = 'cut'; }); set({ ops }); }} disabled={!outer.length} title="Plattenrand durchfräsen">Außenkante = Durchbruch</Button>
        <Button onClick={() => set({ ops: {} })} icon={<RotateCcw {...ICON} />} disabled={!Object.keys(s.ops).length}>Zurücksetzen</Button>
      </div>
      {visibleIn(mode, 'experte') && (
        <Field label="Kürzer als … ignorieren" value={s.minLength} min={0} step={0.1} unit="mm" onChange={(v) => set({ minLength: v })} />
      )}
      <div className="max-h-72 overflow-y-auto rounded-md border border-line">
        {contours.map((c) => {
          const tooShort = c.length < s.minLength;
          const op = tooShort ? 'off' : opOf(s, c.id);
          return (
            <div key={c.id} className={cn('flex items-center gap-2 border-b border-line px-2.5 py-1 text-[12px] last:border-b-0', op === 'off' && 'text-fg3')}>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', OP_COLOR[op])} />
              <span className="flex-1 truncate">{levels > 1 ? `E${c.level + 1} · ` : ''}Linie {(c.id % 100000) + 1}<span className="text-fg3">{c.closed ? (c.depth === 0 ? ' · außen' : ` · innen ${c.depth}`) : ' · offen'}</span></span>
              <span className="num text-fg3">{c.length.toFixed(1)} mm</span>
              {!tooShort && (
                <select value={op} onChange={(e) => setOp(c.id, e.target.value as Op)} aria-label="Bearbeitung"
                  className="h-6 rounded border border-line bg-s2 px-1 text-[11px] text-fg outline-none focus:border-accent">
                  {(['engrave', 'pocket', 'cut', 'off'] as Op[]).map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>
      <div className="num flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-fg2">
        {(['engrave', 'pocket', 'cut', 'off'] as Op[]).map((o) => <span key={o} className="flex items-center gap-1.5"><span className={cn('h-1.5 w-1.5 rounded-full', OP_COLOR[o])} />{OP_LABEL[o]} {counts[o]}</span>)}
      </div>
      {counts.engrave + counts.pocket + counts.cut === 0 && <Note kind="warn">Keine Linie ausgewählt – es gäbe nichts zu fräsen.</Note>}
    </StepFrame>
  );
}

// 7 ------------------------------------------------------------------------------
export function ToolStep({ s, set, mode }: { s: Settings; set: (p: Partial<Settings>) => void; mode: Mode }) {
  const t = s.tool;
  const isV = t.tipAngle > 0;
  const experte = visibleIn(mode, 'experte');
  const width = t.tipDia + 2 * s.engraveDepth * Math.tan((t.tipAngle * Math.PI) / 360);
  return (
    <StepFrame title="Werkzeug" lead="Das Werkzeug erscheint über dem Nullpunkt. Die Maße bestimmen Gravurbreite und Radiusausgleich.">
      <Segmented value={isV ? 'v' : 'flat'} onChange={(v) => set({ tool: { ...t, tipAngle: v === 'v' ? 30 : 0, tipDia: v === 'v' ? 0.2 : 2 } })}
        options={[{ value: 'v', label: 'V-Stichel', hint: 'Kegelförmig – für Gravuren' }, { value: 'flat', label: 'Schaftfräser', hint: 'Zylindrisch – für Durchbrüche und Taschen' }]} />
      <div className={cn('grid gap-3', experte ? 'grid-cols-3' : 'grid-cols-1')}>
        {isV && experte && <Field label="Spitzenwinkel" value={t.tipAngle} min={5} max={120} step={5} unit="°" onChange={(v) => set({ tool: { ...t, tipAngle: v } })} />}
        <Field label={isV ? 'Spitze Ø' : 'Fräser Ø'} value={t.tipDia} min={0.05} step={0.05} unit="mm" onChange={(v) => set({ tool: { ...t, tipDia: v } })} />
        {experte && <Field label="Schaft Ø" value={t.shaftDia} min={1} step={0.5} unit="mm" onChange={(v) => set({ tool: { ...t, shaftDia: v } })} />}
      </div>
      <Note>Gravurbreite bei <span className="num">{s.engraveDepth.toFixed(2)} mm</span>: <span className="num">{width.toFixed(2)} mm</span>{isV && Object.values(s.ops).includes('cut') ? ' · Durchbrüche werden mit V-Stichel konisch.' : ''}</Note>
      <div className={cn('grid gap-3', experte ? 'grid-cols-3' : 'grid-cols-2')}>
        <Field label="Vorschub" value={s.feedXY} min={10} step={50} unit="mm/min" onChange={(v) => set({ feedXY: v })} />
        {experte && <Field label="Eintauchen" value={s.feedZ} min={10} step={10} unit="mm/min" onChange={(v) => set({ feedZ: v })} />}
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
  const progressRef = useRef(progress); progressRef.current = progress;
  useEffect(() => {
    if (!playing || !tp) return;
    let raf = 0, last = performance.now();
    const total = tp.cutLength + tp.rapidLength;
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      const next = progressRef.current + dt / 25; // ganze Fahrt ≈ 25 s
      if (next >= 1) { setProgress(1); setPlaying(false); return; }
      setProgress(next); raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    void total;
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, tp]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlaying(false); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <StepFrame title="Werkzeugweg berechnen" lead="Erst auf Knopfdruck entsteht der komplette Fahrweg. Farbig ist Fräsen, rot gestrichelt Eilgang. Danach kannst du den Fräser den Weg abfahren lassen.">
      <Button primary onClick={onCompute} disabled={!canCompute || computing} icon={<Calculator {...ICON} />}>
        {computing ? 'Berechne…' : tp && !stale ? 'Neu berechnen' : 'Werkzeugweg berechnen'}
      </Button>
      {tp && stale && <Note kind="warn">Einstellungen wurden geändert – der gezeigte Weg ist veraltet. Bitte neu berechnen.</Note>}
      {!canCompute && <Note kind="warn">Keine Linien zugewiesen. Gehe zurück zu „Auswahl“ oder „Schnittebenen“.</Note>}
      {tp?.warnings.map((w, i) => <Note key={i} kind="warn"><span className="flex gap-2"><AlertTriangle size={14} strokeWidth={1.7} className="mt-0.5 shrink-0" />{w}</span></Note>)}
      {tp && (
        <>
          <div className="num grid grid-cols-2 gap-2 text-[12px]">
            <Stat label="Fräsweg" v={`${tp.cutLength.toFixed(0)} mm`} />
            <Stat label="Eilgang" v={`${tp.rapidLength.toFixed(0)} mm`} />
            <Stat label="Pfade" v={`${tp.counts.engrave + tp.counts.pocket + tp.counts.cut}`} />
            <Stat label="Dauer ≈" v={fmtTime(tp.timeMin)} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[12px] text-fg2"><span>Simulation</span><span className="num text-fg">{Math.round(progress * 100)} %</span></div>
            <div className="flex items-center gap-2">
              <button onClick={() => { if (progress >= 1) setProgress(0); setPlaying(!playing); }} aria-label={playing ? 'Pause' : 'Abspielen'}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-s2 hover:bg-s3">{playing ? <Pause {...ICON} /> : <Play {...ICON} />}</button>
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
export function ProgramStep({ s, set, mode }: { s: Settings; set: (p: Partial<Settings>) => void; mode: Mode }) {
  const [focus, setFocus] = useState<'start' | 'end'>('start');
  const experte = visibleIn(mode, 'experte');
  const append = (t: string) => focus === 'start'
    ? set({ startBlock: (s.startBlock.trimEnd() + '\n' + t).trim(), presetId: 'custom' })
    : set({ endBlock: (s.endBlock.trimEnd() + '\n' + t).trim(), presetId: 'custom' });
  return (
    <StepFrame title="Programm-Rahmen" lead={experte
      ? 'Was die Maschine vor und nach dem Fräsen tun soll. Ziehe eine Vorlage oder einzelne Befehle in die Felder – oder klicke, um sie am Ende anzuhängen.'
      : 'Was die Maschine vor und nach dem Fräsen tun soll. Wähle eine Vorlage – eigene Befehle und Zeilen kommen im Modus „Experte“ dazu.'}>
      <div>
        <div className="mb-1 text-[12px] text-fg2">Vorlagen <span className="text-fg3">· {experte ? 'Klick setzt Start und Ende, Ziehen fügt ein' : 'Klick setzt Start und Ende'}</span></div>
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
          <CodeArea label="Start" value={s.startBlock} onChange={(v) => set({ startBlock: v, presetId: 'custom' })} onFocus={() => setFocus('start')} active={focus === 'start'} />
          <CodeArea label="Ende" value={s.endBlock} onChange={(v) => set({ endBlock: v, presetId: 'custom' })} onFocus={() => setFocus('end')} active={focus === 'end'} />
        </>
      )}
      {experte && (
        <div>
          <div className="mb-1 text-[12px] text-fg2">Befehle <span className="text-fg3">· Klick hängt an „{focus === 'start' ? 'Start' : 'Ende'}“ an</span></div>
          <div className="flex flex-wrap gap-1.5">
            {SNIPPETS.map((x) => <CodeChip key={x.l} label={x.l} code={x.t} hint={`${x.d}\n\n${x.t}`} onClick={() => append(x.t)} />)}
          </div>
        </div>
      )}
      <div className="rounded-md border border-line bg-s2 p-2.5">
        <div className="mb-1 text-[11px] text-fg3">So sieht der Start aktuell aufgelöst aus</div>
        <pre className="num whitespace-pre-wrap text-[11.5px] leading-relaxed text-fg2">{fillPlaceholders(s.startBlock, s)}</pre>
      </div>
      {experte && <p className="text-[11px] text-fg3">Platzhalter: <span className="num">{'{rpm}'}</span> Drehzahl · <span className="num">{'{safe}'}</span> Sicherheitshöhe · <span className="num">{'{feed}'}</span> Vorschub</p>}
    </StepFrame>
  );
}

// 10 -----------------------------------------------------------------------------
export function ExportStep({ gcode, fileName, tp, view, setView, mode }: { gcode: string; fileName: string; tp: Toolpath | null; view: 'code' | 'stage'; setView: (v: 'code' | 'stage') => void; mode: Mode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!gcode) return;
    try { await navigator.clipboard.writeText(gcode); } catch { /* Fallback */ const t = document.createElement('textarea'); t.value = gcode; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) { e.preventDefault(); copy(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcode]);
  const download = () => {
    const blob = new Blob([gcode], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = fileName.replace(/\.[^.]+$/, '') + '.gcode'; a.click(); URL.revokeObjectURL(a.href);
  };
  const lines = gcode ? gcode.split('\n').length : 0;
  return (
    <StepFrame title="Exportieren" lead="Rechts siehst du das fertige Programm. Es entspricht genau dem berechneten Weg. Herunterladen oder mit Strg + C kopieren.">
      {!tp && <Note kind="warn">Noch kein Werkzeugweg berechnet – gehe zu „Berechnen“.</Note>}
      <div className="flex gap-2">
        <Button primary onClick={download} disabled={!gcode} icon={<Download {...ICON} />}>Herunterladen</Button>
        <Button onClick={copy} disabled={!gcode} icon={copied ? <Check {...ICON} /> : <Copy {...ICON} />}>{copied ? 'Kopiert' : 'Kopieren'}</Button>
      </div>
      {gcode && (
        <>
          <div className="num text-[12px] text-fg3"><span className="text-fg">{lines.toLocaleString('de-DE')}</span> Zeilen · <span className="text-fg">{(gcode.length / 1024).toFixed(0)} kB</span> · {fileName.replace(/\.[^.]+$/, '')}.gcode</div>
          <div>
            <div className="mb-1 text-[12px] text-fg2">Rechts anzeigen</div>
            <Segmented value={view} onChange={setView} options={[{ value: 'code', label: 'G-Code' }, { value: 'stage', label: '3D-Weg' }]} />
          </div>
          {visibleIn(mode, 'experte') && (
            <div className="num flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg3">
              <span><span className="text-danger">G0</span> Eilgang</span><span><span className="text-accent">G1</span> Fräsen</span><span><span className="text-warn">M3</span> Maschine</span><span><span className="text-ok">F</span> Vorschub</span>
            </div>
          )}
        </>
      )}
    </StepFrame>
  );
}
