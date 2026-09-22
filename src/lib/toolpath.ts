import type { Contour, MeshData, Move, Op, OrientedMesh, OriginXY, Settings, Toolpath, Vec2 } from '../types';
import { buildContours, chainSegments, hatchFill, nestingDepth, offsetPolygon, orient, pathLength, sliceMesh } from './geometry';
import { computeCenterlines } from './centerline';

// ---------------------------------------------------------------------------
// 1. Ausrichtung
// ---------------------------------------------------------------------------

export function orientMesh(mesh: MeshData, s: Pick<Settings, 'topAxis' | 'rotZ' | 'mirror' | 'scale'>): OrientedMesh {
  const src = mesh.positions;
  const out = new Float32Array(src.length);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const rot = (s.rotZ * Math.PI) / 180, cr = Math.cos(rot), sr = Math.sin(rot);
  const k = s.scale || 1;
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i] * k, y = src[i + 1] * k, z = src[i + 2] * k;
    let nx: number, ny: number, nz: number;
    switch (s.topAxis) {
      case '+z': nx = x; ny = y; nz = z; break;
      case '-z': nx = x; ny = -y; nz = -z; break;
      case '+x': nx = -z; ny = y; nz = x; break;
      case '-x': nx = z; ny = y; nz = -x; break;
      case '+y': nx = x; ny = -z; nz = y; break;
      case '-y': nx = x; ny = z; nz = -y; break;
    }
    if (s.mirror) nx = -nx;
    const rx = nx * cr - ny * sr, ry = nx * sr + ny * cr;
    out[i] = rx; out[i + 1] = ry; out[i + 2] = nz;
    if (rx < min[0]) min[0] = rx; if (rx > max[0]) max[0] = rx;
    if (ry < min[1]) min[1] = ry; if (ry > max[1]) max[1] = ry;
    if (nz < min[2]) min[2] = nz; if (nz > max[2]) max[2] = nz;
  }
  // Bei Spiegelung dreht sich die Dreiecksorientierung – für das Slicing unerheblich.
  return { positions: out, min, max };
}

// ---------------------------------------------------------------------------
// 2. Schnittebenen → Konturen
// ---------------------------------------------------------------------------

export function levelZ(om: OrientedMesh, offset: number): number {
  const h = om.max[2] - om.min[2];
  return om.max[2] - Math.min(Math.max(offset, 0), h) - (h > 0 ? h * 1e-6 : 0);
}

export function sliceLevels(om: OrientedMesh, offsets: number[], tolerance: number): Contour[] {
  const all: Contour[] = [];
  offsets.forEach((off, level) => {
    const z = levelZ(om, off);
    const contours = buildContours(chainSegments(sliceMesh(om.positions, z)), tolerance);
    contours.sort((a, b) => b.area - a.area);
    contours.forEach((c, i) => { c.id = level * 100000 + i; c.level = level; c.z = z; });
    all.push(...contours);
  });
  return all;
}

export function originPoint(om: OrientedMesh, originXY: OriginXY): Vec2 {
  const x = originXY.includes('left') ? om.min[0] : originXY.includes('right') ? om.max[0] : (om.min[0] + om.max[0]) / 2;
  const y = originXY.startsWith('front') ? om.min[1] : originXY.startsWith('back') ? om.max[1] : (om.min[1] + om.max[1]) / 2;
  return { x, y };
}

export const opOf = (s: Settings, id: number): Op => s.ops[String(id)] ?? 'engrave';

/** Ein Stück der Mittellinien-Vorschau bzw. des Gravurwegs. */
export type CenterlinePath = {
  z: number;
  pts: Vec2[];
  /** false = Form ist zu breit für eine Mittellinie, `pts` ist dann die Kontur selbst */
  centerline: boolean;
};

/**
 * Mittellinien der Gravurkonturen, getrennt je Schnittebene. Vorschau in der
 * Ansicht und Werkzeugweg nutzen dieselbe Quelle – was angezeigt wird, wird
 * auch gefräst. Zu breite Formen (z. B. die Plattenkante) kommen als ihre
 * eigene Kontur zurück und werden damit wie bei „Kontur“ graviert.
 */
