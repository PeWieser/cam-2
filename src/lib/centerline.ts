import type { Contour, Vec2 } from '../types';
import { simplify } from './geometry';

/**
 * Mittellinien-Berechnung (Gravur entlang der Mitte von Strichen/Stegen).
 *
 * Ein Stück Ergebnis ist entweder eine echte Mittellinie (`centerline: true`)
 * oder – für Formen, die zu breit für eine Mittellinie sind – die Kontur selbst
 * (`centerline: false`). Letzteres ist wichtig, damit eine mit „Gravur“ markierte
 * Plattenkante nicht als Skelett durch die ganze Platte läuft.
 *
 * Der naive Weg (Füllung rastern → Zhang-Suen → Pixel ablaufen) hat drei
 * Artefakte, die man im G-Code sieht:
 *   · Das Skelett ist eine Raster-Treppe mit seitlichen Zacken; bei schrägen
 *     Strichen weicht die „Mitte“ dadurch um ein Mehrfaches der Pixelgröße ab.
 *   · Der Ablauf startet an jedem Grad-1-Pixel, ein einziger Strich zerfällt
 *     dadurch in dutzende Stücke → wackelige Linie und ein Abheben je Stück.
 *   · Die Mittellinie endet schon eine halbe Strichbreite vor dem Strichende,
 *     weil das Skelett dort in die Ecken abbiegt.
 *
 * Die Pipeline hier vermeidet das:
 *   1. Regionen   – jede Kontur bildet mit den in ihr liegenden Konturen eine
 *                   eigene Region (Buchstabe „O“: außen + Zähler = Ring).
 *                   Dadurch kann eine große Fläche (Platte) die Mittellinie
 *                   eines darin liegenden Strichs nicht mehr verfälschen.
 *   2. Probe      – grobes Raster + Distanztransformation: ist der größte
 *                   Innenkreis klein gegen die Ausdehnung, ist die Form ein
 *                   Strich – sonst eine Fläche und wird entlang der Kontur
 *                   graviert. Das erspart die teure Feinberechnung.
 *   3. Rastern    – even-odd Scanline, Auflösung aus der geschätzten Strich-
 *                   breite (mindestens ~8 Pixel über die Breite)
 *   4. EDT        – exakte euklidische Distanztransformation: Abstand jedes
 *                   Pixels zum Rand, subpixel-genau auswertbar
 *   5. Grat       – Startpunkte sind lokale Maxima im Randabstand; die Rich-
 *                   tung kommt aus der Hesse-Matrix (Eigenvektor zum größeren
 *                   Eigenwert). Von dort wird beidseitig entlang des Grates
 *                   gelaufen (Schritt 0,7 px) und jeder Punkt über den lokalen
 *                   Querschnitt exakt auf die Mitte gesetzt. Am Strichende
 *                   wird geradeaus bis an den Rand verlängert – die Linie
 *                   läuft damit von Strichanfang bis Strichende.
 *   6. Verbinden  – Stücke, die an einer Gabelung auseinandergefallen sind,
 *                   werden wieder zusammengesetzt – aber nur, wenn der Ver-
 *                   bindungsschnitt im Bauteil liegt
 */
export type CenterlinePiece = {
  pts: Vec2[];
  /** false = Form ist zu breit für eine Mittellinie; `pts` ist dann die Kontur selbst */
  centerline: boolean;
};

/**
 * @param maxWidth Größte Breite (mm), die noch als Strich gilt. Ist eine Form
 *   breiter, wird sie nicht entlang ihrer Mitte, sondern entlang ihres Umrisses
 *   graviert – sie kommt als `centerline: false` zurück.
 */
export function computeCenterlines(contours: Contour[], tolerance: number, maxWidth = Infinity): CenterlinePiece[] {
  const cs = contours.filter((c) => c.closed && c.pts.length >= 3);
  if (!cs.length) return [];

  const box = cs.map(bboxOf);
  const out: CenterlinePiece[] = [];
  let budget = MAX_TOTAL_PX;

  for (let i = 0; i < cs.length; i++) {
    // Region = diese Kontur plus alle in ihr liegenden (Löcher und Inseln)
    const region: Contour[] = [cs[i]];
    for (let j = 0; j < cs.length; j++) {
      if (i !== j && contains(cs[i], box[i], cs[j], box[j])) region.push(cs[j]);
    }
    const asContour: CenterlinePiece = { pts: cs[i].pts, centerline: false };
    if (budget <= 0) { out.push(asContour); continue; }
    if (!isStrokeLike(region, box[i], maxWidth)) { out.push(asContour); continue; }

    const r = rasterize(region, fineRes(region, cs[i].depth, tolerance, box[i]), box[i]);
    if (!r || r.area === 0) { out.push(asContour); continue; }
    budget -= r.gw * r.gh;
    const dist = edt2d(r.g, r.gw, r.gh);
    // Ecken der Region in Rasterkoordinaten – daran werden die Häkchen erkannt
    const verts = cornerVerts(region, r);
    // typische halbe Strichbreite der Region in Pixeln – daran messen sich alle
    // Größen, die sonst in Pixeln steckten (u ≈ 1,5 bei grobem Raster, ≈ 40 bei feinem)
    const u = Math.max(1.5, strokeWidth(region, cs[i].depth) / (2 * r.res));
    const tol = Math.max(tolerance * 0.5, r.res * 0.5);
    let found = false;
    for (const raw of traceRidges(r, dist, verts, u)) {
      const m = miter(raw, dist, r.gw, r.gh);
      const pts = m.map((p) => ({ x: r.ox + p.x * r.res, y: r.oy + p.y * r.res }));
      const s = simplify(smooth(pts, SMOOTH), tol, false);
      if (s.length >= 2) { out.push({ pts: s, centerline: true }); found = true; }
    }
    // Nichts gefunden (z. B. zu fein für das Raster) → lieber die Kontur gravieren
    if (!found) out.push(asContour);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Regionen: liegt eine Kontur vollständig in einer anderen?
// ---------------------------------------------------------------------------

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function bboxOf(c: Contour): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of c.pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const t = (p.y - a.y) / (b.y - a.y);
      if (p.x < a.x + t * (b.x - a.x)) inside = !inside;
    }
  }
  return inside;
}

/** Liegt Kontur `d` vollständig innerhalb von Kontur `c`? (Begrenzungsrahmen + Stichproben) */
function contains(c: Contour, cb: Box, d: Contour, db: Box): boolean {
  if (db.minX < cb.minX || db.maxX > cb.maxX || db.minY < cb.minY || db.maxY > cb.maxY) return false;
  const n = d.pts.length;
  const at = (k: number) => d.pts[Math.min(n - 1, Math.floor((k * n) / 3))];
  return pointInPoly(at(0), c.pts) && pointInPoly(at(1), c.pts) && pointInPoly(at(2), c.pts);
}

// ---------------------------------------------------------------------------
// 2. Rastern
// ---------------------------------------------------------------------------

const MAX_SIDE = 1600;        // px pro Seite und Region
const MIN_RES = 0.004;        // mm – feiner wird nicht gerastert
const MAX_TOTAL_PX = 16e6;    // Obergrenze über alle Regionen
const PROBE_SIDE = 220;       // Kantenlänge des groben Rasters für die Probe
const AREA_RATIO = 0.3;       // 2·Innenkreis-Radius darf höchstens so viel der Diagonale sein
const SMOOTH = 2;             // Glättungsdurchgänge gegen das Zittern der Gratrichtung

type Raster = {
  g: Uint8Array;
  gw: number; gh: number;
  ox: number; oy: number;     // Weltkoordinate des Pixels (0,0), linke untere Ecke
  res: number;
  area: number;
};

const PAD = 2;                // Pixel Rand um die Region

