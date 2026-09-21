import type { Contour, Vec2 } from '../types';
import { simplify } from './geometry';

/**
 * Mittellinien-Berechnung (z.B. für Schriftzüge / Zahlen):
 * 1. Geschlossene Konturen even-odd auf ein Raster rendern
 * 2. Zhang-Suen-Skelettierung (Thinning) auf 1 Pixel Breite
 * 3. Skelett-Pixel zu Polylinien vektorisieren + vereinfachen
 */
export function computeCenterlines(contours: Contour[], tolerance: number): Vec2[][] {
  const closed = contours.filter((c) => c.closed && c.pts.length >= 3);
  if (!closed.length) return [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of closed) for (const p of c.pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX, h = maxY - minY;
  if (w <= 0 || h <= 0) return [];

  // Rasterauflösung: an Toleranz gekoppelt, Grenze ~1400px pro Seite
  let res = Math.max(0.02, Math.min(tolerance, 0.2));
  const maxPix = 1400;
  if (w / res > maxPix || h / res > maxPix) res = Math.max(w, h) / maxPix;

  const gw = Math.ceil(w / res) + 4;
  const gh = Math.ceil(h / res) + 4;
  const grid = new Uint8Array(gw * gh);

  // Even-odd Scanline-Füllung
  for (let gy = 0; gy < gh; gy++) {
    const y = minY + (gy - 1.5) * res;
    const xs: number[] = [];
    for (const c of closed) {
      const pts = c.pts;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[j], b = pts[i];
        if ((a.y > y) !== (b.y > y)) {
          xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.round((xs[k] - minX) / res) + 2);
      const x1 = Math.min(gw - 1, Math.round((xs[k + 1] - minX) / res) + 2);
      for (let gx = x0; gx <= x1; gx++) grid[gy * gw + gx] = 1;
    }
  }

  zhangSuen(grid, gw, gh);

  // Skelett vektorisieren
  const lines = traceSkeleton(grid, gw, gh);
  const toWorld = (p: Vec2): Vec2 => ({
    x: minX + (p.x - 2) * res,
    y: minY + (p.y - 1.5) * res,
  });

  return lines
    .map((l) => simplify(l.map(toWorld), Math.max(tolerance, res * 0.8), false))
    .filter((l) => l.length >= 2);
}

// ---------------------------------------------------------------------------

function zhangSuen(grid: Uint8Array, w: number, h: number) {
  const idx = (x: number, y: number) => y * w + x;
  let changed = true;
  const toClear: number[] = [];
  let guard = 500;
  while (changed && guard-- > 0) {
    changed = false;
    for (const step of [0, 1]) {
      toClear.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!grid[idx(x, y)]) continue;
          const p2 = grid[idx(x, y - 1)], p3 = grid[idx(x + 1, y - 1)];
          const p4 = grid[idx(x + 1, y)], p5 = grid[idx(x + 1, y + 1)];
          const p6 = grid[idx(x, y + 1)], p7 = grid[idx(x - 1, y + 1)];
          const p8 = grid[idx(x - 1, y)], p9 = grid[idx(x - 1, y - 1)];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          let A = 0;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          for (let k = 0; k < 8; k++) if (seq[k] === 0 && seq[k + 1] === 1) A++;
          if (A !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          }
          toClear.push(idx(x, y));
        }
      }
      if (toClear.length) {
        changed = true;
        for (const i of toClear) grid[i] = 0;
      }
    }
  }
}

// ---------------------------------------------------------------------------

const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

function traceSkeleton(grid: Uint8Array, w: number, h: number): Vec2[][] {
  const idx = (x: number, y: number) => y * w + x;
  const degree = (x: number, y: number) => {
    let d = 0;
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && grid[idx(nx, ny)]) d++;
    }
    return d;
  };

  const visited = new Uint8Array(w * h);
  const lines: Vec2[][] = [];

  const walk = (sx: number, sy: number) => {
    const line: Vec2[] = [{ x: sx, y: sy }];
    visited[idx(sx, sy)] = 1;
    let cx = sx, cy = sy;
    let pdx = 0, pdy = 0; // bisherige Richtung
    let guard = w * h;
    while (guard-- > 0) {
      // Nachbarn sammeln, den mit bester Richtungs-Fortsetzung wählen
      let bx = -1, by = -1, bestScore = -Infinity;
      for (const [dx, dy] of N8) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!grid[idx(nx, ny)] || visited[idx(nx, ny)]) continue;
        const len = Math.hypot(dx, dy);
        // Skalarprodukt mit bisheriger Richtung, orthogonale Schritte leicht bevorzugen
        const score = (pdx * dx + pdy * dy) / len + (len === 1 ? 0.01 : 0);
        if (score > bestScore) { bestScore = score; bx = nx; by = ny; }
      }
      if (bx < 0) break;
      pdx = bx - cx; pdy = by - cy;
      const l = Math.hypot(pdx, pdy);
      pdx /= l; pdy /= l;
      visited[idx(bx, by)] = 1;
      line.push({ x: bx, y: by });
      cx = bx; cy = by;
    }
    if (line.length >= 2) lines.push(line);
  };

  // 1. Von Endpunkten (Grad 1) starten
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[idx(x, y)] && !visited[idx(x, y)] && degree(x, y) === 1) walk(x, y);
    }
  }
  // 2. Reste (geschlossene Schleifen / Verzweigungen)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[idx(x, y)] && !visited[idx(x, y)]) walk(x, y);
    }
  }
  return mergeLines(lines);
}

/** Polylinien mit (fast) gleichen Endpunkten zusammenfügen */
function mergeLines(lines: Vec2[][]): Vec2[][] {
  const JOIN = 2.2; // Pixel-Distanz zum Verbinden
  const d2 = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const J2 = JOIN * JOIN;
  const pool = lines.map((l) => l.slice());
  let merged = true;
  let guard = pool.length * 4 + 10;
  while (merged && guard-- > 0) {
    merged = false;
    outer: for (let i = 0; i < pool.length; i++) {
      const a = pool[i];
      for (let j = i + 1; j < pool.length; j++) {
        const b = pool[j];
        const aS = a[0], aE = a[a.length - 1], bS = b[0], bE = b[b.length - 1];
        let joined: Vec2[] | null = null;
        if (d2(aE, bS) <= J2) joined = a.concat(b);
        else if (d2(aE, bE) <= J2) joined = a.concat(b.slice().reverse());
        else if (d2(aS, bE) <= J2) joined = b.concat(a);
        else if (d2(aS, bS) <= J2) joined = b.slice().reverse().concat(a);
        if (joined) {
          pool[i] = joined;
          pool.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return pool;
}
