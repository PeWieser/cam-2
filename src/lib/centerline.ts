import type { Contour, Vec2 } from '../types';
import { simplify } from './geometry';

/**
 * Mittellinien-Berechnung (Gravur entlang der Mitte von Strichen/Stegen).
 *
 * Der naive Weg (Füllung rastern → Zhang-Suen → Pixel ablaufen) hat zwei
 * Artefakte, die man im G-Code sieht:
 *   · Das Skelett ist eine Raster-Treppe mit seitlichen Zacken; bei schrägen
 *     Strichen weicht die „Mitte“ dadurch um ein Mehrfaches der Pixelgröße ab.
 *   · Der Ablauf startet an jedem Grad-1-Pixel, ein einziger Strich zerfällt
 *     dadurch in dutzende Stücke → wackelige Linie und ein Abheben je Stück.
 *
 * Die Pipeline hier vermeidet beides:
 *   1. Gruppieren – Konturen mit überlappender Bounding-Box kommen gemeinsam
 *                   in ein Raster; dadurch bleibt die Auflösung auch bei
 *                   vielen kleinen Zeichen hoch
 *   2. Rastern    – even-odd Scanline, Auflösung aus der geschätzten Strich-
 *                   breite (mindestens ~8 Pixel über die Breite)
 *   3. EDT        – exakte euklidische Distanztransformation: Abstand jedes
 *                   Pixels zum Rand, subpixel-genau auswertbar
 *   4. Grat       – Startpunkte sind lokale Maxima im Randabstand; die Rich-
 *                   tung kommt aus der Hesse-Matrix (Eigenvektor zum größeren
 *                   Eigenwert). Von dort wird beidseitig entlang des Grates
 *                   gelaufen (Schritt 0,7 px) und jeder Punkt über den lokalen
 *                   Querschnitt exakt auf die Mitte gesetzt. Das Ergebnis ist
 *                   glatt, subpixel-genau und ein Strich bleibt ein Strich,
 *                   weil an Gabelungen geradeaus weiter gelaufen wird
 *   5. Verbinden  – Stücke, die an einer Gabelung auseinandergefallen sind,
 *                   werden wieder zusammengesetzt – aber nur, wenn der Ver-
 *                   bindungsschnitt im Bauteil liegt
 */
export function computeCenterlines(contours: Contour[], tolerance: number): Vec2[][] {
  const closed = contours.filter((c) => c.closed && c.pts.length >= 3);
  if (!closed.length) return [];

  const out: Vec2[][] = [];
  let budget = MAX_TOTAL_PX;
  for (const group of groupContours(closed)) {
    const r = rasterizeGroup(group, tolerance);
    if (!r) continue;
    const px = r.gw * r.gh;
    if (budget - px < 0) continue;
    budget -= px;
    const dist = edt2d(r.g, r.gw, r.gh);
    const tol = Math.max(tolerance * 0.5, r.res * 0.5);
    for (const raw of traceRidges(r, dist)) {
      const pts = raw.map((p) => ({ x: r.ox + p.x * r.res, y: r.oy + p.y * r.res }));
      const s = simplify(pts, tol, false);
      if (s.length >= 2) out.push(s);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Gruppen
// ---------------------------------------------------------------------------

/** Fasst Konturen zusammen, deren Bounding-Boxen sich berühren (mit Rand). */
function groupContours(cs: Contour[]): Contour[][] {
  const n = cs.length;
  if (n === 1) return [cs];
  const box = cs.map((c) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of c.pts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  });
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };

  const m = 0.05;
  const order = cs.map((_, i) => i).sort((a, b) => box[a].minY - box[b].minY);
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      const A = box[order[i]], B = box[order[j]];
      if (B.minY > A.maxY + m) break;
      if (B.minX <= A.maxX + m && B.maxX >= A.minX - m) {
        const ra = find(order[i]), rb = find(order[j]);
        if (ra !== rb) parent[rb] = ra;
      }
    }
  }
  const map = new Map<number, Contour[]>();
  for (let i = 0; i < n; i++) {
    const k = find(i);
    const arr = map.get(k);
    if (arr) arr.push(cs[i]); else map.set(k, [cs[i]]);
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// 2. Rastern
// ---------------------------------------------------------------------------

const MAX_SIDE = 1600;        // px pro Seite und Gruppe
const MIN_RES = 0.004;        // mm – feiner wird nicht gerastert
const MAX_TOTAL_PX = 16e6;    // Obergrenze über alle Gruppen

type Raster = {
  g: Uint8Array;
  gw: number; gh: number;
  ox: number; oy: number;     // Weltkoordinate des Pixels (0,0), linke untere Ecke
  res: number;
  area: number;
};

/** Schätzt die typische Strichbreite einer Gruppe: 2·Fläche / Umfang. */
function strokeWidth(group: Contour[]): number {
  let a = 0, p = 0;
  for (const c of group) {
    a += c.area * (c.depth % 2 === 0 ? 1 : -1);
    p += c.length;
  }
  if (p <= 0 || a <= 0) return 0;
  return (2 * a) / p;
}

function rasterizeGroup(group: Contour[], tolerance: number): Raster | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of group) for (const p of c.pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX, h = maxY - minY;
  if (!(w > 0) && !(h > 0)) return null;

  // Auflösung: Toleranz, aber mindestens ~8 Pixel über die Strichbreite
  let res = Math.max(0.02, Math.min(tolerance, 0.2));
  const wEst = strokeWidth(group);
  if (wEst > 0) res = Math.min(res, Math.max(MIN_RES, wEst / 8));
  res = Math.max(res, Math.max(w, h) / MAX_SIDE);

  const pad = 2;
  const gw = Math.ceil(w / res) + 1 + pad * 2;
  const gh = Math.ceil(h / res) + 1 + pad * 2;
  if (gw < 5 || gh < 5 || gw * gh > MAX_TOTAL_PX) return null;
  const ox = minX - pad * res;
  const oy = minY - pad * res;
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
  for (const c of group) {
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
    xs.sort((a, b) => a - b);
    const base = gy * gw;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = (xs[k] - ox) / res, b = (xs[k + 1] - ox) / res;
      let x0 = Math.round(a), x1 = Math.round(b) - 1;
      if (x1 < x0) {
        // schmaler als ein Pixel: wenigstens ein Pixel, sonst reißt der Strich
        const xm = Math.round((a + b) / 2);
        if (xm >= 0 && xm < gw && b - a > 0.02) { g[base + xm] = 1; area++; }
        continue;
      }
      x0 = Math.max(0, x0); x1 = Math.min(gw - 1, x1);
      for (let x = x0; x <= x1; x++) { g[base + x] = 1; area++; }
    }
  }
  return { g, gw, gh, ox, oy, res, area };
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