/** Even-odd-Scanline über die gegebenen Konturen. */
function rasterize(cs: Contour[], res: number, b: Box): Raster | null {
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  if (!(w > 0) && !(h > 0)) return null;
  const gw = Math.ceil(w / res) + 1 + PAD * 2;
  const gh = Math.ceil(h / res) + 1 + PAD * 2;
  if (gw < 5 || gh < 5 || gw * gh > MAX_TOTAL_PX) return null;
  const ox = b.minX - PAD * res;
  const oy = b.minY - PAD * res;
  const g = new Uint8Array(gw * gh);

  // Segmente nach Zeile einsortieren (even-odd Scanline)
  const rows: { x0: number; y0: number; dx: number; dy: number }[][] = Array.from({ length: gh }, () => []);
  const addSeg = (ax: number, ay: number, bx: number, by: number) => {
    if (ay === by) return;
    const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    const r0 = Math.max(0, Math.floor((y0 - oy) / res));
    const r1 = Math.min(gh - 1, Math.ceil((y1 - oy) / res));
    const seg = { x0: ax, y0: ay, dx: bx - ax, dy: by - ay };
    for (let r = r0; r <= r1; r++) rows[r].push(seg);
  };
  for (const c of cs) {
    const pts = c.pts;
    // i und j laufen versetzt, damit die Schlusskante enthalten ist
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) addSeg(pts[j].x, pts[j].y, pts[i].x, pts[i].y);
  }

  const xs: number[] = [];
  let area = 0;
  for (let gy = 0; gy < gh; gy++) {
    const y = oy + (gy + 0.5) * res;
    xs.length = 0;
    for (const s of rows[gy]) {
      const y1 = s.y0 + s.dy;
      if ((s.y0 > y) === (y1 > y)) continue;
      xs.push(s.x0 + ((y - s.y0) / s.dy) * s.dx);
    }
    if (xs.length < 2) continue;
    xs.sort((a, b2) => a - b2);
    const base = gy * gw;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = (xs[k] - ox) / res, b2 = (xs[k + 1] - ox) / res;
      let x0 = Math.round(a), x1 = Math.round(b2) - 1;
      if (x1 < x0) {
        // schmaler als ein Pixel: wenigstens ein Pixel, sonst reißt der Strich
        const xm = Math.round((a + b2) / 2);
        if (xm >= 0 && xm < gw && b2 - a > 0.02) { g[base + xm] = 1; area++; }
        continue;
      }
      x0 = Math.max(0, x0); x1 = Math.min(gw - 1, x1);
      for (let x = x0; x <= x1; x++) { g[base + x] = 1; area++; }
    }
  }
  return { g, gw, gh, ox, oy, res, area };
}

/**
 * Schätzt die typische Strichbreite einer Region: 2·Fläche / Umfang.
 * Die Fläche zählt relativ zur Wurzel der Region – bei einem vertieften
 * Buchstaben ist die Wurzel ein Loch, dann sind die Vorzeichen umgekehrt.
 */
function strokeWidth(cs: Contour[], root: number): number {
  let a = 0, p = 0;
  for (const c of cs) {
    a += c.area * ((c.depth - root) % 2 === 0 ? 1 : -1);
    p += c.length;
  }
  if (p <= 0 || a <= 0) return 0;
  return (2 * a) / p;
}

/** Auflösung für die Feinberechnung: Toleranz, aber mindestens ~8 Pixel über die Breite. */
function fineRes(cs: Contour[], root: number, tolerance: number, b: Box): number {
  let res = Math.max(0.02, Math.min(tolerance, 0.2));
  const wEst = strokeWidth(cs, root);
  if (wEst > 0) res = Math.min(res, Math.max(MIN_RES, wEst / 8));
  return Math.max(res, Math.max(b.maxX - b.minX, b.maxY - b.minY) / MAX_SIDE);
}

/**
 * Strich oder Fläche? Zwei Bedingungen, beide müssen erfüllt sein:
 *   · Der größte Innenkreis ist klein gegen die Ausdehnung der Form (ein Strich
 *     ist lang und schmal). Eine Platte, ein Punkt oder ein gefülltes Rechteck
 *     fallen dadurch durch – für sie ist eine Mittellinie Unsinn.
 *   · Die breiteste Stelle ist nicht breiter als `maxWidth`. Das ist der
 *     Schwellwert, den der Benutzer einstellt: ab hier ist eine Form eine
 *     Fläche und wird entlang ihres Umrisses graviert.
 */
function isStrokeLike(cs: Contour[], b: Box, maxWidth: number): boolean {
  const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
  if (!(diag > 0)) return false;
  const res = diag / PROBE_SIDE;
  const r = rasterize(cs, res, b);
  if (!r || r.area === 0) return true;             // im Grobraster nichts erkannt → lieber versuchen
  const d = edt2d(r.g, r.gw, r.gh);
  let mx = 0;
  for (let i = 0; i < d.length; i++) if (d[i] > mx) mx = d[i];
  const wide = 2 * mx * r.res;                     // Durchmesser des größten Innenkreises
  return wide <= maxWidth && wide <= AREA_RATIO * diag;
}

// ---------------------------------------------------------------------------
// 3. Distanztransformation (exakt, O(n) nach Felzenszwalb/Huttenlocher)
// ---------------------------------------------------------------------------

function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** Abstand jedes Pixels zum nächsten Hintergrundpixel, in Pixeln. */
function edt2d(g: Uint8Array, gw: number, gh: number): Float32Array {
  const INF = 1e18;
  const n = Math.max(gw, gh);
  const f = new Float64Array(n), d = new Float64Array(n);
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  const sq = new Float32Array(gw * gh);   // quadrierter Abstand, genügt genau
  for (let i = 0; i < g.length; i++) sq[i] = g[i] ? INF : 0;
  for (let y = 0; y < gh; y++) {
    const base = y * gw;
    for (let x = 0; x < gw; x++) f[x] = sq[base + x];
    edt1d(f, d, v, z, gw);
    for (let x = 0; x < gw; x++) sq[base + x] = d[x];
  }
  for (let x = 0; x < gw; x++) {
    for (let y = 0; y < gh; y++) f[y] = sq[y * gw + x];
    edt1d(f, d, v, z, gh);
    for (let y = 0; y < gh; y++) sq[y * gw + x] = d[y];
  }
  const out = new Float32Array(gw * gh);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(sq[i]);
  return out;
}

// ---------------------------------------------------------------------------
// 4. Grat-Verfolgung
// ---------------------------------------------------------------------------

type P = { x: number; y: number };   // kontinuierliche Pixelkoordinaten

/**
 * Alle Größen, die am Raster hängen, werden am örtlichen Randabstand d
 * (halbe Strichbreite, gerechnet in Pixeln) gemessen – nicht in Pixeln.
 * Sonst hängt das Ergebnis davon ab, wie fein das Raster ist, und die
 * Rasterweite richtet sich nach Baugröße (MAX_SIDE), Toleranz und
 * geschätzter Strichbreite: dieselbe Form käme bei 25 mm und bei 200 mm
 * heraus, als wäre sie eine andere.
 */
const STEP_MIN = 0.5;     // px: nie kleiner schreiten (zu viele Schritte)
const STEP_MAX = 4;       // px: nie größer schreiten (der Grat wird sonst eckig)
const STEP_REL = 0.22;    // Schrittweite als Anteil des örtlichen Randabstands
const HESS_REL = 0.25;    // Stützweite der Hesse-Matrix als Anteil von d …
const HESS_MAX = 8;       // … px, höchstens (sonst reicht sie über den Strich)
const DMIN = 0.6;         // px: minimaler Randabstand (darunter ist Schluss)
const TAPER = 0.35;       // Anteil: um soviel darf der Randabstand unter das lokale Maß fallen
const WIN_STEPS = 16;     // Schritte im Fenster für das lokale Maß
const PERSIST = 3;        // so viele Schritte muss der Abstand gefallen sein
const SEED_MIN_REL = 0.15; // Anteil von u: minimaler Randabstand für einen Startpunkt
const SEED_GAP = 0.6;     // Anteil von d: Startpunkte, die näher beieinander liegen, sind einer
const SLIVER_REL = 0.12;  // Anteil von u: Stücke, die im Mittel näher am Rand liegen, sind Reste
const CLOSE_EPS = 0.3;    // Anteil von u: ab diesem Abstand der Enden gilt ein Stück als geschlossen
const LOOP_STEPS = 8;     // frühestens nach so vielen Schritten darf das greifen
const STEP_EXT = 0.08;    // Schrittweite beim Verlängern, als Anteil von d
const SEED_RIDGE = -0.4; // Krümmung quer zum Grat: ab hier ist ein Punkt Startpunkt
const INERTIA = 0.65;  // Anteil der bisherigen Richtung (Trägheit an Gabelungen)
const STUB = 0.5;      // Stücke, die kürzer als STUB·2·Breite sind, sind Reste einer Gabelung
const EXT_WIN = 10;     // mindestens so viele Punkte für die Richtung beim Verlängern
const RIDGE_MIN = -0.35; // Krümmung quer zum Grat: ab hier gilt die Richtung als Grat
const PEAK_MAX = -0.6;   // Krümmung entlang des Grates: darunter ist es ein Gipfel (Gabelung)
const PLATEAU = 10;    // Schritte ohne Grat, nach denen der Lauf abgebrochen wird
const OFF_CENTER = 0.35; // erlaubte Schieflage des Querschnitts beim Verlängern
const SMOOTH_MAX = 0.45;   // rad (~26°): bis zu diesem Knick wird voll geglättet
const SMOOTH_FADE = 0.35;  // rad: darüber nimmt die Glättung ab, ab ~46° gar nicht mehr
const CORNER_MIN = 1.2;  // rad (~70°): spitzere Ecken sind eine Spitze – ihr Grat gehört zum Strich
const CORNER_MAX = 2.5;  // rad (~145°): stumpfere Ecken werfen kein Häkchen
const CORNER_TOL = 1.15; // Toleranz auf den theoretischen Abstand der Winkelhalbierenden
const CORNER_LINK = 2.8; // Umweg über den Schnittpunkt, ab dem es keine Ecke ist (Vielfaches der Lücke)
const MITER_TURN = 0.9;  // rad (~52°): ab dieser Richtungsänderung wird die Ecke gegratet
const MITER_MAX = 6;     // höchstens so viele Ecken pro Stück

