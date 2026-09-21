export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

export type Contour = {
  id: number;
  pts: Vec2[];
  closed: boolean;
  area: number;
  length: number;
  depth: number;      // Verschachtelungstiefe (0 = außen)
  isOuter: boolean;
};

export type MeshData = {
  positions: Float32Array;   // 9 Werte pro Dreieck, Original-Koordinaten
  triangleCount: number;
  name: string;
};

/** Ausgerichtetes Mesh (Oberseite = +Z) */
export type OrientedMesh = {
  positions: Float32Array;
  min: [number, number, number];
  max: [number, number, number];
};

export type TopAxis = '+z' | '-z' | '+x' | '-x' | '+y' | '-y';
export type Strategy = 'contour' | 'centerline' | 'fill';
/** Wo der Werkzeugmittelpunkt relativ zur Kontur läuft */
export type PathSide = 'on' | 'outside' | 'inside';
export type OriginXY =
  | 'front-left' | 'front-center' | 'front-right'
  | 'center-left' | 'center' | 'center-right'
  | 'back-left' | 'back-center' | 'back-right';
export type OriginZ = 'top' | 'bottom';

export type Tool = {
  tipAngle: number;   // Grad (z.B. 30°)
  tipDia: number;     // mm
  shaftDia: number;   // mm
};

export type Settings = {
  topAxis: TopAxis;
  sliceOffset: number;      // mm unter Oberkante
  tolerance: number;        // Kurventoleranz mm
  originXY: OriginXY;
  originZ: OriginZ;
  strategy: Strategy;
  pathSide: PathSide;       // on = Stichel auf Linie; outside/inside = Schaftfräser-Offset
  mirrorY: boolean;         // Front von hinten gravieren
  depth: number;
  stepDown: number;
  safeZ: number;
  stepOver: number;
  minLength: number;
  ignored: number[];        // Kontur-IDs
  tool: Tool;
  feedXY: number;
  feedZ: number;
  rpm: number;
  startBlock: string;
  endBlock: string;
  presetId: string;
};

export type Move = { x: number; y: number; z: number; rapid: boolean };

export type Toolpath = {
  moves: Move[];                // vollständige Werkzeugbewegung inkl. Eilgang
  cutLength: number;
  rapidLength: number;
  timeMin: number;
  passes: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  settingsKey: string;          // zur Erkennung veralteter Ergebnisse
};

export const PRESETS: { id: string; name: string; start: string; end: string }[] = [
  {
    id: 'grbl', name: 'GRBL',
    start: 'G21 G90 G17 G94\nG0 Z{safe}\nM3 S{rpm}\nG4 P1.5 ; Spindel hochlaufen',
    end: 'G0 Z{safe}\nM5\nG0 X0 Y0\nM2',
  },
  {
    id: 'linuxcnc', name: 'LinuxCNC / Mach3',
    start: 'G21 G90 G17 G40 G49 G94\nG64 P0.01\nG0 Z{safe}\nM3 S{rpm}\nG4 P2',
    end: 'G0 Z{safe}\nM5\nG0 X0 Y0\nM30',
  },
  {
    id: 'marlin', name: 'Marlin (CNC-Modus)',
    start: 'G21 G90\nG0 Z{safe}\nM3 S{rpm}\nG4 S2',
    end: 'G0 Z{safe}\nM5\nG0 X0 Y0\nM84',
  },
  {
    id: 'minimal', name: 'Nur Bewegungen',
    start: 'G21 G90\nG0 Z{safe}',
    end: 'G0 Z{safe}',
  },
];

export const defaultSettings: Settings = {
  topAxis: '+z',
  sliceOffset: 0.1,
  tolerance: 0.03,
  originXY: 'front-left',
  originZ: 'top',
  strategy: 'contour',
  pathSide: 'on',
  mirrorY: false,
  depth: 0.3,
  stepDown: 0.3,
  safeZ: 3,
  stepOver: 0.25,
  minLength: 0.5,
  ignored: [],
  tool: { tipAngle: 30, tipDia: 0.2, shaftDia: 3.175 },
  feedXY: 500,
  feedZ: 120,
  rpm: 12000,
  startBlock: PRESETS[0].start,
  endBlock: PRESETS[0].end,
  presetId: 'grbl',
};

/** DnD-fähige Bausteine für Start/Ende-Blöcke */
export type CodeChip = {
  id: string;
  label: string;
  kind: 'preset-start' | 'preset-end' | 'snippet';
  code: string;
  hint?: string;
};

export function buildCodeChips(): CodeChip[] {
  const chips: CodeChip[] = [];
  for (const p of PRESETS) {
    chips.push({ id: `ps-${p.id}`, label: `${p.name} · Start`, kind: 'preset-start', code: p.start, hint: 'Zieht den kompletten Startblock' });
    chips.push({ id: `pe-${p.id}`, label: `${p.name} · Ende`, kind: 'preset-end', code: p.end, hint: 'Zieht den kompletten Endblock' });
  }
  const snips: { id: string; label: string; code: string }[] = [
    { id: 'm0', label: 'Pause M0', code: 'M0 ; Pause – Weiter an der Maschine' },
    { id: 'm8', label: 'Kühlung an', code: 'M8' },
    { id: 'm9', label: 'Kühlung aus', code: 'M9' },
    { id: 'g4', label: 'Warten 2 s', code: 'G4 P2' },
    { id: 'spindle', label: 'Spindel an', code: 'M3 S{rpm}' },
    { id: 'spindle-off', label: 'Spindel aus', code: 'M5' },
    { id: 'home-xy', label: 'XY nach 0', code: 'G0 X0 Y0' },
    { id: 'safe-z', label: 'Auf safe Z', code: 'G0 Z{safe}' },
  ];
  for (const s of snips) chips.push({ id: s.id, label: s.label, kind: 'snippet', code: s.code });
  return chips;
}

export type StepId = 'model' | 'orient' | 'slice' | 'origin' | 'depth' | 'select' | 'tool' | 'compute' | 'program' | 'export';

export const STEPS: { id: StepId; title: string }[] = [
  { id: 'model', title: 'Modell' },
  { id: 'orient', title: 'Ausrichtung' },
  { id: 'slice', title: 'Schnittebene' },
  { id: 'origin', title: 'Nullpunkt' },
  { id: 'depth', title: 'Gravur' },
  { id: 'select', title: 'Auswahl' },
  { id: 'tool', title: 'Werkzeug' },
  { id: 'compute', title: 'Berechnen' },
  { id: 'program', title: 'Programm' },
  { id: 'export', title: 'Export' },
];
