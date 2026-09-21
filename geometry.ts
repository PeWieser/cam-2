import type { Contour, Vec2 } from '../types';

// ---------------------------------------------------------------------------
// Mesh-Slicing: Schnitt aller Dreiecke mit der Ebene z = zSlice
// ---------------------------------------------------------------------------

type Seg = { a: Vec2; b: Vec2 };

export function sliceMesh(positions: Float32Array, zSlice: number): Seg[] {
  const segs: Seg[] = [];
  const n = positions.length;
  for (let i = 0; i < n; i += 9) {
    const z0 = positions[i + 2], z1 = positions[i + 5], z2 = positions[i + 8];
    const min = Math.min(z0, z1, z2), max = Math.max(z0, z1, z2);
    if (zSlice < min || zSlice > max || min === max) continue;

    const pts: Vec2[] = [];
    const edge = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      if ((az < zSlice && bz >= zSlice) || (bz < zSlice && az >= zSlice)) {
        const t = (zSlice - az) / (bz - az);
        pts.push({ x: ax + t * (bx - ax), y: ay + t * (by - ay) });
      }
    };
    edge(positions[i], positions[i + 1], z0, positions[i + 3], positions[i + 4], z1);
    edge(positions[i + 3], positions[i + 4], z1, positions[i + 6], positions[i + 7], z2);
    edge(positions[i + 6], positions[i + 7], z2, positions[i], positions[i + 1], z0);

    if (pts.length === 2) {
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      if (dx * dx + dy * dy > 1e-14) segs.push({ a: pts[0], b: pts[1] });
    }
  }
  return segs;
}

// ---------------------------------------------------------------------------
// Segmente zu Konturen verketten (Hash über gerundete Endpunkte)
// ---------------------------------------------------------------------------

export function chainSegments(segs: Seg[], eps = 1e-3): { pts: Vec2[]; closed: boolean }[] {
  const key = (p: Vec2) => `${Math.round(p.x / eps)},${Math.round(p.y / eps)}`;
  const map = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const k = key(p);
      const arr = map.get(k);
      if (arr) arr.push(i); else map.set(k, [i]);
    }
  });

  const used = new Array(segs.length).fill(false);
  const out: { pts: Vec2[]; closed: boolean }[] = [];

  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain: Vec2[] = [segs[i].a, segs[i].b];

    // in beide Richtungen erweitern
    for (const dir of [1, -1] as const) {
      let cur = dir === 1 ? chain[chain.length - 1] : chain[0];
      let guard = segs.length + 2;
      while (guard-- > 0) {
        const cands = map.get(key(cur)) || [];
        let next = -1;
        for (const c of cands) if (!used[c]) { next = c; break; }
        if (next < 0) break;
        used[next] = true;
        const s = segs[next];
        const nextPt = key(s.a) === key(cur) ? s.b : s.a;
        if (dir === 1) chain.push(nextPt); else chain.unshift(nextPt);
        cur = nextPt;
      }
    }

    const first = chain[0], last = chain[chain.length - 1];
    const closed = key(first) === key(last);
    if (closed) chain.pop();
    if (chain.length >= (closed ? 3 : 2)) out.push({ pts: chain, closed });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Douglas-Peucker-Vereinfachung (Kurventoleranz)
// ---------------------------------------------------------------------------

export function simplify(pts: Vec2[], tol: number, closed: boolean): Vec2[] {
  if (tol <= 0 || pts.length < 3) return pts;
  const work = closed ? [...pts, pts[0]] : pts;
  const keep = new Array(work.length).fill(false);
  keep[0] = keep[work.length - 1] = true;
  const stack: [number, number][] = [[0, work.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    if (e - s < 2) continue;
    const ax = work[s].x, ay = work[s].y, bx = work[e].x, by = work[e].y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1, maxI = -1;
    for (let i = s + 1; i < e; i++) {
      let d: number;
      if (len2 < 1e-12) {
        d = Math.hypot(work[i].x - ax, work[i].y - ay);
      } else {
        d = Math.abs(dy * work[i].x - dx * work[i].y + bx * ay - by * ax) / Math.sqrt(len2);
      }
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > tol) {
      keep[maxI] = true;
      stack.push([s, maxI], [maxI, e]);
    }
  }
  const res = work.filter((_, i) => keep[i]);
  if (closed) res.pop();
  return res.length >= (closed ? 3 : 2) ? res : pts;
}

// ---------------------------------------------------------------------------
// Polygon-Hilfen
// ---------------------------------------------------------------------------

export function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return a / 2;
}

