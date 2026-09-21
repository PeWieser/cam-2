import type { Contour, MeshData, Move, OrientedMesh, OriginXY, Settings, Toolpath, TopAxis, Vec2 } from '../types';
import { buildContours, chainSegments, hatchFill, pathLength, sliceMesh } from './geometry';
import { computeCenterlines } from './centerline';

// ---------------------------------------------------------------------------
// 1. Ausrichtung: gewählte Seite nach +Z drehen
// ---------------------------------------------------------------------------

export function orientMesh(mesh: MeshData, top: TopAxis): OrientedMesh {
  const src = mesh.positions;
  const out = new Float32Array(src.length);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i], y = src[i + 1], z = src[i + 2];
    let nx: number, ny: number, nz: number;
    switch (top) {
      case '+z': nx = x; ny = y; nz = z; break;
      case '-z': nx = x; ny = -y; nz = -z; break;          // 180° um X
      case '+x': nx = -z; ny = y; nz = x; break;           // +X → +Z
      case '-x': nx = z; ny = y; nz = -x; break;
      case '+y': nx = x; ny = -z; nz = y; break;           // +Y → +Z
      case '-y': nx = x; ny = z; nz = -y; break;
    }
    out[i] = nx; out[i + 1] = ny; out[i + 2] = nz;
    if (nx < min[0]) min[0] = nx; if (nx > max[0]) max[0] = nx;
    if (ny < min[1]) min[1] = ny; if (ny > max[1]) max[1] = ny;
    if (nz < min[2]) min[2] = nz; if (nz > max[2]) max[2] = nz;
  }
  return { positions: out, min, max };
}

// ---------------------------------------------------------------------------
// 2. Schnitt → Konturen (in Modell-Koordinaten, noch ohne Nullpunkt)
// ---------------------------------------------------------------------------

export function sliceContours(om: OrientedMesh, sliceOffset: number, tolerance: number): { contours: Contour[]; z: number } {
  const height = om.max[2] - om.min[2];
  const z = om.max[2] - Math.min(Math.max(sliceOffset, 0), height) - (height > 0 ? height * 1e-6 : 0);
  const segs = sliceMesh(om.positions, z);
  const chains = chainSegments(segs);
  const contours = buildContours(chains, tolerance);
  // Stabil sortieren: große außen zuerst
  contours.sort((a, b) => b.area - a.area);
  contours.forEach((c, i) => (c.id = i));
  return { contours, z };
}

// ---------------------------------------------------------------------------
// 3. Nullpunkt (bezogen auf die Modell-Bounding-Box)
// ---------------------------------------------------------------------------

export function originPoint(om: OrientedMesh, originXY: OriginXY): Vec2 {
  const x = originXY.includes('left') ? om.min[0] : originXY.includes('right') ? om.max[0] : (om.min[0] + om.max[0]) / 2;
  const y = originXY.startsWith('front') ? om.min[1] : originXY.startsWith('back') ? om.max[1] : (om.min[1] + om.max[1]) / 2;
  return { x, y };
}

// ---------------------------------------------------------------------------
// 4. Werkzeugweg
// ---------------------------------------------------------------------------

export function settingsKey(s: Settings): string {
  const { startBlock: _a, endBlock: _b, presetId: _c, feedXY: _d, feedZ: _e, rpm: _f, ...rest } = s;
  return JSON.stringify(rest);
}

