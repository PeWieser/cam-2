// CAM Engine — generates G-code from mesh + CAM parameters
import type { CamParams, TriangleMesh } from "../types/cam";
import {
  sliceMesh,
  simplifyPolyline,
  offsetPolygon,
  polylineLength,
  signedArea,
  type Point2D,
} from "./meshAnalysis";

export interface GCodeStats {
  totalLength: number;
  cutLength: number;
  rapidLength: number;
  cutTime: number;
  totalTime: number;
  toolpathLines: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
}

export interface GCodeResult {
  gcode: string;
  stats: GCodeStats;
  toolpath: Point2D[][];
  toolpathLayerZ: number;
  allLayerToolpaths?: { z: number; polylines: Point2D[][] }[];
}

interface Layer {
  z: number;
  contours: Point2D[][];
}

export function generateGCode(
  mesh: TriangleMesh,
  params: CamParams,
): GCodeResult {
  const {
    tool,
    strategy,
    contourSide,
    totalDepth,
    stepDown,
    feedRate,
    plungeRate,
    spindleRPM,
    safeZ,
    retractZ,
    useCoolant,
    originX,
    originY,
    originZ,
    cutTopZ,
    useTotalDepth,
    cutBottomZ,
    rampAngle,
    useTabs,
    tabWidth,
    tabCount,
    curveResolution,
    finishPass,
    finishStock,
    ignoreSmallFeatures,
    onlyTopLevel,
    workPlane,
  } = params;

  const topZ = cutTopZ;
  const botZ = useTotalDepth ? originZ - totalDepth : cutBottomZ;
  const meshBB = computeBoundingBox(mesh.positions);

  const sliceZValues: number[] = [];
  if (onlyTopLevel) {
    sliceZValues.push(meshBB.max[2]);
  } else {
    let z = topZ;
    while (z >= botZ + 1e-6) {
      sliceZValues.push(z);
      z -= stepDown;
    }
    if (sliceZValues.length === 0 || sliceZValues[sliceZValues.length - 1] > botZ) {
      sliceZValues.push(botZ);
    }
  }

  const layers: Layer[] = [];
  for (const z of sliceZValues) {
    const zSlice = z + 1e-4;
    const contours = sliceMesh(mesh, zSlice)
      .map((c) => simplifyPolyline(c, curveResolution * 0.1))
      .filter((c) => polylineLength(c) > ignoreSmallFeatures);

    if (contours.length === 0) continue;

    const outer = contours.filter((c) => signedArea(c) > 0);
    if (outer.length > 0) layers.push({ z, contours: outer });
  }

  if (layers.length === 0) {
    return emptyResult(meshBB);
  }

  const toolRadius = effectiveToolRadius(tool, layers[0].z - botZ);

  const cmds: string[] = [];
  const lines: Point2D[] = [];

  cmds.push("; MeshCAM — 3D zu G-Code Konverter");
  cmds.push("; Werkzeug: " + tool.type + " D=" + tool.diameter + "mm" + (tool.type === "vbit" ? " Winkel=" + tool.angle + "°" : ""));
  cmds.push("; Strategie: " + strategy);
  cmds.push("; Tiefe: " + totalDepth + "mm  Step-Down: " + stepDown + "mm");
  cmds.push("; Vorschub: " + feedRate + " mm/min  Eintauchen: " + plungeRate + " mm/min");
  cmds.push("; Drehzahl: " + spindleRPM + " RPM");
  cmds.push("");
  cmds.push("G21 G90 G17 G94");
  cmds.push("G53 G0 Z-10");
  cmds.push("");

  cmds.push("M3 S" + spindleRPM);
  if (useCoolant) cmds.push("M8");
  cmds.push("");

  cmds.push("G0 X" + fmt(originX) + " Y" + fmt(originY));
  cmds.push("G0 Z" + fmt(safeZ));
  cmds.push("");

  let totalLength = 0;
  let cutLength = 0;
  let rapidLength = 0;
  let lastX = originX, lastY = originY, lastZ = safeZ;

  const rampRadians = (rampAngle * Math.PI) / 180;

  for (const layer of layers) {
    const projectedContours = layer.contours.map((c) => projectContour(c, workPlane));
    const offsetPolylines: { poly: Point2D[]; depth: number }[] = [];

    if (strategy === "outline") {
      for (const c of projectedContours) {
        offsetPolylines.push({ poly: c, depth: layer.z - botZ });
      }
    } else if (strategy === "contour") {
      const dir = contourSide === "inside" ? -1 : 1;
      const depth = layer.z - botZ;
      for (const c of projectedContours) {
        const offset = offsetPolygon(c, dir * toolRadius);
        if (polylineLength(offset) > ignoreSmallFeatures) {
          offsetPolylines.push({ poly: offset, depth });
        }
      }
    } else if (strategy === "pocket") {
      const depth = layer.z - botZ;
      let r = toolRadius * 0.6;
      let safetyCounter = 0;
      while (safetyCounter++ < 100) {
        let added = false;
        for (const c of projectedContours) {
          const offset = offsetPolygon(c, -r);
          if (polylineLength(offset) < ignoreSmallFeatures) break;
          offsetPolylines.push({ poly: offset, depth });
          added = true;
        }
        if (!added) break;
        r += toolRadius * 0.6;
        if (r > 10000) break;
      }
    } else if (strategy === "vcarve") {
      const depth = params.centerlineDepth;
      for (const c of projectedContours) {
        offsetPolylines.push({ poly: c, depth });
      }
    } else if (strategy === "centerline") {
      const depth = params.centerlineDepth;
      for (const c of projectedContours) {
        offsetPolylines.push({ poly: c, depth });
      }
    }

    if (finishPass && (strategy === "contour" || strategy === "pocket")) {
      const fdepth = layer.z - botZ;
      const dir = contourSide === "inside" ? -1 : 1;
      for (const c of projectedContours) {
        const baseOffset = offsetPolygon(c, dir * toolRadius);
        const finishOffset = offsetPolygon(baseOffset, -dir * finishStock);
        if (polylineLength(finishOffset) > ignoreSmallFeatures) {
          offsetPolylines.push({ poly: finishOffset, depth: fdepth });
        }
      }
    }

    cmds.push("; --- Schicht Z=" + fmt(layer.z) + " (Tiefe=" + fmt(layer.z - botZ) + "mm) ---");

    for (const op of offsetPolylines) {
      if (op.poly.length < 2) continue;
      if (onlyTopLevel && layer.z < meshBB.max[2] - 0.001) continue;

      const tabs = useTabs && strategy !== "pocket" && strategy !== "vcarve" && strategy !== "centerline"
        ? generateTabs(op.poly, tabCount, tabWidth)
        : [];

      const pts = op.poly;
      const start = pts[0];

      cmds.push("G0 X" + fmt(start.x + originX) + " Y" + fmt(start.y + originY));
      const rapid1 = Math.hypot((start.x + originX) - lastX, (start.y + originY) - lastY);
      rapidLength += rapid1;
      lastX = start.x + originX;
      lastY = start.y + originY;

      const targetZ = layer.z - op.depth + originZ;
      if (rampAngle > 0 && rampAngle < 90 && stepDown > 0) {
        let currentZ = safeZ;
        let currentX = lastX;
        let currentY = lastY;
        const dirVec = pointsDirection(pts);

        while (currentZ > targetZ) {
          const nextZ = Math.max(targetZ, currentZ - stepDown);
          const stepLen = (currentZ - nextZ) / Math.tan(rampRadians);
          currentX += dirVec.x * stepLen;
          currentY += dirVec.y * stepLen;
          cmds.push("G1 X" + fmt(currentX) + " Y" + fmt(currentY) + " Z" + fmt(nextZ) + " F" + fmt(plungeRate));
          cutLength += Math.hypot(currentX - lastX, currentY - lastY) + (currentZ - nextZ);
          lastX = currentX; lastY = currentY; currentZ = nextZ;
        }
        lastZ = currentZ;
      } else {
        cmds.push("G1 Z" + fmt(targetZ) + " F" + fmt(plungeRate));
        cutLength += Math.abs(lastZ - targetZ);
        lastZ = targetZ;
      }

      emitCutPolyline(cmds, pts, originX, originY, layer.z - op.depth + originZ, feedRate, tabs);

      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        cutLength += Math.hypot(dx, dy);
      }
      totalLength += cutLength;

      cmds.push("G0 Z" + fmt(retractZ + originZ));
      rapidLength += Math.abs(lastZ - (retractZ + originZ));
      lastZ = retractZ + originZ;
    }

    // Store toolpath points for visualization
    for (const op of offsetPolylines) {
      for (const p of op.poly) {
        lines.push({ x: p.x + originX, y: p.y + originY });
      }
    }
  }

  cmds.push("");
  cmds.push("; --- Ende ---");
  cmds.push("M5");
  cmds.push("M9");
  cmds.push("G53 G0 Z-10");
  cmds.push("G53 G0 X0 Y0");
  cmds.push("M30");

  const gcode = cmds.join("\n");

  const cutTime = cutLength / Math.max(1, feedRate) * 60;
  const rapidTime = rapidLength / Math.max(1, params.rapidRate) * 60;
  const totalTime = cutTime + rapidTime + 5;

  // Build per-layer toolpaths for visualization
  const allLayerToolpaths: { z: number; polylines: Point2D[][] }[] = [];
  for (const layer of layers) {
    const polylines: Point2D[][] = [];
    for (const c of layer.contours) {
      const projected = projectContour(c, workPlane);
      if (strategy === "contour" || strategy === "pocket") {
        const dir = contourSide === "inside" ? -1 : 1;
        const offset = offsetPolygon(projected, dir * toolRadius);
        polylines.push(offset.map((p) => ({ x: p.x + originX, y: p.y + originY })));
      } else {
        polylines.push(projected.map((p) => ({ x: p.x + originX, y: p.y + originY })));
      }
    }
    allLayerToolpaths.push({ z: layer.z, polylines });
  }

  const firstLayer = layers[0];
  const tpToolpath: Point2D[][] = firstLayer
    ? (allLayerToolpaths[0]?.polylines ?? [])
    : [];

  void lines;

  return {
    gcode,
    stats: {
      totalLength,
      cutLength,
      rapidLength,
      cutTime,
      totalTime,
      toolpathLines: lines.length,
      bbox: meshBB,
    },
    toolpath: tpToolpath,
    toolpathLayerZ: firstLayer ? firstLayer.z : 0,
    allLayerToolpaths,
  };
}

