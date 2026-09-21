// MeshCAM - 3D to G-Code Converter
import { useEffect, useMemo, useState } from "react";
import { FileUpload } from "./components/FileUpload";
import { ModelViewer } from "./components/ModelViewer";
import { ParamPanel } from "./components/ParamPanel";
import { GCodePanel } from "./components/GCodePanel";
import { loadModel } from "./lib/modelLoader";
import { generateGCode } from "./lib/camEngine";
import { DEFAULT_PARAMS, type CamParams, type ModelInfo } from "./types/cam";

export default function App() {
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<CamParams>(DEFAULT_PARAMS);
  const [showToolpath, setShowToolpath] = useState(true);
  const [autoGenerate, setAutoGenerate] = useState(true);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const info = await loadModel(file);
      setModel(info);
      // Suggest depths based on bounding box
      const height = info.bbox.max[2] - info.bbox.min[2];
      setParams((p) => ({
        ...p,
        totalDepth: Math.max(0.5, height),
        stepDown: Math.max(0.3, height / 4),
        cutTopZ: info.bbox.max[2],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // G-Code is generated on demand (or when model/params change if autoGenerate is true)
  const gcodeResult = useMemo(() => {
    if (!model) return null;
    try {
      return generateGCode(model.mesh, params);
    } catch (e) {
      console.error(e);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, params, autoGenerate]);

  // Toolpath data for 3D viewer — show all layers as 3D lines
  // Transform: CAM (x, y, z) -> three.js (x, -z, y) to match model rotation
  const toolpathForView = useMemo(() => {
    if (!gcodeResult) return [];
    if (gcodeResult.allLayerToolpaths) {
      return gcodeResult.allLayerToolpaths.flatMap((layer) =>
        layer.polylines.map((poly) => ({
          points: poly.map((p) => ({ x: p.x, y: -layer.z, z: p.y })),
          z: layer.z,
        })),
      );
    }
    return gcodeResult.toolpath.map((poly) => ({
      points: poly.map((p) => ({ x: p.x, y: -gcodeResult.toolpathLayerZ, z: p.y })),
      z: gcodeResult.toolpathLayerZ,
    }));
  }, [gcodeResult]);

  const handleReset = () => {
    setParams(DEFAULT_PARAMS);
  };

  // Reset error when params change
  useEffect(() => {
    if (error) setError(null);
  }, [params]);

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0b] text-zinc-200 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-black/30">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M14 7h7v7" />
            </svg>
          </div>
          <div>
            <h1 className="text-[14px] font-semibold text-white tracking-tight">MeshCAM</h1>
            <p className="text-[10px] text-zinc-500 -mt-0.5">3D-Modell zu G-Code · 3-Achsen Fräse</p>
          </div>
        </div>

        {model && (
          <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-400">
            <div>
              <span className="text-zinc-600">Maße</span>
              <span className="ml-1.5 text-zinc-300">
                {(model.bbox.max[0] - model.bbox.min[0]).toFixed(1)} × {(model.bbox.max[1] - model.bbox.min[1]).toFixed(1)} × {(model.bbox.max[2] - model.bbox.min[2]).toFixed(1)} mm
              </span>
            </div>
            <div>
              <span className="text-zinc-600">Dreiecke</span>
              <span className="ml-1.5 text-zinc-300">{model.triangleCount.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-zinc-600">Größe</span>
              <span className="ml-1.5 text-zinc-300">{(model.fileSize / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-2.5 py-1 text-[11px] text-zinc-400 hover:text-white hover:bg-white/5 rounded transition"
          >
            Parameter zurücksetzen
          </button>
          <button
            type="button"
            onClick={() => setAutoGenerate((v) => !v)}
            className={`px-2.5 py-1 text-[11px] rounded transition ${
              autoGenerate ? "bg-cyan-500/15 text-cyan-300" : "text-zinc-400 hover:bg-white/5"
            }`}
            title="G-Code automatisch regenerieren"
          >
            {autoGenerate ? "Auto: an" : "Auto: aus"}
          </button>
        </div>
      </header>

      {/* Main grid */}
      <div className="flex-1 grid grid-cols-[320px_1fr_440px] overflow-hidden">
        {/* Left: Parameters */}
        <aside className="border-r border-white/5 bg-[#0d0d10] overflow-y-auto">
          <div className="px-4 pt-3 pb-2 border-b border-white/5">
            <h2 className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">1 · Modell hochladen</h2>
          </div>
          <div className="p-3">
            <FileUpload
              onFile={handleFile}
              loading={loading}
              error={error}
              fileName={model?.fileName}
            />
          </div>
          <div className="border-t border-white/5">
            <h2 className="px-4 pt-3 pb-2 text-[11px] uppercase tracking-wider text-zinc-400 font-medium">2 · CAM-Parameter</h2>
          </div>
          <ParamPanel params={params} onChange={setParams} />
          <div className="px-4 py-4 border-t border-white/5 bg-black/20">
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Tipp: STEP/IGES Dateien können mit FreeCAD oder Online-Konvertern zu STL/OBJ
              konvertiert werden — diese werden dann direkt im Browser verarbeitet.
            </p>
          </div>
        </aside>

        {/* Center: 3D viewer */}
        <main className="relative bg-[#0f0f11] overflow-hidden">
          <ModelViewer mesh={model?.mesh ?? null} toolpath={toolpathForView} showToolpath={showToolpath} />

          {/* Welcome overlay when no model */}
          {!model && !loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="max-w-md text-center px-8">
                <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 border border-cyan-400/20 flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <h3 className="text-[18px] font-semibold text-zinc-200 mb-2">3D-Modell zu G-Code</h3>
                <p className="text-[12px] text-zinc-500 leading-relaxed">
                  Lade eine STL-, OBJ-, 3MF- oder PLY-Datei hoch, um automatisch Werkzeugwege für deine
                  3-Achsen CNC-Fräse zu generieren. Strategie, Werkzeug, Tiefe und Vorschub sind
                  vollständig konfigurierbar.
                </p>
              </div>
            </div>
          )}

          {/* Overlay controls */}
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none">
            <div className="bg-black/40 backdrop-blur border border-white/5 rounded px-3 py-2 pointer-events-auto">
              <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-400">
                <span>Drehen</span>
                <span className="text-zinc-700">·</span>
                <span>Verschieben</span>
                <span className="text-zinc-700">·</span>
                <span>Zoom</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                onClick={() => setShowToolpath((v) => !v)}
                className={`px-3 py-1.5 text-[11px] rounded border transition backdrop-blur ${
                  showToolpath
                    ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                    : "bg-black/40 border-white/10 text-zinc-400 hover:bg-white/5"
                }`}
              >
                Toolpath {showToolpath ? "an" : "aus"}
              </button>
            </div>
          </div>

          {/* Bottom legend */}
          {model && (
            <div className="absolute bottom-3 left-3 bg-black/40 backdrop-blur border border-white/5 rounded px-3 py-2 text-[10px] font-mono">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-zinc-300" />
                  <span className="text-zinc-400">Modell</span>
                </div>
                {showToolpath && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-0.5 bg-cyan-400" />
                    <span className="text-zinc-400">Werkzeugweg</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Right: G-Code */}
        <aside className="border-l border-white/5 overflow-hidden">
          <GCodePanel
            gcode={gcodeResult?.gcode ?? ""}
            stats={gcodeResult?.stats ?? null}
            fileName={model?.fileName}
          />
        </aside>
      </div>
    </div>
  );
}