/** bilinear interpolierter Randabstand; Pixel (ix,iy) hat die Mitte (ix+0.5, iy+0.5) */
function sampleD(dist: Float32Array, gw: number, gh: number, x: number, y: number): number {
  const fx = x - 0.5, fy = y - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= gw || y0 + 1 >= gh) return 0;
  const tx = fx - x0, ty = fy - y0;
  const i = y0 * gw + x0;
  const a = dist[i], b = dist[i + 1], c = dist[i + gw], d = dist[i + gw + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/**
 * Gratrichtung aus der Hesse-Matrix des Randabstands.
 * Der Abstand ist ein Dach („Zelt“): entlang des Grates ist er konstant
 * (2. Ableitung ≈ 0), quer dazu hat er einen Knick (2. Ableitung ≈ −2).
 * Die Gratrichtung ist also der Eigenvektor zum *größeren* Eigenwert.
 */
/**
 * Gratrichtung aus der Hesse-Matrix des Randabstands.
 *
 * Die Stützweite hängt am Randabstand: mit fester Weite (1 px) misst die
 * Matrix die Krümmung auf Rasterebene, und ob die Stützstellen den Grat
 * treffen, ist reiner Zufall – bei grobem Raster (wenige Pixel über die
 * Breite) ständig nicht. Mit wachsendem h fällt das Rauschen der
 * Unterabtastung (∼1/h²), das Signal nur mit 1/h. Damit die Zahlen bei
 * jedem h dieselbe Bedeutung haben, wird mit h multipliziert: am Grat
 * steht dann überall ≈ −2, unabhängig von Rasterweite und Strichbreite.
 */
function ridgeDir(dist: Float32Array, gw: number, gh: number, x: number, y: number): { rx: number; ry: number; lamA: number; lamB: number } | null {
  const d0 = sampleD(dist, gw, gh, x, y);
  const h = Math.max(1, Math.min(HESS_MAX, HESS_REL * d0));
  const dxp = sampleD(dist, gw, gh, x + h, y), dxm = sampleD(dist, gw, gh, x - h, y);
  const dyp = sampleD(dist, gw, gh, x, y + h), dym = sampleD(dist, gw, gh, x, y - h);
  const dpp = sampleD(dist, gw, gh, x + h, y + h), dpm = sampleD(dist, gw, gh, x + h, y - h);
  const dmp = sampleD(dist, gw, gh, x - h, y + h), dmm = sampleD(dist, gw, gh, x - h, y - h);
  const a = dxp - 2 * d0 + dxm;
  const c = dyp - 2 * d0 + dym;
  const b = (dpp - dpm - dmp + dmm) / 4;
  const tr = (a + c) / 2;
  const det = Math.sqrt(Math.max(0, ((a - c) / 2) * ((a - c) / 2) + b * b));
  const lam = tr + det;                       // größerer Eigenwert
  let rx: number, ry: number;
  if (Math.abs(b) > 1e-7) { rx = lam - c; ry = b; }
  else { rx = a >= c ? 1 : 0; ry = a >= c ? 0 : 1; }
  const l = Math.hypot(rx, ry);
  if (l < 1e-7) return null;
  // tr - det: Krümmung quer zum Grat (am Grat ≈ -2, auf der Flanke ≈ 0)
  // tr + det: Krümmung entlang des Grates (am Grat ≈ 0, an einer Gabelung ≈ -2)
  return { rx: rx / l, ry: ry / l, lamA: (tr - det) * h, lamB: lam * h };
}

/**
 * Sucht den Rand auf einer Seite: dort, wo der Randabstand null wird.
 * Zwischen den letzten beiden Stützstellen wird linear interpoliert.
 */
function findEdge(dist: Float32Array, gw: number, gh: number, px: number, py: number, nx: number, ny: number, sgn: number): number | null {
  const d = sampleD(dist, gw, gh, px, py);
  // Der Rand sitzt bei ±d – dort fein suchen. Weiter draußen nur grob: an
  // Spitzen und Gabelungen liegt der Rand auf einer Seite deutlich weiter weg,
  // sonst findet die Suche ihn nicht, der Lauf driftet von der Mitte ab und
  // verliert den Grat (die Spitze der „1“ blieb dadurch weg).
  const from = Math.max(0, d - 1.5), fine = d + 2, to = d + Math.max(8, 3 * d);
  const coarse = Math.max(1.5, d / 12);
  let sPrev = 0, dPrev = d;
  for (let s = from; s <= to; s += s <= fine ? 0.5 : coarse) {
    const ds = sampleD(dist, gw, gh, px + nx * sgn * s, py + ny * sgn * s);
    if (ds <= 0.05) return sgn * s;
    if (ds <= 1) {
      // Nullstelle zwischen sPrev und s (der Abstand fällt mit Steigung ≈ -1)
      const t = dPrev - ds;
      return sgn * (t > 1e-6 ? sPrev + (s - sPrev) * (dPrev / t) : s);
    }
    sPrev = s; dPrev = ds;
  }
  return null;                      // Gabelung oder Ecke → keine Korrektur
}

/**
 * Setzt einen Punkt auf die Mitte des Querschnitts – genauer auf das Maximum
 * des Randabstands quer zur Laufrichtung. Die Mitte *zwischen* den beiden
 * Rändern ist nur bei einem Strich mit parallelen Flanken die Mitte: an einer
 * Ecke, in einer Spitze oder an einer Gabelung liegt das Maximum woanders, und
 * wer dorthin korrigiert, läuft vom Grat weg (die Spitze der „1“ blieb so weg).
 * Gesucht wird deshalb in einem Fenster von ±halber Breite, erst grob, dann
 * über eine Parabel durch die drei besten Stützstellen.
 */
function toCenter(dist: Float32Array, gw: number, gh: number, p: P, dx: number, dy: number): P | null {
  const d = sampleD(dist, gw, gh, p.x, p.y);
  if (d < DMIN) return null;
  const nx = -dy, ny = dx;
  const w = Math.max(3, 0.5 * d);
  const step = Math.max(0.75, w / 12);
  let bt = 0, bd = d;
  for (let t = -w; t <= w + 1e-9; t += step) {
    const v = sampleD(dist, gw, gh, p.x + nx * t, p.y + ny * t);
    if (v > bd) { bd = v; bt = t; }
  }
  if (bd <= d + 1e-6) return null;                    // sitzt schon auf dem Grat
  // Parabel durch die drei Stützstellen um das Maximum
  const dm = sampleD(dist, gw, gh, p.x + nx * (bt - step), p.y + ny * (bt - step));
  const dp = sampleD(dist, gw, gh, p.x + nx * (bt + step), p.y + ny * (bt + step));
  const den = dm - 2 * bd + dp;
  let off = bt;
  if (den < -1e-9) off = bt + (step / 2) * ((dm - dp) / den);
  if (Math.abs(off) > w || !Number.isFinite(off)) return null;
  return { x: p.x + nx * off, y: p.y + ny * off };
}

/**
 * Wie schief liegt der Querschnitt? 0 = der Punkt sitzt genau in der Mitte,
 * 1 = er liegt am Rand. Beim Verlängern bis ans Strichende wird darüber
 * geprüft, ob die Verlängerung noch auf der Mitte läuft: läuft ein Grat aus
 * (etwa in eine breite Fläche hinein), ist der Querschnitt plötzlich völlig
 * schief – dann darf nicht weiter verlängert werden, sonst entsteht eine Linie
 * dort, wo gar kein Strich ist.
 */
function offCenter(dist: Float32Array, gw: number, gh: number, p: P, dx: number, dy: number): number | null {
  const nx = -dy, ny = dx;
  const a = findEdge(dist, gw, gh, p.x, p.y, nx, ny, 1);
  const b = findEdge(dist, gw, gh, p.x, p.y, nx, ny, -1);
  if (a === null || b === null) return null;
  const w = a - b;
  if (w < 1e-6) return null;
  return Math.abs(a + b) / w;
}

/**
 * Läuft von Gratpunkten beidseitig den Grat ab. Ein Strich bleibt dabei ein
 * Strich, weil an Gabelungen (Trägheit der Richtung) geradeaus weiter gelaufen
 * wird; abgehende Äste werden später als eigener Pfad abgelaufen und enden an
 * der Kreuzung, sobald sie auf einen schon markierten Pfad treffen.
 */
function traceRidges(r: Raster, dist: Float32Array, verts: Vert[], u: number): P[][] {
  const { gw, gh } = r;
  const visited = new Uint8Array(gw * gh);
  // Radius in Pixeln: bei großen Schritten würden einzelne markierte Pixel
  // Lücken lassen, durch die ein späterer Pfad quer hindurchläuft.
  const rad = (step: number) => Math.max(1, Math.ceil(step / 2));
  const mark = (x: number, y: number, r = 1) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const xx = ix + i, yy = iy + j;
      if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) visited[yy * gw + xx] = 1;
    }
  };
  /**
   * Markiert den Fächer vor einem Pfadende. Der Grat läuft am Strichende
   * schräg in die Ecke; dieses Häkchen soll kein eigener Pfad werden.
   */
  const markFan = (x: number, y: number, dx: number, dy: number, len: number) => {
    const base = Math.atan2(dy, dx);
    const n = Math.ceil(len);
    for (let k = -3; k <= 3; k++) {
      const a = base + (k * 20 * Math.PI) / 180;
      const ux = Math.cos(a), uy = Math.sin(a);
      for (let s = 1; s <= n; s++) mark(x + ux * s, y + uy * s);
    }
  };
  const NB = [-gw - 1, -gw, -gw + 1, 1, gw + 1, gw, gw - 1, -1];
  /**
   * Ring-Erkennung. Ein Lauf driftet auf gebogenem Grat um ein paar Pixel je
   * Runde nach innen und trifft seinen Startpunkt deshalb nicht genau – er
   * dreht sonst eine zweite Runde und der Weg wird zu lang. Geprüft wird
   * deshalb, ob das Stück einem seiner *eigenen* früheren Punkte nahe kommt.
   * Dazu ein Raster mit Stempel: jeder Lauf hat seine eigene Nummer, das
   * Raster muss zwischen den Läufen nicht gelöscht werden.
   */
  const CELL = 8;
  const sw = Math.ceil(gw / CELL), sh = Math.ceil(gh / CELL);
  const selfHead = new Int32Array(sw * sh);
  const selfAt = new Int32Array(sw * sh);
  let stamp = 0;
  const own: P[] = [];
  const ownNext: number[] = [];      // verkettete Liste je Rasterzelle
  const isVisited = (x: number, y: number, r = 1) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const xx = ix + i, yy = iy + j;
      if (xx >= 0 && yy >= 0 && xx < gw && yy < gh && visited[yy * gw + xx] === 1) return true;
    }
    return false;
  };

  // Startpunkte: Gratpunkte, zuerst die breitesten Stellen (Mitte eines
  // Strichs), damit der Lauf nicht an einer Eckenspitze beginnt, von der aus
  // der Grat schräg in die Ecke läuft.
  type Seed = { p: P; rx: number; ry: number; d: number };
  const seedMin = Math.max(1, SEED_MIN_REL * u);
  // Abstand der Enden, ab dem ein Stück als geschlossen (Ring) gilt. Nach
  // oben durch die Schrittweite begrenzt (ein Ring schließt sich auf ~einen
  // Schritt), nach unten durch den Randabstand (sonst wären bei grobem Raster
  // zwei beliebige Enden schon „geschlossen“).
  const closeEps = Math.max(2.5, Math.min(2 * STEP_MAX, CLOSE_EPS * u));
  const peaks: Seed[] = [];
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const i = y * gw + x;
      const cx = x + 0.5, cy = y + 0.5;
      const d = dist[i];
      if (d < DMIN) continue;
      if (d < seedMin) continue;
      const rd = ridgeDir(dist, gw, gh, cx, cy);
      if (!rd || rd.lamA > SEED_RIDGE) continue;           // kein echter Grat
      let isMax = true;
      for (let k = 0; k < 8; k++) if (dist[i + NB[k]] > d + 1e-6) { isMax = false; break; }
      if (isMax) peaks.push({ p: { x: cx, y: cy }, rx: rd.rx, ry: rd.ry, d });
    }
  }
  /**
   * Startpunkte entdoppeln: auf einem flachen Grat ist sonst (wegen der
   * Rasterung) alle paar Pixel ein eigener Startpunkt. Bei feinem Raster
   * entsprechend öfter – das Ergebnis hinge an der Rasterweite.
   */
  // Breiteste Stelle zuerst: dort sitzt die Gabelung, von der aus der Strich
  // in einem Zug in beide Richtungen abgelaufen wird – und beim Entdoppeln
  // gewinnt die breitere Stelle.
  peaks.sort((a, b) => b.d - a.d);
  const taken = new Uint8Array(gw * gh);
  const seeds: Seed[] = [];
  for (const s of peaks) {
    const gx = Math.floor(s.p.x), gy = Math.floor(s.p.y);
    if (taken[gy * gw + gx]) continue;
    const r = Math.min(40, SEED_GAP * s.d);
    const ri = Math.ceil(r);
    for (let j = -ri; j <= ri; j++) for (let i = -ri; i <= ri; i++) {
      const xx = gx + i, yy = gy + j;
      if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
      if (i * i + j * j <= r * r) taken[yy * gw + xx] = 1;
    }
    seeds.push(s);
  }

  /**
   * Verlängert einen Lauf geradeaus bis kurz vor den Rand. Das Skelett biegt
   * am Strichende in die Ecken ab und endet dadurch schon eine halbe Strich-
   * breite vor dem Ende – für die Gravur soll die Linie aber bis ans Ende laufen.
   * Die Richtung ist die Sehne über die letzten Schritte, denn die Gratrichtung
   * zeigt an der Schulter schon in die Ecke. War der Lauf sehr kurz (Start dicht
   * an der Schulter), wird er verworfen und ab dem Startpunkt verlängert.
   * Zurück kommt die Schulter – von dort wird der Fächer markiert.
   */
  const extend = (start: P, pts: P[], dirX: number, dirY: number): P => {
    let dx = dirX, dy = dirY;
    let shoulder: P = pts.length ? pts[pts.length - 1] : start;
    if (pts.length < 4) { pts.length = 0; shoulder = start; }
    const dEnd = sampleD(dist, gw, gh, shoulder.x, shoulder.y);
    const step = Math.min(1.5, Math.max(0.35, STEP_EXT * dEnd));
    // Fenster für die Richtung: ein ganzer Schenkel (1,2·d), nicht nur die
    // letzten paar Punkte – sonst nimmt sie an einem gerade gekappten Häkchen
    // dessen Richtung an und läuft wieder in die Ecke zurück.
    const back = Math.min(pts.length - 1, Math.max(EXT_WIN, Math.round(1.2 * dEnd / step)));
    if (back >= 3) {
      const a = pts[pts.length - 1 - back], b = pts[pts.length - 1];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l > 1e-6) { dx = (b.x - a.x) / l; dy = (b.y - a.y) / l; }
    }
    const maxLen = Math.max(2, dEnd * 1.3 + 1.5);
    let px = shoulder.x, py = shoulder.y, len = 0;
    while (len < maxLen) {
      const nx = px + dx * step, ny = py + dy * step;
      if (sampleD(dist, gw, gh, nx, ny) < 1) break;        // Rand erreicht
      // nur verlängern, solange die Mitte noch in der Mitte ist
      const off = offCenter(dist, gw, gh, { x: nx, y: ny }, dx, dy);
      if (off === null || off > OFF_CENTER) break;
      px = nx; py = ny; len += step;
      pts.push({ x: px, y: py });
    }
    return shoulder;
  };

  /**
   * Läuft von p0 in Richtung (dx0,dy0), bis der Grat endet. `shoulder` ist der
   * Punkt, an dem die Verlängerung zum Strichende ansetzt.
   */
  const march = (p0: P, dx0: number, dy0: number): { pts: P[]; loop: boolean; endStop: boolean; shoulder: P } => {
    const pts: P[] = [];
    let px = p0.x, py = p0.y;
    let ux = dx0, uy = dy0;            // Laufrichtung (wird mit Trägheit nachgeführt)
    let travelled = 0;
    let loop = false;
    let endStop = false;
    let flat = 0;                      // Schritte ohne Grat hintereinander
    const win = new Float64Array(WIN_STEPS); // letzte Randabstände → lokales Maß
    let wi = 0, filled = 0;
    let dRef = 0;                           // größter Randabstand im Fenster
    let below = 0;                          // Schritte unter dem Maß
    let step = STEP_MIN;                    // Schrittweite, aus dem örtlichen Randabstand
    own.length = 0;
    ownNext.length = 0;
    own.push({ x: p0.x, y: p0.y });
    ownNext.push(-1);
    const mine = ++stamp;
    for (let n = 0; n < 200000; n++) {
      const rd = ridgeDir(dist, gw, gh, px, py);
      // Zwei Fälle, in denen die Gratrichtung nicht taugt:
      //  · Gipfel (lamB stark negativ): an einer Gabelung ist der Randabstand
      //    in *jeder* Richtung ein Maximum, der Eigenvektor zeigt deshalb auf
      //    einen der abgehenden Äste. Geradeaus weiter – der Ast wird später
      //    als eigener Pfad abgelaufen.
      //  · Plateau (lamA ≈ 0): der Lauf ist neben den Grat geraten (Strich-
      //    ende, auslaufender Grat). Kurz geradeaus weiter, dann abbrechen.
      if (rd && rd.lamA < RIDGE_MIN) {
        flat = 0;
        if (rd.lamB > PEAK_MAX) {
          let vx = rd.rx, vy = rd.ry;
          if (vx * ux + vy * uy < 0) { vx = -vx; vy = -vy; }
          // Trägheit: an Gabelungen geradeaus weiterlaufen
          ux = ux * INERTIA + vx * (1 - INERTIA);
          uy = uy * INERTIA + vy * (1 - INERTIA);
          const l = Math.hypot(ux, uy) || 1;
          ux /= l; uy /= l;
        }
      } else if (++flat > PLATEAU) {
        // Der Grat ist ausgelaufen (der Lauf ist neben die Mitte geraten, etwa
        // am Ende eines Strichs oder in eine breite Fläche hinein). Die
        // Verlängerung danach prüft selbst, ob sie noch auf der Mitte sitzt.
        endStop = true;
        break;
      }
      // Schrittweite am örtlichen Randabstand: bei feinem Raster ist d groß,
      // bei grobem klein – so bleibt der Lauf in beiden Fällen derselbe.
      step = Math.min(STEP_MAX, Math.max(STEP_MIN, STEP_REL * sampleD(dist, gw, gh, px, py)));
      let nx = px + ux * step, ny = py + uy * step;
      // Der Querschnitt für die Korrektur auf die Mitte steht quer zur
      // *Gratrichtung*, nicht quer zur Laufrichtung: die hinkt mit Trägheit
      // hinterher, der Querschnitt kippt dadurch, und auf einem gebogenen
      // Grat zieht das den Lauf bei jedem Schritt ein Stück nach innen – der
      // Ring wird zur Spirale und schließt sich nicht mehr.
      let qx = ux, qy = uy;
      if (rd && rd.lamA < RIDGE_MIN) { qx = rd.rx; qy = rd.ry; }
      if (qx * ux + qy * uy < 0) { qx = -qx; qy = -qy; }
      const c = toCenter(dist, gw, gh, { x: nx, y: ny }, qx, qy);
      if (c) { nx = c.x; ny = c.y; }
      const d = sampleD(dist, gw, gh, nx, ny);
      // Bezug: größter Randabstand der letzten Schritte – ein kurzes Dippen
      // (Rasterrauheit, Gabelung) bricht den Lauf nicht ab, ein echtes
      // Strichende (ständig fallender Abstand) schon
      win[wi] = d; wi = (wi + 1) % WIN_STEPS; if (filled < WIN_STEPS) filled++;
      dRef = 0;
      for (let k = 0; k < filled; k++) if (win[k] > dRef) dRef = win[k];
      if (d < DMIN) { endStop = true; break; }
      // relativ: ein Strich darf auch ein Stück dünner werden (Verjüngung,
      // Übergang in eine Ecke), ohne dass der Lauf abbricht. Nur ein echtes
      // Ende – der Randabstand fällt auf einen Bruchteil – beendet ihn.
      if (d < Math.max(DMIN * 1.5, dRef * (1 - TAPER))) {
        if (++below >= PERSIST) { for (let k = 0; k < PERSIST - 1; k++) pts.pop(); endStop = true; break; }
      } else below = 0;
      if (isVisited(nx, ny, rad(step))) break;                         // trifft früheren Pfad
      // Kommt das Stück einem eigenen früheren Punkt nahe, ist der Strich ein
      // Ring – dann ist der Weg fertig.
      if (travelled > LOOP_STEPS * step) {
        const ci = Math.floor(nx / CELL), cj = Math.floor(ny / CELL);
        for (let j = -1; j <= 1 && !loop; j++) {
          for (let i = -1; i <= 1; i++) {
            const xx = ci + i, yy = cj + j;
            if (xx < 0 || yy < 0 || xx >= sw || yy >= sh) continue;
            const k = yy * sw + xx;
            if (selfAt[k] !== mine) continue;
            for (let idx = selfHead[k]; idx >= 0; idx = ownNext[idx]) {
              if (idx > own.length - LOOP_STEPS) continue;
              const o = own[idx];
              if (Math.hypot(o.x - nx, o.y - ny) < closeEps) { loop = true; break; }
            }
            if (loop) break;
          }
        }
        if (loop) break;
      }
      pts.push({ x: nx, y: ny });
      own.push({ x: nx, y: ny });
      {
        const k = Math.floor(ny / CELL) * sw + Math.floor(nx / CELL);
        if (k >= 0 && k < sw * sh) {
          if (selfAt[k] !== mine) { selfHead[k] = -1; selfAt[k] = mine; }
          ownNext.push(selfHead[k]);
          selfHead[k] = own.length - 1;
        } else ownNext.push(-1);
      }
      travelled += step;
      px = nx; py = ny;
    }
    const shoulder = endStop && !loop ? extend(p0, pts, dx0, dy0) : (pts.length ? pts[pts.length - 1] : p0);
    return { pts, loop, endStop, shoulder };
  };

  const paths: P[][] = [];
  for (const seed of seeds) {
    if (isVisited(seed.p.x, seed.p.y)) continue;
    if (seed.d < seedMin) continue;
    const c0 = toCenter(dist, gw, gh, seed.p, seed.rx, seed.ry);
    const p0 = c0 ?? seed.p;
    const fwd = march(p0, seed.rx, seed.ry);
    // Startrichtung für den Rücklauf aus dem Hinlauf: die Gratrichtung am
    // Startpunkt zeigt mitunter schon in eine Ecke (Start dicht am Strichrand)
    let bx = -seed.rx, by = -seed.ry;
    if (fwd.pts.length >= 4) {
      const a = fwd.pts[Math.min(3, fwd.pts.length - 1)];
      const b = fwd.pts[Math.min(13, fwd.pts.length - 1)];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l > 1e-6) { bx = -(b.x - a.x) / l; by = -(b.y - a.y) / l; }
    }
    const pts: P[] = [];
    let bwdStop = false;
    let bwdShoulder: P = p0, fwdShoulder: P = fwd.shoulder;
    if (fwd.loop) {
      pts.push(p0, ...fwd.pts);
      fwdShoulder = fwd.shoulder;
    } else {
      const back = march(p0, bx, by);
      bwdStop = back.endStop;
      bwdShoulder = back.shoulder;
      for (let i = back.pts.length - 1; i >= 0; i--) pts.push(back.pts[i]);
      pts.push(p0);
      for (const q of fwd.pts) pts.push(q);
    }
    if (pts.length < 5) continue;              // Reste von Eckenspitzen verwerfen
    // zu kurze Stückchen an Gabelungen verwerfen: kürzer als die halbe Breite
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const ds: number[] = pts.map((p) => sampleD(dist, gw, gh, p.x, p.y)).sort((a, b) => a - b);
    const dMed = ds[Math.floor(ds.length / 2)];
    const dMid = sampleD(dist, gw, gh, pts[Math.floor(pts.length / 2)].x, pts[Math.floor(pts.length / 2)].y);
    if (len < STUB * 2 * dMid) continue;
    if (dMed < Math.max(1.1, SLIVER_REL * u)) continue;   // Streifen entlang des Rands (Eckenhäkchen)
    for (const p of pts) mark(p.x, p.y);
    // Ecken-Häkchen nur dort wegmarkieren, wo der Lauf wirklich am Strichende
    // endete – an Gabelungen darf der Nachbarpfad weiterlaufen. Der Fächer
    // sitzt an der Schulter, damit er auch die Grate abdeckt, die von dort in
    // die Ecken laufen.
    const ends: [P, P, boolean][] = [
      [bwdShoulder, pts[0], bwdStop && !fwd.loop],
      [fwdShoulder, pts[pts.length - 1], fwd.endStop],
    ];
    for (const [a, tip, stop] of ends) {
      if (!stop) continue;
      let dx = tip.x - a.x, dy = tip.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const d = sampleD(dist, gw, gh, a.x, a.y);
      markFan(a.x, a.y, dx, dy, Math.min(16, Math.max(4, d * 1.2 + 2)));
    }
    paths.push(pts);
  }
  return dropStubs(
    dropDuplicates(
      linkPaths(pruneHooks(paths, verts, dist, gw, gh, closeEps), dist, gw, gh, closeEps, u),
      dist, gw, gh,
    ),
    dist, gw, gh,
  );
}

