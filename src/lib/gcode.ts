import { OP_LABEL, type Op, type Settings, type Toolpath } from '../types';

const f = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

export function safeZ(s: Settings) {
  return (s.originZ === 'top' ? 0 : s.material) + s.safeZ;
}

export function fillPlaceholders(block: string, s: Settings): string {
  return block
    .replace(/\{rpm\}/g, String(Math.round(s.rpm)))
    .replace(/\{safe\}/g, f(safeZ(s)))
    .replace(/\{feed\}/g, f(s.feedXY));
}

export function generateGcode(tp: Toolpath, s: Settings, fileName: string): string {
  const L: string[] = [];
  const ops = (Object.keys(tp.counts) as Op[]).filter((o) => tp.counts[o] > 0).map((o) => `${OP_LABEL[o]} ×${tp.counts[o]}`).join(', ');
  L.push(`; ${fileName}`);
  L.push(`; Werkzeug ${s.tool.tipAngle > 0 ? `V-Stichel ${s.tool.tipAngle}°` : 'Schaftfraeser'} Ø${f(s.tool.tipDia)} mm | ${ops}`);
  L.push(`; Gravur ${f(s.engraveDepth)} mm${tp.counts.pocket ? ` | Tasche ${f(s.pocketDepth)} mm` : ''}${tp.counts.cut ? ` | Durchbruch ${f(s.material + s.cutOvershoot)} mm` : ''} | Zustellung ${f(s.stepDown)} mm`);
  L.push(`; Nullpunkt ${s.originXY}, Z0 = ${s.originZ === 'top' ? 'Oberflaeche' : 'Unterseite'} | Bereich X ${f(tp.bounds.minX)}..${f(tp.bounds.maxX)} Y ${f(tp.bounds.minY)}..${f(tp.bounds.maxY)}`);
  L.push('');
  L.push('; --- Start ---');
  L.push(fillPlaceholders(s.startBlock, s).trim());
  L.push('');

  const first = tp.moves[0];
  L.push(`G0 Z${f(first.z)}`);
  let lx = NaN, ly = NaN, lz = first.z, lf = NaN, lop: Op | null = null;
  for (let i = 1; i < tp.moves.length; i++) {
    const m = tp.moves[i];
    if (!m.rapid && m.op !== lop) { L.push(`; ${OP_LABEL[m.op]}`); lop = m.op; }
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