export function pathLength(pts: Vec2[], closed: boolean): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closed && pts.length > 1) {
    l += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  }
  return l;
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Verschachtelungstiefe aller geschlossenen Konturen bestimmen */
export function buildContours(
  chains: { pts: Vec2[]; closed: boolean }[],
  tol: number
): Contour[] {
  const simplified = chains.map((c) => ({ pts: simplify(c.pts, tol, c.closed), closed: c.closed }));
  const closedIdx = simplified.map((c, i) => (c.closed ? i : -1)).filter((i) => i >= 0);

  const contours: Contour[] = simplified.map((c, id) => ({
    id, level: 0, z: 0,
    pts: c.pts,
    closed: c.closed,
    area: c.closed ? Math.abs(signedArea(c.pts)) : 0,
    length: pathLength(c.pts, c.closed),
    depth: 0,
    isOuter: true,
  }));

  // Verschachtelung: wie viele andere geschlossene Konturen enthalten mich?
  for (const i of closedIdx) {
    const p = contours[i].pts[0];
    let d = 0;
    for (const j of closedIdx) {
      if (i === j) continue;
      if (contours[j].area <= contours[i].area) continue;
      if (pointInPolygon(p, contours[j].pts)) d++;
    }
    contours[i].depth = d;
    contours[i].isOuter = d % 2 === 0;
  }
  return contours;
}

// ---------------------------------------------------------------------------
// Schraffur-Füllung (Scanlines, Even-Odd, Serpentinen-Ordnung)
// ---------------------------------------------------------------------------

export function hatchFill(
  contours: Contour[],
  stepOver: number,
  angleDeg: number
): Vec2[][] {
  const closed = contours.filter((c) => c.closed && c.pts.length >= 3);
  if (!closed.length || stepOver <= 0) return [];

  const ang = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(-ang), sin = Math.sin(-ang);
  const rot = (p: Vec2): Vec2 => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
  const unrot = (p: Vec2): Vec2 => ({
    x: p.x * Math.cos(ang) - p.y * Math.sin(ang),
    y: p.x * Math.sin(ang) + p.y * Math.cos(ang),
  });

  const polys = closed.map((c) => c.pts.map(rot));
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const poly of polys) for (const p of poly) {
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
  }

  const lines: Vec2[][] = [];
  let flip = false;
  const maxLines = 5000;
  let count = 0;
  for (let y = minY + stepOver / 2; y < maxY; y += stepOver) {
    if (count++ > maxLines) break;
    const xs: number[] = [];
    for (const poly of polys) {
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j], b = poly[i];
        if ((a.y > y) !== (b.y > y)) {
          xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      }
    }
    xs.sort((a, b) => a - b);
    const rowSegs: Vec2[][] = [];
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1] - xs[k] < 1e-6) continue;
      rowSegs.push([unrot({ x: xs[k], y }), unrot({ x: xs[k + 1], y })]);
    }
    if (flip) rowSegs.reverse();
    for (const s of rowSegs) {
      if (flip) s.reverse();
      lines.push(s);
    }
    flip = !flip;
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Orientierung & Polygon-Versatz (Werkzeugradius-Korrektur)
// ---------------------------------------------------------------------------

/** Polygon in gewünschte Umlaufrichtung bringen (ccw = gegen den Uhrzeigersinn) */
export function orient(pts: Vec2[], ccw: boolean): Vec2[] {
  const a = signedArea(pts);
  // signedArea hier: positiv = im Uhrzeigersinn (wegen Formel), daher invertieren
  const isCcw = a < 0;
  return isCcw === ccw ? pts : [...pts].reverse();
}

/**
 * Versatz eines geschlossenen Polygons. d > 0 = nach außen, d < 0 = nach innen.
 * Miter-Ecken mit Begrenzung, danach Bereinigung. Liefert null, wenn die Form
 * kollabiert (z. B. Loch kleiner als Werkzeug).
 */