/** Reststücke verwerfen: kürzer als ein paar Schrittweiten und ohne eigenen Nutzen. */
function dropStubs(paths: P[][], dist: Float32Array, gw: number, gh: number): P[][] {
  const out: P[][] = [];
  for (const pts of paths) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const ds: number[] = pts.map((p) => sampleD(dist, gw, gh, p.x, p.y)).sort((a, b) => a - b);
    const dMed = ds[Math.floor(ds.length / 2)];
    if (len >= Math.max(8, 2.5 * dMed)) out.push(pts);
  }
  return out;
}

/**
 * Ecken einer Region, an denen ein Häkchen entstehen kann, in Rasterkoordinaten.
 * `k` ist der Abstand von der Ecke zum Grat, gemessen am Randabstand auf der
 * Winkelhalbierenden: bei einer 90°-Ecke 1/sin(45°) ≈ 1,41. Ecken, an denen kein
 * Häkchen entsteht, kommen gar nicht erst in die Liste (innen liegende Ecken,
 * Spitzen, fast gerade Kanten – bei abgeflachten Kurven sitzt sonst an jedem
 * Stützpunkt eine „Ecke“ und der ganze Strich würde gekappt).
 */
type Vert = { x: number; y: number; k: number };

function cornerVerts(cs: Contour[], r: Raster): Vert[] {
  const out: Vert[] = [];
  for (const c of cs) {
    const pts = c.pts;
    const n = pts.length;
    if (n < 3) continue;
    let sa = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) sa += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    const sign = sa >= 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      const e1x = p.x - a.x, e1y = p.y - a.y;
      const e2x = b.x - p.x, e2y = b.y - p.y;
      const cross = e1x * e2y - e1y * e2x;
      if (cross * sign <= 0) continue;                    // nach innen gewölbt → kein Häkchen
      const la = Math.hypot(e1x, e1y), lb = Math.hypot(e2x, e2y);
      if (la < 1e-9 || lb < 1e-9) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (e1x * e2x + e1y * e2y) / (la * lb))));
      if (ang < CORNER_MIN || ang > CORNER_MAX) continue;  // Spitze oder fast gerade
      out.push({ x: (p.x - r.ox) / r.res, y: (p.y - r.oy) / r.res, k: CORNER_TOL / Math.sin(ang / 2) });
    }
  }
  return out;
}