const STEP = 0.7;      // Schrittweite in Pixeln
const DMIN = 0.6;      // minimaler Randabstand in Pixeln (darunter ist Schluss)
const LOOP_EPS = 1.4;  // Abstand, ab dem ein Pfad als geschlossen gilt
const DELTA = 0.8;     // px: soviel darf der Randabstand unter das lokale Maß fallen
const WIN = 24;        // Schritte im Fenster für das lokale Maß
const PERSIST = 3;     // so viele Schritte muss der Abstand gefallen sein
const SEED_MIN = 0.9;  // px: minimaler Randabstand für einen Startpunkt
const INERTIA = 0.65;  // Anteil der bisherigen Richtung (Trägheit an Gabelungen)

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
function ridgeDir(dist: Float32Array, gw: number, gh: number, x: number, y: number): { rx: number; ry: number; lamA: number } | null {
  const d0 = sampleD(dist, gw, gh, x, y);
  const h = 1;
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
  return { rx: rx / l, ry: ry / l, lamA: tr - det };
}

/** Setzt einen Punkt in die Mitte des Querschnitts senkrecht zur Laufrichtung. */
function toCenter(dist: Float32Array, gw: number, gh: number, p: P, dx: number, dy: number): P | null {
  const nx = -dy, ny = dx;
  const d = sampleD(dist, gw, gh, p.x, p.y);
  if (d < DMIN) return null;
  const from = Math.max(0, d - 1.2), to = d + 2.0;
  const edge = (sgn: number): number | null => {
    for (let s = from; s <= to; s += 0.5) {
      const ds = sampleD(dist, gw, gh, p.x + nx * sgn * s, p.y + ny * sgn * s);
      if (ds <= 1) return sgn * (s + ds);
    }
    return null;
  };
  const a = edge(1), b = edge(-1);
  if (a === null || b === null) return null;          // Gabelung oder Ecke → nicht korrigieren
  const mid = (a + b) / 2;
  if (Math.abs(mid) > Math.max(1.5, d)) return null;  // unplausibel
  return { x: p.x + nx * mid, y: p.y + ny * mid };
}