export function centerlinePaths(contours: Contour[], tolerance: number, maxWidth = Infinity): CenterlinePath[] {
  const byZ = new Map<number, Contour[]>();
  for (const c of contours) {
    if (!c.closed) continue;
    const a = byZ.get(c.z);
    if (a) a.push(c); else byZ.set(c.z, [c]);
  }
  const out: CenterlinePath[] = [];
  for (const [z, cs] of byZ) {
    for (const piece of computeCenterlines(cs, tolerance, maxWidth)) out.push({ z, pts: piece.pts, centerline: piece.centerline });
  }
  return out;
}

export function activeContours(contours: Contour[], s: Settings) {
  return contours.filter((c) => opOf(s, c.id) !== 'off' && c.length >= s.minLength);
}

// ---------------------------------------------------------------------------
// 3. Werkzeugweg
// ---------------------------------------------------------------------------

export function settingsKey(s: Settings): string {
  const { startBlock: _a, endBlock: _b, presetId: _c, feedXY: _d, feedZ: _e, rpm: _f, ...rest } = s;
  return JSON.stringify(rest);
}

type Path = { pts: Vec2[]; closed: boolean; op: Op; depth: number; tabs: boolean; order: number };

/** Ab dieser Lücke (mm) zwischen zwei Gravurstücken wird der Kopf nicht mehr angehoben */
const LINK_GAP = 0.3;

