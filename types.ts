export type Vec2 = { x: number; y: number };

/** Bearbeitungsart einer Kontur */
export type Op = 'engrave' | 'pocket' | 'cut' | 'off';

export const OP_LABEL: Record<Op, string> = { engrave: 'Gravur', pocket: 'Tasche', cut: 'Durchbruch', off: 'Aus' };

export type Contour = {
  id: number;          // level * 100000 + index
  level: number;       // Index der Schnittebene
  z: number;           // Welt-Z der Schnittebene
  pts: Vec2[];
  closed: boolean;
  area: number;
  length: number;
  depth: number;       // Verschachtelungstiefe innerhalb der Ebene (0 = außen)
  isOuter: boolean;
};

export type MeshData = {
  positions: Float32Array;
  triangleCount: number;
  name: string;
};

export type OrientedMesh = {
  positions: Float32Array;
  min: [number, number, number];
  max: [number, number, number];
};

export type TopAxis = '+z' | '-z' | '+x' | '-x' | '+y' | '-y';
export type OriginXY =
  | 'front-left' | 'front-center' | 'front-right'
  | 'center-left' | 'center' | 'center-right'
  | 'back-left' | 'back-center' | 'back-right';
export type OriginZ = 'top' | 'bottom';

export type Tool = {
  tipAngle: number;   // 0 = Schaftfräser
  tipDia: number;
  shaftDia: number;
};

export type Settings = {
  // Ausrichtung
  topAxis: TopAxis;
  rotZ: 0 | 90 | 180 | 270;
  mirror: boolean;
  scale: number;              // Faktor (1 = mm)
  // Schnitt
  sliceOffsets: number[];     // mm unter Oberkante, je Ebene
  tolerance: number;
  // Nullpunkt
  originXY: OriginXY;
  originZ: OriginZ;
  // Bearbeitung
  engraveMode: 'contour' | 'centerline';
  engraveDepth: number;
  pocketDepth: number;
  pocketStepOver: number;
  material: number;           // Materialstärke
  cutOvershoot: number;       // Übermaß beim Durchbruch
  tabCount: number;
  tabWidth: number;
  tabHeight: number;
  cutDir: 'climb' | 'conventional';
  compensate: boolean;        // Werkzeugradius-Korrektur bei Tasche/Durchbruch
  stepDown: number;
  safeZ: number;
  minLength: number;
  ops: Record<string, Op>;    // Kontur-ID → Bearbeitung (Standard: engrave)
  // Werkzeug & Maschine
  tool: Tool;
  feedXY: number;
  feedZ: number;
  rpm: number;
  startBlock: string;
  endBlock: string;
  presetId: string;
};

export type Move = { x: number; y: number; z: number; rapid: boolean; op: Op };

export type Toolpath = {
  moves: Move[];
  cutLength: number;
  rapidLength: number;
  timeMin: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  counts: Record<Op, number>;
  warnings: string[];
  settingsKey: string;
};

export const PRESETS: { id: string; name: string; start: string; end: string }[] = [
  { id: 'grbl', name: 'GRBL', start: 'G21 G90 G17 G94\nG0 Z{safe}\nM3 S{rpm}\nG4 P1.5 ; Spindel hochlaufen', end: 'G0 Z{safe}\nM5\nG0 X0 Y0\nM2' },
  { id: 'linuxcnc', name: 'LinuxCNC / Mach3', start: 'G21 G90 G17 G40 G49 G94\nG64 P0.01\nG0 Z{safe}\nM3 S{rpm}\nG4 P2', end: 'G0 Z{safe}\nM5\nG0 X0 Y0\nM30' },
  { id: 'marlin', name: 'Marlin (CNC)', start: 'G21 G90\nG0 Z{safe}\nM3 S{rpm}\nG4 S2', end: 'G0 Z{safe}\nM5\nG0 X0 Y0\nM84' },
  { id: 'minimal', name: 'Nur Bewegungen', start: 'G21 G90\nG0 Z{safe}', end: 'G0 Z{safe}' },
];

export const SNIPPETS: { l: string; t: string; d: string }[] = [
  { l: 'Pause', t: 'M0 ; Pause – Weiter an der Maschine', d: 'Programm anhalten (z. B. Werkzeugwechsel)' },
  { l: 'Spindel an', t: 'M3 S{rpm}', d: 'Spindel im Uhrzeigersinn starten' },
  { l: 'Spindel aus', t: 'M5', d: 'Spindel stoppen' },
  { l: 'Warten 2 s', t: 'G4 P2', d: 'Verweilzeit' },
  { l: 'Kühlung an', t: 'M8', d: 'Kühlmittel / Luft ein' },
  { l: 'Kühlung aus', t: 'M9', d: 'Kühlmittel / Luft aus' },
  { l: 'Sicherheitshöhe', t: 'G0 Z{safe}', d: 'Auf sichere Höhe fahren' },
  { l: 'Zum Nullpunkt', t: 'G0 X0 Y0', d: 'XY-Nullpunkt anfahren' },
  { l: 'Z antasten', t: 'G38.2 Z-25 F60 ; Taster\nG92 Z0', d: 'Werkzeuglänge per Taster setzen' },
];

export const defaultSettings: Settings = {
  topAxis: '+z', rotZ: 0, mirror: false, scale: 1,
  sliceOffsets: [0.1], tolerance: 0.03,
  originXY: 'front-left', originZ: 'top',
  engraveMode: 'contour', engraveDepth: 0.3,
  pocketDepth: 1, pocketStepOver: 0.3,
  material: 2, cutOvershoot: 0.2, tabCount: 4, tabWidth: 3, tabHeight: 0.5,
  cutDir: 'climb', compensate: true,
  stepDown: 0.3, safeZ: 5, minLength: 0.5, ops: {},
  tool: { tipAngle: 30, tipDia: 0.2, shaftDia: 3.175 },
  feedXY: 500, feedZ: 120, rpm: 12000,
  startBlock: PRESETS[0].start, endBlock: PRESETS[0].end, presetId: 'grbl',
};

export type StepId = 'model' | 'orient' | 'slice' | 'origin' | 'machining' | 'select' | 'tool' | 'compute' | 'program' | 'export';

export const STEPS: { id: StepId; title: string }[] = [
  { id: 'model', title: 'Modell' },
  { id: 'orient', title: 'Ausrichtung' },
  { id: 'slice', title: 'Schnittebenen' },
  { id: 'origin', title: 'Nullpunkt' },
  { id: 'machining', title: 'Bearbeitung' },
  { id: 'select', title: 'Auswahl' },
  { id: 'tool', title: 'Werkzeug' },
  { id: 'compute', title: 'Berechnen' },
  { id: 'program', title: 'Programm' },
  { id: 'export', title: 'Export' },
];