/**
 * Klemmt die Ecken: die mediale Achse läuft an einer Ecke zwangsläufig im Bogen
 * (Radius in der Größe der halben Strichbreite). Wo beide Schenkel gerade sind,
 * werden sie bis zu ihrem Schnitt verlängert – dann sitzt die Ecke dort, wo sie
 * im Modell sitzt, statt auf einem Bogen davor.
 * Alles, was nicht eindeutig gerade ist (Bögen, Gabelungen), bleibt unberührt.
 */
function miter(pts: P[], dist: Float32Array, gw: number, gh: number): P[] {
  let cur = pts;
  for (let k = 0; k < MITER_MAX; k++) {
    const next = oneMiter(cur, dist, gw, gh);
    if (!next) break;
    cur = next;
  }
  return cur;
}

function oneMiter(pts: P[], dist: Float32Array, gw: number, gh: number): P[] | null {
  const n = pts.length;
  if (n < 14) return null;
  const dMid = sampleD(dist, gw, gh, pts[Math.floor(n / 2)].x, pts[Math.floor(n / 2)].y);
  const W = Math.min(Math.max(Math.round(dMid * 1.2), 6), Math.floor(n / 3));
  // schärfste Richtungsänderung über das Fenster
  let best = -1, bestTurn = 0;
  for (let i = W; i < n - W; i++) {
    const ax = pts[i].x - pts[i - W].x, ay = pts[i].y - pts[i - W].y;
    const bx = pts[i + W].x - pts[i].x, by = pts[i + W].y - pts[i].y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) continue;
    const c = (ax * bx + ay * by) / (la * lb);
    const turn = Math.acos(Math.max(-1, Math.min(1, c)));
    if (turn > bestTurn) { bestTurn = turn; best = i; }
  }
  if (best < 0 || bestTurn < MITER_TURN) return null;
  // Bei einem geschlossenen Stück liegt die Ecke unter Umständen am Anfang –
  // dann wird das Stück so gedreht, dass sie in der Mitte sitzt, und am Ende
  // wieder zurück.
  const closed = Math.hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y) < 3;
  const off = closed ? (((best - Math.floor(n / 2)) % n) + n) % n : 0;
  const q = off ? [...pts.slice(off), ...pts.slice(0, off)] : pts;
  const i = (((best - off) % n) + n) % n;
  const d = sampleD(dist, gw, gh, q[i].x, q[i].y);
  const L = Math.min(Math.max(Math.round(d * 3), 10), 80);   // Schenkel
  const M = Math.min(Math.max(Math.round(d * 1.3), 4), 30);  // Bogen aussparen
  const a0 = i - L, a1 = i - M, b0 = i + M, b1 = i + L;
  if (a0 < 0 || b1 > n - 1 || a1 - a0 < 3 || b1 - b0 < 3) return null;
  const la = fitLine(q, a0, a1), lb = fitLine(q, b0, b1);
  const tol = Math.max(0.8, 0.05 * d);
  if (!la || !lb || la.rms > tol || lb.rms > tol) return null;   // Schenkel nicht gerade
  const den = la.dx * lb.dy - la.dy * lb.dx;
  if (Math.abs(den) < 0.15) return null;
  const t = ((lb.px - la.px) * lb.dy - (lb.py - la.py) * lb.dx) / den;
  const x = { x: la.px + t * la.dx, y: la.py + t * la.dy };
  if (Math.hypot(x.x - q[i].x, x.y - q[i].y) > Math.max(2 * d, 4)) return null;
  if (sampleD(dist, gw, gh, x.x, x.y) < 1) return null;          // Schnitt liegt im Leeren
  const res = [...q.slice(0, a0 + 1), x, ...q.slice(b1)];
  return off ? [...res.slice(res.length - off), ...res.slice(0, res.length - off)] : res;
}

