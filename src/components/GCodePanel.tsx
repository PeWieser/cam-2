// G-Code display + download
import { useMemo, useState } from "react";
import type { GCodeStats } from "../lib/camEngine";

interface GCodePanelProps {
  gcode: string;
  stats: GCodeStats | null;
  fileName?: string;
}

export function GCodePanel({ gcode, stats, fileName }: GCodePanelProps) {
  const [copied, setCopied] = useState(false);

  const lines = useMemo(() => gcode.split("\n"), [gcode]);
  const lineCount = lines.length;

  const download = () => {
    const blob = new Blob([gcode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = fileName ? fileName.replace(/\.[^.]+$/, "") : "output";
    a.href = url;
    a.download = `${base}.gcode`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(gcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0b]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-black/40">
        <div className="flex items-center gap-3">
          <h2 className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">G-Code</h2>
          {stats && (
            <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
              <span>{lineCount} Zeilen</span>
              <span className="text-zinc-700">·</span>
              <span>Schnitt: {stats.cutLength.toFixed(0)}mm</span>
              <span className="text-zinc-700">·</span>
              <span>Eilgang: {stats.rapidLength.toFixed(0)}mm</span>
              <span className="text-zinc-700">·</span>
              <span>~{formatTime(stats.totalTime)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copy}
            disabled={!gcode}
            className="px-2.5 py-1 text-[11px] text-zinc-300 hover:text-white hover:bg-white/5 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {copied ? "Kopiert ✓" : "Kopieren"}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!gcode}
            className="px-3 py-1 text-[11px] bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 rounded disabled:opacity-40 disabled:cursor-not-allowed transition font-medium"
          >
            ↓ G-Code
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed text-zinc-300">
        {gcode ? (
          <table className="w-full">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="hover:bg-white/[0.02]">
                  <td className="select-none text-right pr-3 pl-2 text-zinc-600 w-12 align-top border-r border-white/5 sticky left-0 bg-[#0a0a0b]">{i + 1}</td>
                  <td className={`pl-3 pr-2 whitespace-pre ${line.trim().startsWith(";") ? "text-zinc-500 italic" : line.trim().startsWith("G0") ? "text-cyan-300" : line.trim().startsWith("G1") ? "text-amber-200" : line.trim().match(/^[GMO]\d/) ? "text-violet-300" : "text-zinc-300"}`}>{line || " "}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-[12px] text-zinc-600">G-Code wird hier angezeigt, sobald ein Modell geladen und Parameter gesetzt sind.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(s: number): string {
  if (!isFinite(s) || s <= 0) return "0s";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