function projectContour(c: Point2D[], _plane: "xy" | "xz" | "yz"): Point2D[] {
  return c.slice();
}

function effectiveToolRadius(tool: { type: string; diameter: number; angle: number }, depth: number): number {
  if (tool.type === "vbit") {
    const rad = (tool.angle * Math.PI) / 360;
    return depth * Math.tan(rad);
  }
  return tool.diameter / 2;
}

function pointsDirection(pts: Point2D[]): Point2D {
  if (pts.length < 2) return { x: 1, y: 0 };
  const a = pts[0], b = pts[1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

function emitCutPolyline(
  cmds: string[],
  pts: Point2D[],
  originX: number,
  originY: number,
  z: number,
  feed: number,
  tabs: { from: number; to: number }[],
) {
  if (pts.length < 2) return;
  for (let i = 0; i < pts.length - 1; i++) {
    const inTab = tabs.some((t) => i >= t.from && i < t.to);
    if (inTab) {
      cmds.push("G0 X" + fmt(pts[i + 1].x + originX) + " Y" + fmt(pts[i + 1].y + originY) + " Z" + fmt(z + 0.5));
    } else {
      cmds.push("G1 X" + fmt(pts[i + 1].x + originX) + " Y" + fmt(pts[i + 1].y + originY) + " Z" + fmt(z) + " F" + fmt(feed));
    }
  }
}

function generateTabs(poly: Point2D[], count: number, width: number): { from: number; to: number }[] {
  if (count <= 0 || poly.length < 4) return [];
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < poly.length; i++) {
    const d = Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
    segs.push(d);
    total += d;
  }
  if (total < 1) return [];
  const tabs: { from: number; to: number }[] = [];
  const tabSpacing = total / count;
  for (let k = 0; k < count; k++) {
    const center = k * tabSpacing + tabSpacing / 2;
    let acc = 0;
    let startIdx = -1, endIdx = -1;
    for (let i = 0; i < segs.length; i++) {
      if (acc + segs[i] >= center - width / 2 && startIdx === -1) startIdx = i;
      if (acc + segs[i] >= center + width / 2) {
        endIdx = i + 1;
        break;
      }
      acc += segs[i];
    }
    if (startIdx > 0 && endIdx > startIdx) {
      tabs.push({ from: startIdx, to: endIdx });
    }
  }
  return tabs;
}

function computeBoundingBox(positions: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

function emptyResult(bbox: { min: [number, number, number]; max: [number, number, number] }): GCodeResult {
  return {
    gcode: "; Keine Schnittkonturen gefunden — Modell ist evtl. zu flach oder leer",
    stats: {
      totalLength: 0, cutLength: 0, rapidLength: 0,
      cutTime: 0, totalTime: 0, toolpathLines: 0,
      bbox,
    },
    toolpath: [],
    toolpathLayerZ: 0,
  };
}

function fmt(n: number): string {
  return n.toFixed(3);
}