/**
 * Läuft von Gratpunkten beidseitig den Grat ab. Ein Strich bleibt dabei ein
 * Strich, weil an Gabelungen (Trägheit der Richtung) geradeaus weiter gelaufen
 * wird; abgehende Äste werden später als eigener Pfad abgelaufen und enden an
 * der Kreuzung, sobald sie auf einen schon markierten Pfad treffen.
 */
function traceRidges(r: Raster, dist: Float32Array): P[][] {
  const { gw, gh } = r;
  const visited = new Uint8Array(gw * gh);
  const mark = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
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
    for (let k = -2; k <= 2; k++) {
      const a = base + (k * 25 * Math.PI) / 180;
      const ux = Math.cos(a), uy = Math.sin(a);
      const n = Math.ceil(len);
      for (let s = 1; s <= n; s++) {
        const ix = Math.floor(x + ux * s), iy = Math.floor(y + uy * s);
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const xx = ix + i, yy = iy + j;
          if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) visited[yy * gw + xx] = 1;
        }
      }
    }
  };
  const isVisited = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    return ix >= 0 && iy >= 0 && ix < gw && iy < gh ? visited[iy * gw + ix] === 1 : false;
  };

  const NB = [-gw - 1, -gw, -gw + 1, 1, gw + 1, gw, gw - 1, -1];
  // Startpunkte: höchster Punkt quer zur Gratrichtung
  const seeds: { p: P; rx: number; ry: number; d: number }[] = [];
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const i = y * gw + x;
      const cx = x + 0.5, cy = y + 0.5;
      const d = dist[i];
      if (d < DMIN) continue;
      // lokales Maximum in der 8er-Nachbarschaft (schnell) – nur so wird aus
      // der Treppenkante des Rasters kein zweiter, falscher Grat
      if (d < SEED_MIN) continue;
      let isMax = true;
      for (let k = 0; k < 8; k++) if (dist[i + NB[k]] > d + 1e-6) { isMax = false; break; }
      if (!isMax) continue;
      const rd = ridgeDir(dist, gw, gh, cx, cy);
      if (!rd || rd.lamA > -0.4) continue;                 // kein echter Grat
      seeds.push({ p: { x: cx, y: cy }, rx: rd.rx, ry: rd.ry, d });
    }
  }

  /** Läuft von p0 in Richtung (dx,dy), bis der Grat endet. */
  const march = (p0: P, dx: number, dy: number): { pts: P[]; loop: boolean; endStop: boolean } => {
    const pts: P[] = [];
    let px = p0.x, py = p0.y;
    let travelled = 0;
    let loop = false;
    let endStop = false;
    const win = new Float64Array(WIN);      // letzte Randabstände → lokales Maß
    let wi = 0, filled = 0;
    let dRef = 0;                           // größter Randabstand im Fenster
    let below = 0;                          // Schritte unter dem Maß
    for (let step = 0; step < 200000; step++) {
      const rd = ridgeDir(dist, gw, gh, px, py);
      if (rd) {
        let ux = rd.rx, uy = rd.ry;
        if (ux * dx + uy * dy < 0) { ux = -ux; uy = -uy; }
        // Trägheit: an Gabelungen geradeaus weiterlaufen
        dx = dx * INERTIA + ux * (1 - INERTIA);
        dy = dy * INERTIA + uy * (1 - INERTIA);
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
      }
      let nx = px + dx * STEP, ny = py + dy * STEP;
      const c = toCenter(dist, gw, gh, { x: nx, y: ny }, dx, dy);
      if (c) { nx = c.x; ny = c.y; }
      const d = sampleD(dist, gw, gh, nx, ny);
      // Bezug: größter Randabstand der letzten Schritte – ein kurzes Dippen
      // (Rasterrauheit, Gabelung) bricht den Lauf nicht ab, ein echtes
      // Strichende (ständig fallender Abstand) schon
      win[wi] = d; wi = (wi + 1) % WIN; if (filled < WIN) filled++;
      dRef = 0;
      for (let k = 0; k < filled; k++) if (win[k] > dRef) dRef = win[k];
      if (d < DMIN) { endStop = true; break; }
      if (d < dRef - DELTA) {
        if (++below >= PERSIST) { for (let k = 0; k < PERSIST - 1; k++) pts.pop(); endStop = true; break; }
      } else below = 0;
      if (isVisited(nx, ny)) break;                                   // trifft früheren Pfad
      if (travelled > 4 && Math.hypot(nx - p0.x, ny - p0.y) < LOOP_EPS) { loop = true; break; }
      pts.push({ x: nx, y: ny });
      travelled += STEP;
      px = nx; py = ny;
    }
    return { pts, loop, endStop };
  };

  // breite Stellen zuerst: so startet der Lauf in der Strichmitte und nicht
  // an einer Eckenspitze, von der aus der Grat schräg in die Ecke läuft
  seeds.sort((a, b) => b.d - a.d);

  const paths: P[][] = [];
  for (const seed of seeds) {
    if (isVisited(seed.p.x, seed.p.y)) continue;
    const c0 = toCenter(dist, gw, gh, seed.p, seed.rx, seed.ry);
    const p0 = c0 ?? seed.p;
    const fwd = march(p0, seed.rx, seed.ry);
    const pts: P[] = [];
    let bwdStop = false;
    if (fwd.loop) {
      pts.push(p0, ...fwd.pts);
    } else {
      const back = march(p0, -seed.rx, -seed.ry);
      bwdStop = back.endStop;
      for (let i = back.pts.length - 1; i >= 0; i--) pts.push(back.pts[i]);
      pts.push(p0);
      for (const q of fwd.pts) pts.push(q);
    }
    if (pts.length < 5) continue;              // Reste von Eckenspitzen verwerfen
    // zu kurze Stückchen an Gabelungen verwerfen: kürzer als die halbe Breite
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const mid = pts[Math.floor(pts.length / 2)];
    if (len < 0.3 * 2 * sampleD(dist, gw, gh, mid.x, mid.y)) continue;
    for (const p of pts) mark(p.x, p.y);
    // Ecken-Häkchen nur dort wegmarkieren, wo der Lauf wirklich am Strichende
    // endete – an Gabelungen darf der Nachbarpfad weiterlaufen
    const ends: [P, P, boolean][] = [
      [pts[1], pts[0], bwdStop],
      [pts[pts.length - 2], pts[pts.length - 1], fwd.endStop],
    ];
    for (const [a, b, stop] of ends) {
      if (!stop) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const d = sampleD(dist, gw, gh, b.x, b.y);
      markFan(b.x, b.y, dx, dy, Math.min(12, Math.max(3, 1.5 * d)));
    }
    paths.push(pts);
  }
  return linkPaths(paths, dist, gw, gh);
}