export function computeToolpath(om: OrientedMesh, contours: Contour[], s: Settings): Toolpath | null {
  const active = contours.filter((c) => !s.ignored.includes(c.id) && c.length >= s.minLength);
  if (!active.length) return null;

  // Strategie → 2D-Pfade
  let paths: { pts: Vec2[]; closed: boolean }[] = [];
  if (s.strategy === 'contour') {
    paths = active.map((c) => ({ pts: c.pts, closed: c.closed }));
  } else if (s.strategy === 'centerline') {
    paths = computeCenterlines(active, s.tolerance)
      .map((pts) => ({ pts, closed: false }))
      .filter((p) => pathLength(p.pts, false) >= s.minLength);
  } else {
    const lines = hatchFill(active, Math.max(s.stepOver, 0.05), 45);
    paths = [
      ...active.filter((c) => c.closed).map((c) => ({ pts: c.pts, closed: true })),
      ...lines.map((pts) => ({ pts, closed: false })),
    ];
  }
  if (!paths.length) return null;

  // Nullpunkt
  const o = originPoint(om, s.originXY);
  paths = paths.map((p) => ({ ...p, pts: p.pts.map((q) => ({ x: q.x - o.x, y: q.y - o.y })) }));
  paths = orderPaths(paths);

  const zTop = s.originZ === 'top' ? 0 : s.depth;       // Werkstückoberfläche im Programm
  const zSafe = zTop + s.safeZ;
  const nSteps = Math.max(1, Math.ceil(s.depth / Math.max(s.stepDown, 0.01) - 1e-9));

  const moves: Move[] = [];
  let cutLength = 0, rapidLength = 0, plungeLength = 0;
  let cur = { x: 0, y: 0, z: zSafe };
  moves.push({ ...cur, rapid: true });

  const push = (x: number, y: number, z: number, rapid: boolean) => {
    const d = Math.hypot(x - cur.x, y - cur.y, z - cur.z);
    if (rapid) rapidLength += d; else if (x === cur.x && y === cur.y) plungeLength += d; else cutLength += d;
    cur = { x, y, z };
    moves.push({ x, y, z, rapid });
  };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) {
    const first = p.pts[0];
    push(cur.x, cur.y, zSafe, true);
    push(first.x, first.y, zSafe, true);
    // alle Tiefen einer Kontur nacheinander (weniger Eilgänge, sauberere Gravur)
    for (let i = 1; i <= nSteps; i++) {
      const z = zTop - Math.min(s.depth, i * s.stepDown);
      if (i > 1 && !p.closed) {
        // offene Pfade: am Ende eintauchen und rückwärts fahren
        push(cur.x, cur.y, z, false);
        const rev = [...p.pts].reverse();
        for (let k = 1; k < rev.length; k++) push(rev[k].x, rev[k].y, z, false);
        continue;
      }
      if (i > 1 && p.closed) {
        push(first.x, first.y, z, false);
      } else {
        push(first.x, first.y, z, false);
      }
      for (let k = 1; k < p.pts.length; k++) push(p.pts[k].x, p.pts[k].y, z, false);
      if (p.closed) push(first.x, first.y, z, false);
    }
    for (const q of p.pts) {
      if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y;
    }
  }
  push(cur.x, cur.y, zSafe, true);

  const timeMin = cutLength / Math.max(s.feedXY, 1) + plungeLength / Math.max(s.feedZ, 1) + rapidLength / 2500;
  return {
    moves, cutLength, rapidLength, timeMin, passes: nSteps,
    bounds: { minX, minY, maxX, maxY },
    settingsKey: settingsKey(s),
  };
}

// ---------------------------------------------------------------------------

function orderPaths(paths: { pts: Vec2[]; closed: boolean }[]) {
  const remaining = [...paths];
  const out: typeof paths = [];
  let cur: Vec2 = { x: 0, y: 0 };
  while (remaining.length) {
    let best = 0, bestD = Infinity, bestRev = false, bestStart = 0;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      if (p.closed) {
        // beliebiger Startpunkt auf geschlossener Kontur
        for (let k = 0; k < p.pts.length; k++) {
          const d = d2(cur, p.pts[k]);
          if (d < bestD) { bestD = d; best = i; bestRev = false; bestStart = k; }
        }
      } else {
        const d1 = d2(cur, p.pts[0]);
        if (d1 < bestD) { bestD = d1; best = i; bestRev = false; bestStart = 0; }
        const d = d2(cur, p.pts[p.pts.length - 1]);
        if (d < bestD) { bestD = d; best = i; bestRev = true; bestStart = 0; }
      }
    }
    const p = remaining.splice(best, 1)[0];
    let pts = p.pts;
    if (p.closed && bestStart) pts = [...pts.slice(bestStart), ...pts.slice(0, bestStart)];
    if (bestRev) pts = [...pts].reverse();
    out.push({ pts, closed: p.closed });
    cur = p.closed ? pts[0] : pts[pts.length - 1];
  }
  return out;
}

const d2 = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