/** Ausgleichsgerade durch die Punkte a..b (Hauptachse); `rms` = mittlerer Abstand davon. */
function fitLine(pts: P[], a: number, b: number): { px: number; py: number; dx: number; dy: number; rms: number } | null {
  let sx = 0, sy = 0, m = 0;
  for (let i = a; i <= b; i++) { sx += pts[i].x; sy += pts[i].y; m++; }
  const cx = sx / m, cy = sy / m;
  let xx = 0, xy = 0, yy = 0;
  for (let i = a; i <= b; i++) { const u = pts[i].x - cx, v = pts[i].y - cy; xx += u * u; xy += u * v; yy += v * v; }
  if (xx + yy < 1e-9) return null;
  const ang = 0.5 * Math.atan2(2 * xy, xx - yy);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let sum = 0;
  for (let i = a; i <= b; i++) { const u = pts[i].x - cx, v = pts[i].y - cy; const t = u * dy - v * dx; sum += t * t; }
  return { px: cx, py: cy, dx, dy, rms: Math.sqrt(sum / m) };
}

/** Verlängert ein Stück geradeaus bis kurz vor den Rand – gleiche Regeln wie beim Lauf. */
function prolong(pts: P[], dist: Float32Array, gw: number, gh: number) {
  const n = pts.length;
  if (n < 4) return;
  // Die Richtung wird über einen ganzen Schenkel gemessen, nicht nur über die
  // letzten paar Punkte: sonst nimmt sie die Richtung des gerade gekappten
  // Häkchens an und läuft genau wieder in die Ecke zurück.
  const dEnd = sampleD(dist, gw, gh, pts[n - 1].x, pts[n - 1].y);
  const a = pts[Math.max(0, n - 1 - Math.min(n - 1, Math.max(EXT_WIN, Math.round(1.2 * dEnd))))], b = pts[n - 1];
  let dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-6) return;
  dx /= l; dy /= l;
  const step = Math.min(1.5, Math.max(0.35, STEP_EXT * dEnd));
  const maxLen = Math.max(2, dEnd * 1.3 + 1.5);
  let px = b.x, py = b.y, len = 0;
  while (len < maxLen) {
    const nx = px + dx * step, ny = py + dy * step;
    if (sampleD(dist, gw, gh, nx, ny) < 1) break;                    // Rand erreicht
    const off = offCenter(dist, gw, gh, { x: nx, y: ny }, dx, dy);
    if (off === null || off > OFF_CENTER) break;                      // nicht mehr auf der Mitte
    px = nx; py = ny; len += step;
    pts.push({ x: px, y: py });
  }
}