/**
 * Verbindet Pfade, die an einer Gabelung auseinandergefallen sind, wieder zu
 * einem Stück. Der Verbindungsschnitt muss dabei im Bauteil liegen – es wird
 * also nie über eine Lücke zwischen zwei Strichen hinweg verbunden.
 */
function linkPaths(paths: P[][], dist: Float32Array, gw: number, gh: number): P[][] {
  if (paths.length < 2) return paths;
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
  let cur = paths;
  for (let round = 0; round < cur.length + 8; round++) {
    let best: { i: number; j: number; gap: number; flipI: boolean; flipJ: boolean } | null = null;
    for (let i = 0; i < cur.length; i++) {
      for (let j = 0; j < cur.length; j++) {
        if (i === j) continue;
        const A = cur[i], B = cur[j];
        if (A.length < 2 || B.length < 2) continue;
        if (Math.hypot(A[0].x - A[A.length - 1].x, A[0].y - A[A.length - 1].y) < 2) continue; // Ring
        for (const [a, flipI] of [[A[A.length - 1], false], [A[0], true]] as [P, boolean][]) {
          for (const [b, flipJ] of [[B[0], false], [B[B.length - 1], true]] as [P, boolean][]) {
            const gap = Math.hypot(b.x - a.x, b.y - a.y);
            const lim = Math.max(3, 2 * sampleD(dist, gw, gh, a.x, a.y));
            if (gap > lim) continue;
            const [cx, cy] = dir(a, b);
            const [ux, uy] = flipI ? dir(A[1], A[0]) : dir(A[A.length - 2], A[A.length - 1]);
            const [vx, vy] = flipJ ? dir(B[B.length - 1], B[B.length - 2]) : dir(B[1], B[0]);
            if (ux * cx + uy * cy < 0 || vx * cx + vy * cy < 0) continue;   // kein Rückwärtsgang
            if (!inside(a, b)) continue;
            if (!best || gap < best.gap) best = { i, j, gap, flipI, flipJ };
          }
        }
      }
    }
    if (!best) break;
    const A = best.flipI ? cur[best.i].slice().reverse() : cur[best.i];
    const B = best.flipJ ? cur[best.j].slice().reverse() : cur[best.j];
    const merged = A.concat(B);
    const next: P[][] = [];
    for (let i = 0; i < cur.length; i++) if (i !== best.i && i !== best.j) next.push(cur[i]);
    next.push(merged);
    cur = next;
  }
  return cur;
}
