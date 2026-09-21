// Parameter panel — slim, organized sections
import { useState } from "react";
import type { CamParams, ToolType } from "../types/cam";

interface ParamPanelProps {
  params: CamParams;
  onChange: (p: CamParams) => void;
}

type Section = "tool" | "operation" | "depth" | "geometry" | "feeds" | "origin" | "advanced";

export function ParamPanel({ params, onChange }: ParamPanelProps) {
  const [openSection, setOpenSection] = useState<Section | null>("operation");

  const update = (patch: Partial<CamParams>) => onChange({ ...params, ...patch });
  const updateTool = (patch: Partial<CamParams["tool"]>) => onChange({ ...params, tool: { ...params.tool, ...patch } });

  const Section = ({ id, title, children }: { id: Section; title: string; children: React.ReactNode }) => (
    <div className="border-b border-white/5">
      <button
        type="button"
        onClick={() => setOpenSection(openSection === id ? null : id)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition"
      >
        <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">{title}</span>
        <svg className={`w-3 h-3 text-zinc-500 transition-transform ${openSection === id ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {openSection === id && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );

  const NumberField = ({ label, value, onValue, suffix, step = 0.1, min, max }: { label: string; value: number; onValue: (n: number) => void; suffix?: string; step?: number; min?: number; max?: number }) => (
    <div>
      <label className="text-[11px] text-zinc-500 block mb-1">{label}</label>
      <div className="flex items-center bg-black/40 border border-white/5 rounded-md focus-within:border-cyan-500/40 transition">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onValue(parseFloat(e.target.value) || 0)}
          className="flex-1 bg-transparent px-3 py-1.5 text-sm text-zinc-200 outline-none font-mono"
        />
        {suffix && <span className="px-2 text-[10px] text-zinc-500 font-mono">{suffix}</span>}
      </div>
    </div>
  );

  const SelectField = <T extends string>({ label, value, options, onValue }: { label: string; value: T; options: { value: T; label: string }[]; onValue: (v: T) => void }) => (
    <div>
      <label className="text-[11px] text-zinc-500 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onValue(e.target.value as T)}
        className="w-full bg-black/40 border border-white/5 rounded-md px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-cyan-500/40"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const Toggle = ({ label, value, onValue }: { label: string; value: boolean; onValue: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onValue(!value)}
      className="flex items-center justify-between w-full py-1.5 text-left"
    >
      <span className="text-[12px] text-zinc-300">{label}</span>
      <span className={`relative inline-flex h-5 w-9 rounded-full transition ${value ? "bg-cyan-500/80" : "bg-zinc-700"}`}>
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${value ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );

  return (
    <div className="text-zinc-200">
      <Section id="operation" title="Operation">
        <SelectField
          label="Strategie"
          value={params.strategy}
          onValue={(v) => update({ strategy: v as any })}
          options={[
            { value: "contour", label: "Kontur folgen (Profil)" },
            { value: "outline", label: "Silhouette / Umriss" },
            { value: "pocket", label: "Tasche / Fläche ausräumen" },
            { value: "vcarve", label: "V-Carve (Gravur mit V-Bit)" },
            { value: "centerline", label: "Mittellinie (z.B. Schrift)" },
          ]}
        />
        {(params.strategy === "contour") && (
          <SelectField
            label="Schnittseite"
            value={params.contourSide}
            onValue={(v) => update({ contourSide: v as any })}
            options={[
              { value: "outside", label: "Außenkontur" },
              { value: "inside", label: "Innenkontur" },
              { value: "both", label: "Beide" },
            ]}
          />
        )}
        <SelectField
          label="Schnittrichtung"
          value={params.cutDirection}
          onValue={(v) => update({ cutDirection: v as any })}
          options={[
            { value: "climb", label: "Gleichlauf (empfohlen)" },
            { value: "conventional", label: "Gegenlauf" },
          ]}
        />
      </Section>

      <Section id="tool" title="Werkzeug">
        <SelectField
          label="Typ"
          value={params.tool.type}
          onValue={(v) => updateTool({ type: v as ToolType })}
          options={[
            { value: "flat", label: "Zylindrisch (Schaftfräser)" },
            { value: "vbit", label: "V-Bit (Gravur / Fase)" },
            { value: "ball", label: "Kugelfräser" },
            { value: "drill", label: "Bohrer" },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Durchmesser" value={params.tool.diameter} onValue={(n) => updateTool({ diameter: n })} suffix="mm" step={0.1} min={0.1} />
          {params.tool.type === "vbit" && (
            <NumberField label="Spitzenwinkel" value={params.tool.angle} onValue={(n) => updateTool({ angle: n })} suffix="°" step={5} min={10} max={180} />
          )}
          <NumberField label="Schneiden" value={params.tool.fluteCount} onValue={(n) => updateTool({ fluteCount: Math.max(1, Math.round(n)) })} step={1} min={1} />
        </div>
        <div>
          <label className="text-[11px] text-zinc-500 block mb-1">Name (optional)</label>
          <input
            type="text"
            value={params.tool.name}
            onChange={(e) => updateTool({ name: e.target.value })}
            placeholder="z.B. 3mm Schaftfräser"
            className="w-full bg-black/40 border border-white/5 rounded-md px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-cyan-500/40"
          />
        </div>
      </Section>

      <Section id="depth" title="Tiefe & Schichten">
        <div className="flex items-center justify-between py-1.5">
          <span className="text-[12px] text-zinc-300">Gesamttiefe verwenden</span>
          <button
            type="button"
            onClick={() => update({ useTotalDepth: !params.useTotalDepth })}
            className={`relative inline-flex h-5 w-9 rounded-full transition ${params.useTotalDepth ? "bg-cyan-500/80" : "bg-zinc-700"}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${params.useTotalDepth ? "translate-x-4" : ""}`} />
          </button>
        </div>
        {params.useTotalDepth ? (
          <NumberField label="Gesamttiefe" value={params.totalDepth} onValue={(n) => update({ totalDepth: n })} suffix="mm" step={0.1} min={0.1} />
        ) : (
          <NumberField label="Untere Ebene (Z)" value={params.cutBottomZ} onValue={(n) => update({ cutBottomZ: n })} suffix="mm" step={0.1} />
        )}
        <NumberField label="Obere Ebene (Z)" value={params.cutTopZ} onValue={(n) => update({ cutTopZ: n })} suffix="mm" step={0.1} />
        <NumberField label="Step-Down (Schicht)" value={params.stepDown} onValue={(n) => update({ stepDown: n })} suffix="mm" step={0.1} min={0.1} />
        <NumberField label="Ramp-Winkel (Eintauchen)" value={params.rampAngle} onValue={(n) => update({ rampAngle: n })} suffix="°" step={1} min={0} max={45} />
      </Section>

      <Section id="geometry" title="Geometrie-Filter">
        <SelectField
          label="Arbeitsebene"
          value={params.workPlane}
          onValue={(v) => update({ workPlane: v as any })}
          options={[
            { value: "xy", label: "XY (oben/unten)" },
            { value: "xz", label: "XZ (Seitenansicht)" },
            { value: "yz", label: "YZ (Seitenansicht)" },
          ]}
        />
        <NumberField label="Min. Konturlänge" value={params.ignoreSmallFeatures} onValue={(n) => update({ ignoreSmallFeatures: n })} suffix="mm" step={0.1} min={0} />
        <Toggle label="Nur oberste Ebene schneiden" value={params.onlyTopLevel} onValue={(v) => update({ onlyTopLevel: v })} />
        <Toggle label="Schlichtpass (Finish-Pass)" value={params.finishPass} onValue={(v) => update({ finishPass: v })} />
        {params.finishPass && (
          <NumberField label="Schlichtaufmaß" value={params.finishStock} onValue={(n) => update({ finishStock: n })} suffix="mm" step={0.05} min={0} />
        )}
      </Section>

      <Section id="feeds" title="Schnitt-Parameter">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Vorschub" value={params.feedRate} onValue={(n) => update({ feedRate: n })} suffix="mm/min" step={50} min={10} />
          <NumberField label="Eintauchen" value={params.plungeRate} onValue={(n) => update({ plungeRate: n })} suffix="mm/min" step={25} min={5} />
          <NumberField label="Drehzahl" value={params.spindleRPM} onValue={(n) => update({ spindleRPM: n })} suffix="RPM" step={500} min={1000} />
          <NumberField label="Eilgang" value={params.rapidRate} onValue={(n) => update({ rapidRate: n })} suffix="mm/min" step={500} min={500} />
        </div>
        <Toggle label="Kühlmittel (M8)" value={params.useCoolant} onValue={(v) => update({ useCoolant: v })} />
      </Section>

      <Section id="origin" title="Nullpunkt & Sicherheit">
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="X" value={params.originX} onValue={(n) => update({ originX: n })} suffix="mm" step={1} />
          <NumberField label="Y" value={params.originY} onValue={(n) => update({ originY: n })} suffix="mm" step={1} />
          <NumberField label="Z" value={params.originZ} onValue={(n) => update({ originZ: n })} suffix="mm" step={0.1} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Sicherheits-Z" value={params.safeZ} onValue={(n) => update({ safeZ: n })} suffix="mm" step={0.5} min={1} />
          <NumberField label="Rückzug-Z" value={params.retractZ} onValue={(n) => update({ retractZ: n })} suffix="mm" step={0.5} min={0.5} />
        </div>
      </Section>

      <Section id="advanced" title="Tabs & Erweitert">
        <Toggle label="Stege (Tabs) verwenden" value={params.useTabs} onValue={(v) => update({ useTabs: v })} />
        {params.useTabs && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Anzahl" value={params.tabCount} onValue={(n) => update({ tabCount: Math.max(0, Math.round(n)) })} step={1} min={0} max={20} />
            <NumberField label="Breite" value={params.tabWidth} onValue={(n) => update({ tabWidth: n })} suffix="mm" step={0.5} min={0.5} />
          </div>
        )}
        <NumberField label="Kurven-Toleranz" value={params.curveResolution} onValue={(n) => update({ curveResolution: n })} suffix="mm" step={0.05} min={0.01} />
        {(params.strategy === "vcarve" || params.strategy === "centerline") && (
          <NumberField label="Gravurtiefe" value={params.centerlineDepth} onValue={(n) => update({ centerlineDepth: n })} suffix="mm" step={0.1} min={0.1} />
        )}
      </Section>
    </div>
  );
}
