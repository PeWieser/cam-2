// File upload + drop zone
import { useRef } from "react";
import { SUPPORTED_EXTENSIONS } from "../lib/modelLoader";

interface FileUploadProps {
  onFile: (file: File) => void;
  loading: boolean;
  error: string | null;
  fileName?: string;
}

export function FileUpload({ onFile, loading, error, fileName }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (loading) return;
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const handleClick = () => {
    if (loading) return;
    inputRef.current?.click();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={handleClick}
      className={`relative flex flex-col items-center justify-center p-6 border border-dashed rounded-lg cursor-pointer transition group ${
        loading
          ? "border-cyan-500/30 bg-cyan-500/5 cursor-wait"
          : error
            ? "border-red-500/30 bg-red-500/5 hover:bg-red-500/10"
            : "border-white/10 hover:border-cyan-500/40 hover:bg-cyan-500/5"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".stl,.obj,.3mf,.ply"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {loading ? (
        <>
          <div className="h-8 w-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mb-2" />
          <p className="text-[12px] text-cyan-300 font-medium">Lade Modell…</p>
        </>
      ) : fileName ? (
        <>
          <div className="h-10 w-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-2">
            <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-[13px] text-zinc-200 font-medium">{fileName}</p>
          <p className="text-[10px] text-zinc-500 mt-1">Klicken zum Ändern</p>
        </>
      ) : error ? (
        <>
          <div className="h-10 w-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-2">
            <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-[12px] text-red-300 text-center max-w-[280px]">{error}</p>
          <p className="text-[10px] text-zinc-500 mt-2">Klicken zum erneuten Versuch</p>
        </>
      ) : (
        <>
          <div className="h-10 w-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/30 transition">
            <svg className="w-5 h-5 text-zinc-400 group-hover:text-cyan-400 transition" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="text-[12px] text-zinc-300 font-medium">3D-Modell hier ablegen</p>
          <p className="text-[10px] text-zinc-500 mt-1">oder klicken zum Auswählen</p>
          <div className="flex flex-wrap justify-center gap-1 mt-3">
            {SUPPORTED_EXTENSIONS.filter((e) => e.native).map((e) => (
              <span key={e.ext} className="px-1.5 py-0.5 text-[9px] uppercase font-mono bg-white/5 text-zinc-400 rounded">
                {e.ext}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
