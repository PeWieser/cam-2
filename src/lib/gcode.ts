import type { Settings, Toolpath } from '../types';

const f = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

export function fillPlaceholders(block: string, s: Settings): string {
  const zSafe = (s.originZ === 'top' ? 0 : s.depth) + s.safeZ;
  return block
    .replace(/\{rpm\}/g, String(Math.round(s.rpm)))
    .replace(/\{safe\}/g, f(zSafe))
    .replace(/\{feed\}/g, f(s.feedXY));
}

export function generateGcode(tp: Toolpath, s: Settings, fileName: string): string {
  const L: string[] = [];
  L.push(`; ${fileName} – Gravur mit Stichel ${s.tool.tipAngle}° / ${f(s.tool.tipDia)} mm`);
  L.push(`; Tiefe ${f(s.depth)} mm in ${tp.passes} Zustellung(en), Nullpunkt ${s.originXY}, Z0 = ${s.originZ === 'top' ? 'Oberflaeche' : 'Gravurgrund'}`);
  L.push(`; Bereich X ${f(tp.bounds.minX)}..${f(tp.bounds.maxX)}  Y ${f(tp.bounds.minY)}..${f(tp.bounds.maxY)} mm`);
  L.push('');
  L.push('; --- Start ---');
  L.push(fillPlaceholders(s.startBlock, s).trim());
  L.push('');

  // Immer zuerst sicher abheben – unabhängig vom Startblock
  const first = tp.moves[0];
  L.push(`G0 Z${f(first.z)}`);
  let lx = NaN, ly = NaN, lz = first.z, lf = NaN;
  for (let i = 1; i < tp.moves.length; i++) {
    const m = tp.moves[i];
    const parts: string[] = [];
    if (m.x !== lx) parts.push(`X${f(m.x)}`);
    if (m.y !== ly) parts.push(`Y${f(m.y)}`);
    if (m.z !== lz) parts.push(`Z${f(m.z)}`);
    if (!parts.length) continue;
    const isPlunge = !m.rapid && m.x === lx && m.y === ly;
    const feed = isPlunge ? s.feedZ : s.feedXY;
    let line = (m.rapid ? 'G0 ' : 'G1 ') + parts.join(' ');
    if (!m.rapid && feed !== lf) { line += ` F${f(feed)}`; lf = feed; }
    L.push(line);
    lx = m.x; ly = m.y; lz = m.z;
  }

  L.push('');
  L.push('; --- Ende ---');
  L.push(fillPlaceholders(s.endBlock, s).trim());
  L.push('');
  return L.join('\n');
}
