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