/**
 * Schneidet die Enden ab, die in eine Ecke laufen. Die mediale Achse hat an
 * jeder Ecke einen Ast, der auf der Winkelhalbierenden in die Ecke zeigt: beim
 * Fräsen ein Häkchen, das Material wegnimmt, wo keins weg soll. Erkennung:
 * auf so einem Ast ist die nächstgelegene Ecke nur etwa 1,4·d entfernt (bei
 * einer 90°-Ecke ist der Randabstand d = 0,707·Abstand zur Ecke). Auf der Mitte
 * eines Strichs ist die nächste Ecke um ein Vielfaches von d entfernt, und an
 * einer Spitze ist sie es erst recht – Spitzen bleiben deshalb stehen.
 * Die Kürzung läuft von den Enden her nach innen und stoppt, sobald der Punkt
 * wieder „auf der Mitte“ liegt; Reststücke, die nur aus einem Häkchen
 * bestanden, fallen ganz weg.
 */
function pruneHooks(paths: P[][], verts: Vert[], dist: Float32Array, gw: number, gh: number, closeEps: number): P[][] {
  if (!verts.length) return paths;
  const atCorner = (p: P): boolean => {
    const d = sampleD(dist, gw, gh, p.x, p.y);
    if (!(d > 0.25)) return true;
    for (const v of verts) {
      const gx = v.x - p.x, gy = v.y - p.y;
      if (gx * gx + gy * gy < (v.k * d) * (v.k * d)) return true;
    }
    return false;
  };
  const out: P[][] = [];
  for (const pts of paths) {
    // geschlossener Ring: hat keine Enden, also auch keine Häkchen
    if (Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < closeEps) { out.push(pts); continue; }
    let a = 0, b = pts.length - 1;
    while (a < b && atCorner(pts[a])) a++;
    while (b > a && atCorner(pts[b])) b--;
    if (b - a < 2) continue;
    const s = pts.slice(a, b + 1);
    // Gekappte Enden wieder geradeaus bis an den Rand verlängern: der Strich
    // soll am Ende ankommen – nur eben ohne Häkchen in die Ecke.
    if (a > 0) { s.reverse(); prolong(s, dist, gw, gh); s.reverse(); }
    if (b < pts.length - 1) prolong(s, dist, gw, gh);
    let len = 0;
    for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    const dMid = sampleD(dist, gw, gh, s[Math.floor(s.length / 2)].x, s[Math.floor(s.length / 2)].y);
    if (len < Math.min(1.5 * dMid, Math.max(3, dMid))) continue;      // nur ein Häkchen
    out.push(s);
  }
  return out;
}

/**
 * Wenige Züge eines 3-Punkt-Glätters: dämpft das Zittern der Gratrichtung.
 * Ecken bleiben dabei Ecken – die Stärke der Glättung wird zurückgenommen,
 * wo sich die Richtung vor und hinter einem Punkt stark ändert (Knick an
 * einer Gabelung oder Kante). Sonst wird aus einer Ecke ein Bogen.
 */
function smooth(pts: P[], iter: number): P[] {
  let cur = pts;
  for (let k = 0; k < iter; k++) {
    if (cur.length < 3) return cur;
    const next: P[] = [cur[0]];
    for (let i = 1; i < cur.length - 1; i++) {
      let w = 0.25;
      const a = cur[Math.max(0, i - 4)], b = cur[Math.min(cur.length - 1, i + 4)];
      const ux = cur[i].x - a.x, uy = cur[i].y - a.y;
      const vx = b.x - cur[i].x, vy = b.y - cur[i].y;
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu > 1e-9 && lv > 1e-9) {
        const c = (ux * vx + uy * vy) / (lu * lv);
        const turn = Math.acos(Math.max(-1, Math.min(1, c)));        // Knick im Bogenmaß
        w = 0.25 * Math.max(0, Math.min(1, (SMOOTH_MAX - turn) / SMOOTH_FADE));
      }
      next.push({
        x: w * cur[i - 1].x + (1 - 2 * w) * cur[i].x + w * cur[i + 1].x,
        y: w * cur[i - 1].y + (1 - 2 * w) * cur[i].y + w * cur[i + 1].y,
      });
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/**
 * Verwirft Stücke, die fast ganz auf einem anderen Stück liegen. Der Grat
 * springt an Gabelungen (etwa wo ein Balken an einen anderen stößt) leicht zur
 * Seite; dabei entsteht neben der geraden Mittellinie ein zweites, kaum
 * versetztes Stück. Es würde nur ein zweites Mal über dieselbe Stelle fahren.
 */
function dropDuplicates(paths: P[][], dist: Float32Array, gw: number, gh: number): P[][] {
  if (paths.length < 2) return paths;
  let total = 0;
  for (const p of paths) total += p.length;
  if (total > 60000) return paths;                        // zu viel für den Vergleich
  const lenOf = (p: P[]) => {
    let l = 0;
    for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    return l;
  };
  const box = (p: P[]) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const q of p) { if (q.x < a) a = q.x; if (q.x > c) c = q.x; if (q.y < b) b = q.y; if (q.y > d) d = q.y; }
    return { a, b, c, d };
  };
  const order = paths.map((_, i) => i).sort((i, j) => lenOf(paths[j]) - lenOf(paths[i]));
  const boxes = paths.map(box);
  const kept: P[][] = [];
  const keptBox: { a: number; b: number; c: number; d: number }[] = [];
  for (const i of order) {
    const A = paths[i], ba = boxes[i];
    const step = Math.max(1, Math.floor(A.length / 14));
    let n = 0, covered = 0;
    for (let k = 0; k < A.length; k += step) {
      const p = A[k]; n++;
      const tol = Math.max(2, 0.35 * sampleD(dist, gw, gh, p.x, p.y));
      let best = Infinity;
      for (let m = 0; m < kept.length; m++) {
        const bb = keptBox[m];
        if (p.x < bb.a - tol || p.x > bb.c + tol || p.y < bb.b - tol || p.y > bb.d + tol) continue;
        const B = kept[m];
        for (let q = 0; q < B.length; q += 2) {
          const g = Math.hypot(B[q].x - p.x, B[q].y - p.y);
          if (g < best) best = g;
        }
      }
      if (best <= tol) covered++;
    }
    if (n > 0 && covered / n >= 0.65) continue;            // liegt auf einem anderen Stück
    kept.push(A); keptBox.push(ba);
  }
  return kept;
}