export function offsetPolygon(input: Vec2[], d: number): Vec2[] | null {
  if (Math.abs(d) < 1e-9) return input;
  const pts = orient(dedupe(input), true);
  const n = pts.length;
  if (n < 3) return null;
  const areaBefore = Math.abs(signedArea(pts));

  const out: Vec2[] = [];
  const miterLimit = 3 * Math.abs(d);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    // Kantenrichtungen
    let e1x = p1.x - p0.x, e1y = p1.y - p0.y, e2x = p2.x - p1.x, e2y = p2.y - p1.y;
    const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    // Außennormalen bei CCW: (dy, -dx)
    const n1x = e1y, n1y = -e1x, n2x = e2y, n2y = -e2x;
    const bx = n1x + n2x, by = n1y + n2y;
    const bl = Math.hypot(bx, by);
    if (bl < 1e-9) {
      out.push({ x: p1.x + n1x * d, y: p1.y + n1y * d });
      continue;
    }
    const cosHalf = bl / 2;
    const miterLen = d / Math.max(cosHalf, 1e-6);
    if (Math.abs(miterLen) > miterLimit) {
      // Fase statt spitzer Ecke
      out.push({ x: p1.x + n1x * d, y: p1.y + n1y * d });
      out.push({ x: p1.x + n2x * d, y: p1.y + n2y * d });
    } else {
      out.push({ x: p1.x + (bx / bl) * miterLen, y: p1.y + (by / bl) * miterLen });
    }
  }

  const cleaned = removeLoops(dedupe(out));
  if (cleaned.length < 3) return null;
  if (d < 0) {
    const areaAfter = Math.abs(signedArea(cleaned));
    const ccwAfter = signedArea(cleaned) < 0;
    if (!ccwAfter || areaAfter >= areaBefore || areaAfter < 1e-6) return null;
    // Kollaps-Erkennung: jede Ergebnis-Ecke muss ~|d| von allen Originalkanten entfernt sein
    const lim = Math.abs(d) * 0.9;
    for (const q of cleaned) {
      for (let i = 0; i < n; i++) {
        if (distToSegment(q, pts[i], pts[(i + 1) % n]) < lim) return null;
      }
    }
  }
  return cleaned;
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function dedupe(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p.x - l.x, p.y - l.y) > 1e-5) out.push(p);
  }
  if (out.length > 1) {
    const f = out[0], l = out[out.length - 1];
    if (Math.hypot(f.x - l.x, f.y - l.y) <= 1e-5) out.pop();
  }
  return out;
}

/** Kleine Selbstüberschneidungen (Schleifen an konkaven Ecken) entfernen */
function removeLoops(pts: Vec2[]): Vec2[] {
  const n = pts.length;
  if (n < 4) return pts;
  const maxWindow = Math.min(12, n - 2);
  const res = [...pts];
  let changed = true;
  let guard = 50;
  while (changed && guard-- > 0) {
    changed = false;
    const m = res.length;
    outer: for (let i = 0; i < m; i++) {
      for (let k = 2; k <= maxWindow; k++) {
        const j = (i + k) % m;
        if (j === (i + m - 1) % m) continue;
        const x = segIntersect(res[i], res[(i + 1) % m], res[j], res[(j + 1) % m]);
        if (x) {
          // Schleife zwischen i+1 .. j entfernen, Schnittpunkt einsetzen
          const keep: Vec2[] = [];
          for (let t = 0; t < m; t++) {
            const inLoop = (t - (i + 1) + m) % m < k;
            if (!inLoop) keep.push(res[t]);
            if (t === i) keep.push(x);
          }
          res.length = 0; res.push(...keep);
          changed = true;
          break outer;
        }
      }
    }
  }
  return res;
}

function segIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) return { x: a.x + t * r.x, y: a.y + t * r.y };
  return null;
}

/** Verschachtelungstiefe eines Polygons innerhalb einer Menge geschlossener Polygone */
export function nestingDepth(target: Vec2[], others: Vec2[][]): number {
  const p = target[0];
  let d = 0;
  for (const o of others) {
    if (o === target) continue;
    if (Math.abs(signedArea(o)) <= Math.abs(signedArea(target))) continue;
    if (pointInPolygon(p, o)) d++;
  }
  return d;
}
