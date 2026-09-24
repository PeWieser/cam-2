/**
 * Testaufbau & Diagnose-Werkzeug für die Mittellinie (Gravura Centerline Engine)
 * 
 * Führt vollständige geometrische Prüfungen durch:
 * 1. Ziffern 0-9 in Geist Sans & DejaVu Sans
 * 2. Ecken-Häkchen-Erkennung (0° bis 90° rotierte Striche, Ziffer 7)
 * 3. Doppellinien- / Retrace-Erkennung (Vor- und Rücklauf auf demselben Segment)
 * 4. Erzeugt einen interaktiven visuellen SVG/HTML-Prüfbericht: test-centerline-report.html
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import opentype from 'opentype.js';

const ROOT = process.cwd();
const BUNDLE_PATH = path.join(ROOT, '.scratch_centerline.cjs');

// 1. Centerline bündeln
console.log('📦 Bündle src/lib/centerline.ts für den Testaufbau...');
execSync(`npx esbuild "${path.join(ROOT, 'src/lib/centerline.ts')}" --bundle --format=cjs --outfile="${BUNDLE_PATH}"`, { stdio: 'pipe' });

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { computeCenterlines } = require(BUNDLE_PATH);

// Hilfsfunktionen für Glyphen-Extraktion
function glyphToContours(fontPath, char, sizeMm = 12) {
  const buf = fs.readFileSync(fontPath);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const glyph = font.charToGlyph(char);
  const p = glyph.getPath(0, 0, sizeMm);
  const cmds = p.commands;
  const contours = [];
  let cur = [];
  for (const cmd of cmds) {
    if (cmd.type === 'M') {
      if (cur.length >= 3) contours.push(cur);
      cur = [{ x: cmd.x, y: -cmd.y }];
    } else if (cmd.type === 'L') {
      cur.push({ x: cmd.x, y: -cmd.y });
    } else if (cmd.type === 'Q') {
      const last = cur[cur.length - 1];
      for (let t = 0.25; t <= 1; t += 0.25) {
        const inv = 1 - t;
        cur.push({
          x: inv * inv * last.x + 2 * inv * t * cmd.x1 + t * t * cmd.x,
          y: -(inv * inv * (-last.y) + 2 * inv * t * cmd.y1 + t * t * cmd.y),
        });
      }
    } else if (cmd.type === 'C') {
      const last = cur[cur.length - 1];
      for (let t = 0.2; t <= 1; t += 0.2) {
        const inv = 1 - t;
        cur.push({
          x: inv * inv * inv * last.x + 3 * inv * inv * t * cmd.x1 + 3 * inv * t * t * cmd.x2 + t * t * t * cmd.x,
          y: -(inv * inv * inv * (-last.y) + 3 * inv * inv * t * cmd.y1 + 3 * inv * t * t * cmd.y2 + t * t * t * cmd.y),
        });
      }
    } else if (cmd.type === 'Z') {
      if (cur.length >= 3) contours.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 3) contours.push(cur);

  return contours.map((pts, idx) => {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      area += a.x * b.y - b.x * a.y;
    }
    return {
      id: idx,
      level: 0,
      z: 0,
      pts,
      closed: true,
      area: Math.abs(area) / 2,
      length: 10,
      depth: 0,
      isOuter: true,
    };
  });
}

function makeRotatedRect(w, h, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const hw = w / 2, hh = h / 2;
  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  const pts = corners.map((p) => ({
    x: 10 + p.x * cos - p.y * sin,
    y: 10 + p.x * sin + p.y * cos,
  }));
  return [{ id: 1, level: 0, z: 0, pts, closed: true, area: w * h, length: 2 * (w + h), depth: 0, isOuter: true }];
}

// Erkennung von Doppellinien / Retraces (Segment wird in umgekehrter Richtung erneut befahren)
function detectRetrace(pts) {
  let retraceLen = 0;
  const segments = [];
  const retraceSegments = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-4) continue;
    let isRetrace = false;
    for (const seg of segments) {
      // Prüfe, ob Segment entgegengesetzt parallel und nah beieinander liegt
      const d1 = Math.hypot(seg.a.x - b.x, seg.a.y - b.y);
      const d2 = Math.hypot(seg.b.x - a.x, seg.b.y - a.y);
      if (d1 < 0.12 && d2 < 0.12) {
        retraceLen += len;
        isRetrace = true;
        retraceSegments.push({ a, b });
        break;
      }
    }
    segments.push({ a, b, len });
  }
  return { retraceLen, retraceSegments };
}

function interpPoint(arr, targetDist) {
  let d = 0;
  for (let i = 1; i < arr.length; i++) {
    const segLen = Math.hypot(arr[i].x - arr[i - 1].x, arr[i].y - arr[i - 1].y);
    if (d + segLen >= targetDist) {
      const t = (targetDist - d) / segLen;
      return {
        x: arr[i - 1].x + t * (arr[i].x - arr[i - 1].x),
        y: arr[i - 1].y + t * (arr[i].y - arr[i - 1].y),
      };
    }
    d += segLen;
  }
  return arr[arr.length - 1];
}

// Erkennung von Eckenhäkchen an Endpunkten (Knick am Strichende oder Hineinziehen in eine Ecke)
function detectCornerHook(pts, cs) {
  if (pts.length < 3) return { hasHook: false, deviationDeg: 0 };
  
  // 1. Scharfe Ecken der Kontur ermitteln (> 45° Richtungsänderung)
  const corners = [];
  for (const c of cs) {
    const raw = c.pts;
    const clean = [];
    for (let i = 0; i < raw.length; i++) {
      const prev = clean[clean.length - 1];
      if (!prev || Math.hypot(raw[i].x - prev.x, raw[i].y - prev.y) > 1e-4) clean.push(raw[i]);
    }
    const n = clean.length;
    for (let i = 0; i < n; i++) {
      const p = clean[i], a = clean[(i + n - 1) % n], b = clean[(i + 1) % n];
      const e1x = p.x - a.x, e1y = p.y - a.y;
      const e2x = b.x - p.x, e2y = b.y - p.y;
      const l1 = Math.hypot(e1x, e1y), l2 = Math.hypot(e2x, e2y);
      if (l1 < 1e-4 || l2 < 1e-4) continue;
      const cos = Math.max(-1, Math.min(1, (e1x * e2x + e1y * e2y) / (l1 * l2)));
      if (Math.acos(cos) > 0.7) corners.push(p);
    }
  }

  // 2. Winkelabweichung an den Endpunkten über den physischen Strichweg interpolieren (0.25 mm vs. 0.85 mm)
  let maxDev = 0;
  for (const isEnd of [false, true]) {
    const arr = isEnd ? pts.slice().reverse() : pts;
    const tip = arr[0];
    let totalL = 0;
    for (let i = 1; i < arr.length; i++) totalL += Math.hypot(arr[i].x - arr[i - 1].x, arr[i].y - arr[i - 1].y);
    if (totalL < 0.9) continue;

    const pNear = interpPoint(arr, 0.25);
    const pFar = interpPoint(arr, 0.85);
    const v1x = tip.x - pNear.x, v1y = tip.y - pNear.y;
    const v2x = pNear.x - pFar.x, v2y = pNear.y - pFar.y;
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    if (l1 > 1e-4 && l2 > 1e-4) {
      const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
      const deg = (Math.acos(cos) * 180) / Math.PI;
      if (deg > maxDev) maxDev = deg;
    }

    // Prüfe, ob die Spitze auffällig nah an eine Konturecke hineingezogen ist (< 0.22 mm bei ~1mm Strich)
    if (corners.length) {
      const minCornerDist = Math.min(...corners.map((c) => Math.hypot(c.x - tip.x, c.y - tip.y)));
      if (minCornerDist < 0.22) {
        // Spitze klebt in der Ecke
        if (maxDev < 45) maxDev = 45;
      }
    }
  }
  return { hasHook: maxDev > 40, deviationDeg: maxDev };
}

// ---------------------------------------------------------------------------
// TESTSUITE DURCHFÜHREN
// ---------------------------------------------------------------------------

const results = [];
const fonts = [
  { name: 'Geist Sans', path: path.join(ROOT, 'assets/fonts/geist-latin-subset.ttf') },
  { name: 'DejaVu Sans', path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf' },
];

console.log('\n🔍 Starte Prüfung aller Ziffern 0–9 auf Doppellinien & Strichanzahl...\n');

for (const font of fonts) {
  if (!fs.existsSync(font.path)) continue;
  for (const digit of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    const cs = glyphToContours(font.path, digit, 12);
    const pieces = computeCenterlines(cs, 0.03, 8);
    let totalLen = 0;
    let totalRetrace = 0;
    const allRetraces = [];
    for (const p of pieces) {
      let l = 0;
      for (let i = 1; i < p.pts.length; i++) l += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y);
      totalLen += l;
      const { retraceLen, retraceSegments } = detectRetrace(p.pts);
      totalRetrace += retraceLen;
      allRetraces.push(...retraceSegments);
    }
    const { hasHook, deviationDeg } = pieces[0] ? detectCornerHook(pieces[0].pts, cs) : { hasHook: false, deviationDeg: 0 };
    const passRetrace = totalRetrace < 0.05;
    const passPieces = digit === '1' ? pieces.length <= 2 : pieces.length <= 3;
    const passHook = !hasHook;
    const ok = passRetrace && passPieces && passHook;

    results.push({
      type: 'digit',
      font: font.name,
      id: digit,
      cs,
      pieces,
      totalLen,
      totalRetrace,
      allRetraces,
      hasHook,
      deviationDeg,
      ok,
    });

    const statusIcon = ok ? '✅' : '❌';
    const retraceMsg = totalRetrace > 0.05 ? `Doppellinie: ${totalRetrace.toFixed(2)} mm!` : 'keine Doppellinie';
    const hookMsg = hasHook ? `Häkchen ${deviationDeg.toFixed(0)}°!` : 'glatt';
    console.log(`  ${statusIcon} ${font.name} "${digit}": ${pieces.length} Zug/Züge, ${totalLen.toFixed(1)} mm | ${retraceMsg} | ${hookMsg}`);
  }
}

console.log('\n🔍 Starte Prüfung rotierter Rechtecke (Eckenhäkchen 0° bis 90°)...\n');
for (const ang of [0, 15, 30, 45, 60, 75, 90]) {
  const cs = makeRotatedRect(20, 2, ang);
  const pieces = computeCenterlines(cs, 0.03, 8);
  let totalLen = 0;
  for (const p of pieces) {
    for (let i = 1; i < p.pts.length; i++) totalLen += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y);
  }
  const { hasHook, deviationDeg } = pieces[0] ? detectCornerHook(pieces[0].pts, cs) : { hasHook: false, deviationDeg: 0 };
  const ok = pieces.length === 1 && !hasHook;

  results.push({
    type: 'rect',
    font: 'Geometrie',
    id: `Rechteck ${ang}°`,
    cs,
    pieces,
    totalLen,
    totalRetrace: 0,
    allRetraces: [],
    hasHook,
    deviationDeg,
    ok,
  });

  const statusIcon = ok ? '✅' : '❌';
  console.log(`  ${statusIcon} Rechteck ${ang}°: ${pieces.length} Zug, ${totalLen.toFixed(2)} mm | Häkchen: ${hasHook ? `${deviationDeg.toFixed(0)}°` : 'nein'}`);
}

// ---------------------------------------------------------------------------
// HTML-REPORT GENERIEREN
// ---------------------------------------------------------------------------

function renderSvgCard(r) {
  // Bounding box berechnen
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of r.cs) {
    for (const p of c.pts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
  }
  const pad = 1.2;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const w = maxX - minX, h = maxY - minY;
  const scale = 24; // Pixel pro mm

  // Kontur-Pfad
  const contourPaths = r.cs.map((c) => {
    const d = c.pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x - minX) * scale} ${(maxY - p.y) * scale}`).join(' ') + ' Z';
    return `<path d="${d}" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.2" fill-rule="evenodd" />`;
  }).join('\n');

  // Mittellinien
  const colors = ['#0284c7', '#059669', '#d97706', '#dc2626'];
  const clSvg = r.pieces.map((p, pIdx) => {
    const d = p.pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${(pt.x - minX) * scale} ${(maxY - pt.y) * scale}`).join(' ');
    const col = colors[pIdx % colors.length];
    // Start- und Endpunkt
    const sPt = p.pts[0], ePt = p.pts[p.pts.length - 1];
    const sCircle = `<circle cx="${(sPt.x - minX) * scale}" cy="${(maxY - sPt.y) * scale}" r="3.5" fill="#16a34a" />`;
    const eSquare = `<rect x="${(ePt.x - minX) * scale - 3}" y="${(maxY - ePt.y) * scale - 3}" width="6" height="6" fill="#dc2626" />`;
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            ${sCircle} ${eSquare}`;
  }).join('\n');

  // Retrace-Linien (Doppellinien) in grellem Rot blinkend/dick markieren
  const retraceSvg = r.allRetraces.map((seg) => {
    const x1 = (seg.a.x - minX) * scale, y1 = (maxY - seg.a.y) * scale;
    const x2 = (seg.b.x - minX) * scale, y2 = (maxY - seg.b.y) * scale;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ef4444" stroke-width="5" stroke-dasharray="3,2" opacity="0.8" />`;
  }).join('\n');

  return `
    <div style="border: 1px solid ${r.ok ? '#cbd5e1' : '#f87171'}; border-radius: 8px; padding: 12px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
        <span style="font-weight: 600; font-size: 14px;">${r.font}: ${r.id}</span>
        <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 600; ${r.ok ? 'background: #dcfce7; color: #166534;' : 'background: #fee2e2; color: #991b1b;'}">
          ${r.ok ? 'BESTANDEN' : 'DEFEKT'}
        </span>
      </div>
      <div style="text-align: center; background: #fafafa; border: 1px solid #f1f5f9; border-radius: 6px; padding: 8px; overflow: auto;">
        <svg width="${Math.ceil(w * scale)}" height="${Math.ceil(h * scale)}" viewBox="0 0 ${w * scale} ${h * scale}" style="display: inline-block;">
          ${contourPaths}
          ${clSvg}
          ${retraceSvg}
        </svg>
      </div>
      <div style="font-family: monospace; font-size: 11px; color: #475569; margin-top: 8px; line-height: 1.5;">
        <div>Züge: <b>${r.pieces.length}</b> · Länge: <b>${r.totalLen.toFixed(1)} mm</b></div>
        <div>Doppellinie: <b style="${r.totalRetrace > 0.05 ? 'color:#dc2626' : 'color:#16a34a'}">${r.totalRetrace.toFixed(2)} mm</b></div>
        <div>Häkchen: <b style="${r.hasHook ? 'color:#dc2626' : 'color:#16a34a'}">${r.hasHook ? `${r.deviationDeg.toFixed(0)}°` : 'Nein'}</b></div>
      </div>
    </div>
  `;
}

const htmlReport = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>Gravura – Mittellinien-Prüfbericht (Testaufbau)</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { color: #64748b; font-size: 13px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .legend { display: flex; gap: 16px; margin-bottom: 16px; font-size: 12px; background: white; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
  </style>
</head>
<body>
  <h1>Gravura – Mittellinien-Prüfbericht & Diagnose</h1>
  <div class="subtitle">Automatisch erzeugt durch den Testaufbau · Prüfung auf Doppellinien, Ziffernzüge und Eckenhäkchen</div>

  <div class="legend">
    <span><span class="dot" style="background: #16a34a;"></span> Startpunkt</span>
    <span><span class="dot" style="background: #dc2626; border-radius: 2px;"></span> Endpunkt</span>
    <span><span class="dot" style="background: #0284c7;"></span> Mittellinie (Zulauf)</span>
    <span><span class="dot" style="background: #ef4444;"></span> Doppellinie / Retrace (Rot gestrichelt)</span>
  </div>

  <div class="grid">
    ${results.map(renderSvgCard).join('\n')}
  </div>
</body>
</html>`;

const reportPath = path.join(ROOT, 'test-centerline-report.html');
fs.writeFileSync(reportPath, htmlReport);
console.log(`\n📄 Visueller HTML-Prüfbericht geschrieben nach: ${reportPath}`);

// Cleanup scratch bundle
try { fs.unlinkSync(BUNDLE_PATH); } catch {}

const failedCount = results.filter((r) => !r.ok).length;
console.log(`\n📊 ZUSAMMENFASSUNG: ${results.length - failedCount} / ${results.length} Tests bestanden (${failedCount} Defekte gefunden).\n`);
