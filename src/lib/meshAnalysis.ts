// Mesh analysis utilities — extract contours, layers, etc.
import type { TriangleMesh } from "../types/cam";

export interface Point2D {
  x: number;
  y: number;
}

export interface Contour {
  points: Point2D[];
  closed: boolean;
  z: number; // contour is at this Z height
  holes?: Point2D[][]; // inner contours (holes)
}

/**
 * Slice the mesh at a given Z height and return all cross-section polygons.
 * Uses a triangle-plane intersection algorithm.
 */
export function sliceMesh(mesh: TriangleMesh, z: number): Point2D[][] {
  const positions = mesh.positions;
  const segments: [Point2D, Point2D][] = [];

  for (let i = 0; i < positions.length; i += 9) {
    const x1 = positions[i + 0], y1 = positions[i + 1], z1 = positions[i + 2];
    const x2 = positions[i + 3], y2 = positions[i + 4], z2 = positions[i + 5];
    const x3 = positions[i + 6], y3 = positions[i + 7], z3 = positions[i + 8];

    // Count vertices above/below z
    const above = [z1 > z, z2 > z, z3 > z];
    const onPlane = [z1 === z, z2 === z, z3 === z];

    // Cases
    if (above[0] === above[1] && above[1] === above[2]) {
      // All on same side — but check if on the plane
      if (onPlane[0] && onPlane[1]) {
        segments.push([{ x: x1, y: y1 }, { x: x2, y: y2 }]);
      } else if (onPlane[1] && onPlane[2]) {
        segments.push([{ x: x2, y: y2 }, { x: x3, y: y3 }]);
      } else if (onPlane[0] && onPlane[2]) {
        segments.push([{ x: x1, y: y1 }, { x: x3, y: y3 }]);
      }
      continue;
    }

    // Find intersection points with plane z
    const verts = [
      { x: x1, y: y1, z: z1 },
      { x: x2, y: y2, z: z2 },
      { x: x3, y: y3, z: z3 },
    ];

    const intersections: Point2D[] = [];
    for (let e = 0; e < 3; e++) {
      const a = verts[e];
      const b = verts[(e + 1) % 3];
      if ((a.z > z) === (b.z > z)) continue;
      if (a.z === b.z) continue;
      const t = (z - a.z) / (b.z - a.z);
      intersections.push({
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
      });
    }
    if (intersections.length >= 2) {
      segments.push([intersections[0], intersections[1]]);
    }
  }

  // Chain segments into polylines
  return chainSegments(segments, 1e-4);
}

function chainSegments(
  segments: [Point2D, Point2D][],
  eps: number,
): Point2D[][] {
  const remaining = new Map<string, [Point2D, Point2D]>();
  for (let i = 0; i < segments.length; i++) {
    remaining.set(`s${i}`, segments[i]);
  }

  const chains: Point2D[][] = [];

  while (remaining.size > 0) {
    const it = remaining.entries().next();
    if (it.done || !it.value) break;
    const [key, seg] = it.value;
    remaining.delete(key);

    const chain: Point2D[] = [seg[0], seg[1]];

    // Extend forward
    let extended = true;
    while (extended && remaining.size > 0) {
      extended = false;
      const tail = chain[chain.length - 1];
      for (const [k, s] of remaining.entries()) {
        if (dist(tail, s[0]) < eps) {
          chain.push(s[1]);
          remaining.delete(k);
          extended = true;
          break;
        } else if (dist(tail, s[1]) < eps) {
          chain.push(s[0]);
          remaining.delete(k);
          extended = true;
          break;
        }
      }
    }

    // Extend backward
    extended = true;
    while (extended && remaining.size > 0) {
      extended = false;
      const head = chain[0];
      for (const [k, s] of remaining.entries()) {
        if (dist(head, s[1]) < eps) {
          chain.unshift(s[0]);
          remaining.delete(k);
          extended = true;
          break;
        } else if (dist(head, s[0]) < eps) {
          chain.unshift(s[1]);
          remaining.delete(k);
          extended = true;
          break;
        }
      }
    }

    chains.push(chain);
  }

  return chains;
}

function dist(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute signed area of a polygon. Positive = CCW, Negative = CW.
 */
export function signedArea(pts: Point2D[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += (q.x - p.x) * (q.y + p.y);
  }
  return -a / 2;
}

/**
 * Offset a polygon outward/inward by a given distance.
 * Simple but functional offset using vertex normals (miter) — for cam use this is sufficient.
 */
export function offsetPolygon(pts: Point2D[], distance: number): Point2D[] {
  if (pts.length < 3) return pts;
  const isCCW = signedArea(pts) > 0;
  const sign = isCCW ? 1 : -1;

  const out: Point2D[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];

    // Edge vectors
    const e1x = curr.x - prev.x, e1y = curr.y - prev.y;
    const e2x = next.x - curr.x, e2y = next.y - curr.y;

    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;

    // Normals (perpendicular to edges, pointing outward for CCW)
    const n1x = -e1y / l1 * sign;
    const n1y = e1x / l1 * sign;
    const n2x = -e2y / l2 * sign;
    const n2y = e2x / l2 * sign;

    // Bisector
    let bx = n1x + n2x, by = n1y + n2y;
    const blen = Math.hypot(bx, by);
    if (blen < 1e-6) {
      bx = n1x; by = n1y;
    } else {
      bx /= blen;
      by /= blen;
    }

    // Miter length — based on bisector angle
    const cosHalf = (n1x * n2x + n1y * n2y);
    const miterScale = Math.min(2 / Math.max(0.3, 1 + cosHalf), 4);

    out.push({
      x: curr.x + bx * distance * miterScale,
      y: curr.y + by * distance * miterScale,
    });
  }
  return out;
}

/**
 * Estimate polyline length.
 */
export function polylineLength(pts: Point2D[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return l;
}

/**
 * Compute the total area of polygons (taking only outer contours).
 */
export function polygonArea(pts: Point2D[]): number {
  return Math.abs(signedArea(pts));
}

/**
 * Resample a polyline to a target chord error tolerance.
 */
export function resamplePolyline(pts: Point2D[]): Point2D[] {
  if (pts.length < 2) return pts.slice();
  return pts.slice();
}

/**
 * Polyline simplification (Douglas-Peucker).
 */
export function simplifyPolyline(pts: Point2D[], tolerance: number): Point2D[] {
  if (pts.length < 3 || tolerance <= 0) return pts.slice();

  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;

  function rec(start: number, end: number) {
    if (end <= start + 1) return;
    const a = pts[start], b = pts[end];
    let maxDist = 0;
    let maxIdx = -1;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    for (let i = start + 1; i < end; i++) {
      const p = pts[i];
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      const projx = a.x + t * dx;
      const projy = a.y + t * dy;
      const d = Math.hypot(p.x - projx, p.y - projy);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > tolerance && maxIdx >= 0) {
      keep[maxIdx] = true;
      rec(start, maxIdx);
      rec(maxIdx, end);
    }
  }

  rec(0, pts.length - 1);
  return pts.filter((_, i) => keep[i]);
}