export function computeToolpath(om: OrientedMesh, contours: Contour[], s: Settings): Toolpath | null {
  const warnings: string[] = [];
  const active = activeContours(contours, s);
  if (!active.length) return null;

  const byOp = (op: Op) => active.filter((c) => opOf(s, c.id) === op);
  const r = s.compensate ? s.tool.tipDia / 2 : 0;
  const ccwFor = (outside: boolean) => (s.cutDir === 'climb') === outside;
  const paths: Path[] = [];

  // --- Gravur ---
  const eng = byOp('engrave');
  if (s.engraveMode === 'centerline') {
    for (const l of centerlinePaths(eng, s.tolerance, s.centerlineWidth)) {
      // Zu breite Formen kommen als geschlossene Kontur zurück (wie bei „Kontur“)
      const closed = !l.centerline;
      if (pathLength(l.pts, closed) >= s.minLength) {
        paths.push({ pts: l.pts, closed, op: 'engrave', depth: s.engraveDepth, tabs: false, order: 0 });
      }
    }
    for (const c of eng.filter((c) => !c.closed)) paths.push({ pts: c.pts, closed: false, op: 'engrave', depth: s.engraveDepth, tabs: false, order: 0 });
  } else {
    for (const c of eng) paths.push({ pts: c.pts, closed: c.closed, op: 'engrave', depth: s.engraveDepth, tabs: false, order: 0 });
  }

  // --- Tasche ---
  const pockets = byOp('pocket').filter((c) => c.closed);
  if (pockets.length) {
    const polys = pockets.map((c) => c.pts);
    const bounds: Vec2[][] = [];
    for (const c of pockets) {
      const d = nestingDepth(c.pts, polys);
      const inward = d % 2 === 0;                       // äußere Taschenkontur → nach innen
      const off = r ? offsetPolygon(c.pts, inward ? -r : r) : c.pts;
      if (!off) { warnings.push(`Tasche ${label(c)} ist kleiner als das Werkzeug und wird übersprungen.`); continue; }
      bounds.push(orient(off, ccwFor(!inward)));
    }
    for (const b of bounds) paths.push({ pts: b, closed: true, op: 'pocket', depth: s.pocketDepth, tabs: false, order: 1 });
    const fake = bounds.map((pts, i) => ({ ...pockets[0], id: -1 - i, pts, closed: true, area: 1, length: 1 }));
    for (const l of hatchFill(fake, Math.max(s.pocketStepOver, 0.05), 45)) paths.push({ pts: l, closed: false, op: 'pocket', depth: s.pocketDepth, tabs: false, order: 1 });
  }

  // --- Durchbruch ---
  const cuts = byOp('cut');
  const cutDepth = s.material + s.cutOvershoot;
  for (const c of cuts) {
    if (!c.closed) { paths.push({ pts: c.pts, closed: false, op: 'cut', depth: cutDepth, tabs: false, order: 2 }); continue; }
    const outside = c.depth % 2 === 0;                  // Außenkontur → Werkzeug außen
    const off = r ? offsetPolygon(c.pts, outside ? r : -r) : c.pts;
    if (!off) { warnings.push(`Durchbruch ${label(c)} ist kleiner als das Werkzeug und wird übersprungen.`); continue; }
    paths.push({ pts: orient(off, ccwFor(outside)), closed: true, op: 'cut', depth: cutDepth, tabs: s.tabCount > 0 && outside, order: outside ? 3 : 2 });
  }
  if (!paths.length) {
    if (warnings.length) throw new Error(warnings.join(' '));
    return null;
  }

  if (s.tool.tipAngle > 0 && cuts.length) warnings.push('Durchbrüche mit V-Stichel werden konisch. Für saubere Kanten Schaftfräser (Spitzenwinkel 0°) verwenden.');

  // --- Nullpunkt & Reihenfolge ---
  const o = originPoint(om, s.originXY);
  for (const p of paths) p.pts = p.pts.map((q) => ({ x: q.x - o.x, y: q.y - o.y }));
  const ordered: Path[] = [];
  for (const ord of [0, 1, 2, 3]) ordered.push(...orderPaths(paths.filter((p) => p.order === ord), ordered.length ? endOf(ordered[ordered.length - 1]) : { x: 0, y: 0 }));

  // --- Bewegungen ---
  const zTop = s.originZ === 'top' ? 0 : s.material;
  const zSafe = zTop + s.safeZ;
  const tabTop = zTop - (s.material - s.tabHeight);
  const moves: Move[] = [];
  let cutLength = 0, rapidLength = 0, plungeLength = 0;
  let cur = { x: 0, y: 0, z: zSafe };
  moves.push({ ...cur, rapid: true, op: 'engrave' });
  const push = (x: number, y: number, z: number, rapid: boolean, op: Op) => {
    const d = Math.hypot(x - cur.x, y - cur.y, z - cur.z);
    if (d < 1e-9) return;
    if (rapid) rapidLength += d; else if (Math.abs(x - cur.x) < 1e-9 && Math.abs(y - cur.y) < 1e-9) plungeLength += d; else cutLength += d;
    cur = { x, y, z };
    moves.push({ x, y, z, rapid, op });
  };

  const counts: Record<Op, number> = { engrave: 0, pocket: 0, cut: 0, off: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let pi = 0; pi < ordered.length; pi++) {
    const p = ordered[pi];
    counts[p.op]++;
    const n = Math.max(1, Math.ceil(p.depth / Math.max(s.stepDown, 0.01) - 1e-9));
    const first = p.pts[0];
    // Zwischen zwei Gravurstücken, die fast aneinanderstoßen, nicht abheben
    const prev = pi > 0 ? ordered[pi - 1] : null;
    const link =
      prev !== null && prev.op === p.op && prev.op === 'engrave' &&
      Math.abs(prev.depth - p.depth) < 1e-9 && !prev.closed && !p.closed &&
      Math.hypot(prev.pts[prev.pts.length - 1].x - first.x, prev.pts[prev.pts.length - 1].y - first.y) <= LINK_GAP;
    if (!link) {
      push(cur.x, cur.y, zSafe, true, p.op);
      push(first.x, first.y, zSafe, true, p.op);
    }
    for (let i = 1; i <= n; i++) {
      const z = zTop - Math.min(p.depth, i * s.stepDown);
      if (p.closed) {
        const pts3 = p.tabs && z < tabTop ? withTabs(p.pts, z, tabTop, s.tabCount, s.tabWidth + s.tool.tipDia) : [...p.pts, p.pts[0]].map((q) => ({ ...q, z }));
        push(pts3[0].x, pts3[0].y, pts3[0].z, false, p.op);
        for (let k = 1; k < pts3.length; k++) push(pts3[k].x, pts3[k].y, pts3[k].z, false, p.op);
      } else {
        const seq = i % 2 === 1 ? p.pts : [...p.pts].reverse();
        push(cur.x, cur.y, z, false, p.op);
        for (let k = (i === 1 ? 0 : 1); k < seq.length; k++) push(seq[k].x, seq[k].y, z, false, p.op);
      }
    }
    for (const q of p.pts) { if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x; if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y; }
  }
  push(cur.x, cur.y, zSafe, true, 'engrave');

  const timeMin = cutLength / Math.max(s.feedXY, 1) + plungeLength / Math.max(s.feedZ, 1) + rapidLength / 2500;
  return { moves, cutLength, rapidLength, timeMin, bounds: { minX, minY, maxX, maxY }, counts, warnings, settingsKey: settingsKey(s) };
}