/**
 * Verbindet Pfade, die an einer Gabelung auseinandergefallen sind, wieder zu
 * einem Stück. Der Grat springt an Gabelungen etwas zur Seite, deshalb darf
 * die Verbindung auch ein kleines Stück vor dem Ende des Nachbarn ansetzen
 * (TRIM) – nie aber mitten hinein, sonst zerfällt der Nachbar in zwei Teile.
 * Die Verbindung muss immer im Bauteil liegen.
 */
function linkPaths(paths: P[][], dist: Float32Array, gw: number, gh: number, closeEps: number, u: number): P[][] {
  if (paths.length < 2) return paths;
  const TRIM = 10;                   // Punkte, die am Nachbarn abgeschnitten werden dürfen
  const inside = (a: P, b: P): boolean => {
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      if (sampleD(dist, gw, gh, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) < 1) return false;
    }
    return true;
  };
  const dir = (a: P, b: P): [number, number] => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return [(b.x - a.x) / l, (b.y - a.y) / l];
  };
  const isRing = (pts: P[]) => Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < closeEps;
  const scale = Math.max(3, 0.4 * u);        // ab dieser Lücke muss die Verbindung gerade weiterlaufen
  /**
   * Schnittpunkt der beiden Schenkel: an einer Ecke fehlt der Bogen der Achse
   * oft ganz (dort sitzt kein Maximum der Breite, an dem ein Lauf beginnen
   * könnte). Ohne diesen Punkt würde die Verbindung als Sehne quer durch die
   * Ecke laufen statt um sie herum.
   */
  const cornerAt = (a: P, u: [number, number], b: P, v: [number, number]): P | null => {
    const wx = -v[0], wy = -v[1];                     // rückwärts in B hinein
    const den = u[0] * wy - u[1] * wx;
    if (Math.abs(den) < 0.3) return null;             // fast parallel
    const t = ((b.x - a.x) * wy - (b.y - a.y) * wx) / den;
    if (t <= 0) return null;
    const x = { x: a.x + t * u[0], y: a.y + t * u[1] };
    if ((b.x - x.x) * v[0] + (b.y - x.y) * v[1] <= 0) return null;
    if (sampleD(dist, gw, gh, x.x, x.y) >= 1) return x;
    // Der Schnitt liegt knapp außerhalb (ganz spitze Ecke, dort treffen sich
    // die Schenkel erst hinter der Spitze). Dann wird er auf der Winkel-
    // halbierenden zurückgezogen, bis er im Material sitzt.
    let vx = (a.x + b.x) / 2 - x.x, vy = (a.y + b.y) / 2 - x.y;
    const l = Math.hypot(vx, vy);
    if (l < 1e-6) return null;
    vx /= l; vy /= l;
    for (let s = 0.5; s <= l; s += 0.5) {
      const q = { x: x.x + vx * s, y: x.y + vy * s };
      if (sampleD(dist, gw, gh, q.x, q.y) >= 1.5) return q;
    }
    return null;
  };

  let cur = paths;
  for (let round = 0; round < cur.length + 8; round++) {
    let best: { i: number; j: number; score: number; flipI: boolean; flipJ: boolean; via: P | null } | null = null;
    for (let i = 0; i < cur.length; i++) {
      for (let j = 0; j < cur.length; j++) {
        if (i === j) continue;
        const A = cur[i], B = cur[j];
        if (A.length < 2 || B.length < 2) continue;
        if (isRing(A)) continue;                       // Ring: hat kein offenes Ende
        for (const flipI of [false, true]) {
          const a = flipI ? A[0] : A[A.length - 1];
          const u = flipI ? dir(A[1], A[0]) : dir(A[A.length - 2], A[A.length - 1]);
          const d = sampleD(dist, gw, gh, a.x, a.y);
          const lim = Math.max(3, 1.5 * d);
          // Anschluss am Anfang oder am Ende von B – der nächste Punkt entscheidet
          for (const flipJ of [false, true]) {
            const b = flipJ ? B[B.length - 1] : B[0];
            const gap = Math.hypot(b.x - a.x, b.y - a.y);
            if (gap > lim * 4) continue;               // völlig auseinander
            const nah = gap <= lim;
            // „in der Mitte“ ansetzen wäre erlaubt, zerteilt B aber – nur am Rand erlaubt
            let near = 0;
            for (let k = 0; k < B.length; k++) {
              const g = Math.hypot(B[k].x - a.x, B[k].y - a.y);
              if (g < gap) near++;
            }
            if (near > TRIM) continue;
            const v = flipJ ? dir(B[B.length - 1], B[Math.max(0, B.length - 6)]) : dir(B[0], B[Math.min(B.length - 1, 5)]);
            const al = u[0] * v[0] + u[1] * v[1];
            // Erst versuchen, die beiden Schenkel bis zu ihrem Schnitt zu
            // verlängern (Ecke). Das greift nur, wenn der Schnitt nah genug
            // liegt – bei einem Bogen liegt er weit draußen, dort bleibt es
            // bei der einfachen Verbindung. An einer Ecke zeigen die beiden
            // Richtungen gegeneinander; die Regel „kein Rückwärtsgang“ darf
            // dann nicht gelten, sonst bleibt die Ecke offen.
            let via: P | null = null;
            if (gap > scale) {
              const x = cornerAt(a, u, b, v);
              if (x) {
                const la = Math.hypot(x.x - a.x, x.y - a.y), lb2 = Math.hypot(x.x - b.x, x.y - b.y);
                if (la + lb2 <= CORNER_LINK * gap && la <= lim * 2.5 && lb2 <= lim * 2.5 &&
                    inside(a, x) && inside(x, b)) via = x;
              }
            }
            if (!via) {
              if (!nah) continue;                      // zu weit für eine direkte Verbindung
              if (al < -0.2) continue;                 // kein Rückwärtsgang
              if (gap > scale) {                       // längere Verbindung muss gerade weiterlaufen
                const c = dir(a, b);
                if (u[0] * c[0] + u[1] * c[1] < 0.2 || c[0] * v[0] + c[1] * v[1] < 0.2) continue;
              }
              if (!inside(a, b)) continue;
            }
            const score = (via ? 1.1 * (Math.hypot(via.x - a.x, via.y - a.y) + Math.hypot(via.x - b.x, via.y - b.y)) : gap) /
              Math.max(0.25, al);
            if (!best || score < best.score) best = { i, j, score, flipI, flipJ, via };
          }
        }
      }
    }
    if (!best) break;
    const A = best.flipI ? cur[best.i].slice().reverse() : cur[best.i];
    const B = best.flipJ ? cur[best.j].slice().reverse() : cur[best.j];
    const merged = best.via ? A.concat([best.via], B) : A.concat(B);
    const next: P[][] = [];
    for (let i = 0; i < cur.length; i++) if (i !== best.i && i !== best.j) next.push(cur[i]);
    next.push(merged);
    cur = next;
  }
  return cur;
}