// ---------------------------------------------------------------------------

const label = (c: Contour) => `${c.level > 0 ? `E${c.level + 1}·` : ''}${(c.id % 100000) + 1}`;
const endOf = (p: Path) => (p.closed ? p.pts[0] : p.pts[p.pts.length - 1]);

/** Geschlossenen Pfad auf Höhe z mit Haltestegen (angehoben auf tabTop) versehen */
function withTabs(pts: Vec2[], z: number, tabTop: number, count: number, width: number): { x: number; y: number; z: number }[] {
  const loop = [...pts, pts[0]];
  const cum = [0];
  for (let i = 1; i < loop.length; i++) cum.push(cum[i - 1] + Math.hypot(loop[i].x - loop[i - 1].x, loop[i].y - loop[i - 1].y));
  const L = cum[cum.length - 1];
  if (L <= width * count * 1.5) return loop.map((q) => ({ ...q, z })); // zu klein für Stege
  const half = width / 2;
  const intervals: [number, number][] = [];
  for (let k = 0; k < count; k++) {
    const c = ((k + 0.5) * L) / count;
    intervals.push([c - half, c + half]);
  }
  const inTab = (t: number) => intervals.some(([a, b]) => t >= a && t <= b);
  const events = new Set<number>(cum);
  for (const [a, b] of intervals) { events.add(Math.max(0, a)); events.add(Math.min(L, b)); }
  const ts = [...events].sort((a, b) => a - b);
  const out: { x: number; y: number; z: number }[] = [];
  let seg = 0;
  let lastIn: boolean | null = null;
  for (const t of ts) {
    while (seg < cum.length - 2 && cum[seg + 1] < t) seg++;
    const a = loop[seg], b = loop[seg + 1];
    const sl = cum[seg + 1] - cum[seg];
    const u = sl > 0 ? (t - cum[seg]) / sl : 0;
    const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
    const inside = inTab(Math.min(t + 1e-6, L));
    if (lastIn !== null && inside !== lastIn) {
      // Übergang: senkrecht heben/senken am selben Punkt
      out.push({ x, y, z: lastIn ? tabTop : z });
      out.push({ x, y, z: inside ? tabTop : z });
    } else {
      out.push({ x, y, z: inside ? tabTop : z });
    }
    lastIn = inside;
  }
  return out;
}

function orderPaths(paths: Path[], start: Vec2): Path[] {
  const remaining = [...paths];
  const out: Path[] = [];
  let cur = start;
  while (remaining.length) {
    let best = 0, bestD = Infinity, bestRev = false, bestStart = 0;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      if (p.closed) {
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
    const np = { ...p, pts };
    out.push(np);
    cur = endOf(np);
  }
  return out;
}

const d2 = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
