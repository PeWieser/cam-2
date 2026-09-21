/**
 * Erzeugt die Raster-Icons aus der Vektorquelle src/assets/favicon.svg:
 *   favicon.ico (16/32/48),
 *   icon-192.png, icon-512.png (runde Kachel, transparent),
 *   icon-maskable-512.png und apple-touch-icon-{120,152,167,180}.png
 *   (randlos: Android maskiert selbst, iOS rundet selbst und will keine Transparenz)
 * Außerdem wird das Vektor-Icon als Data-URI in index.html geschrieben, damit der
 * Single-File-Build ohne Neben-Dateien funktioniert.
 *
 *   npm run icons
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/assets/favicon.svg'), 'utf8');
const outDir = resolve(root, 'public');

/** Maskable / iOS: randlos füllen, Motiv auf ~62 % verkleinert (Safe Zone der Masken). */
const maskable = (() => {
  const plain = source.replace('rx="7.5"', 'rx="0"');
  const from = plain.indexOf('<path'); // das Motiv (erste und einzige Path)
  const to = plain.lastIndexOf('/>'); // dessen Abschluss
  if (from < 0 || to < from) throw new Error('Motiv-Pfad in src/assets/favicon.svg nicht gefunden');
  const wrap = '<g transform="translate(16 16) scale(0.62) translate(-16 -16)">';
  return plain.slice(0, from) + wrap + plain.slice(from, to) + '/></g>' + plain.slice(to + 2);
})();

const render = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

const png = (svg, size, file) => {
  const data = render(svg, size);
  writeFileSync(resolve(outDir, file), data);
  console.log(`${file.padEnd(24)} ${size}px  ${(data.length / 1024).toFixed(1)} kB`);
};

/** ICO-Container mit PNG-Nutzlasten (von allen aktuellen Browsern unterstützt). */
const ico = (sizes, file) => {
  const parts = sizes.map((size) => ({ size, data: render(source, size) }));
  const dir = Buffer.alloc(6 + 16 * parts.length);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(parts.length, 4);
  let offset = dir.length;
  parts.forEach(({ size, data }, i) => {
    const o = 6 + 16 * i;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4); // Farbzahl
    dir.writeUInt16LE(32, o + 6); // Bits pro Pixel
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  const data = Buffer.concat([dir, ...parts.map((p) => p.data)]);
  writeFileSync(resolve(outDir, file), data);
  console.log(`${file.padEnd(24)} ${sizes.join('/')}  ${(data.length / 1024).toFixed(1)} kB`);
};

/** Vektor-Icon als Data-URI in index.html einbetten – der Single-File-Build bleibt selbstständig. */
const inlineSvg = () => {
  const svg = source
    .split('<!--').map((part, i) => (i === 0 ? part : part.slice(part.indexOf('-->') + 3))).join('')
    .split('\n').map((line) => line.trim()).join('');
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const file = resolve(root, 'index.html');
  const html = readFileSync(file, 'utf8');
  const marker = 'type="image/svg+xml" href="';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('Icon-Link in index.html nicht gefunden');
  const from = start + marker.length;
  const to = html.indexOf('"', from);
  const next = html.slice(0, from) + uri + html.slice(to);
  if (next === html) return console.log(`${'index.html'.padEnd(24)} inline  unverändert`);
  writeFileSync(file, next);
  console.log(`${'index.html'.padEnd(24)} inline  ${(uri.length / 1024).toFixed(1)} kB`);
};

mkdirSync(outDir, { recursive: true });
png(source, 192, 'icon-192.png');
png(source, 512, 'icon-512.png');
png(maskable, 512, 'icon-maskable-512.png');
for (const size of [120, 152, 167, 180]) png(maskable, size, `apple-touch-icon-${size}.png`);
ico([16, 32, 48], 'favicon.ico');
inlineSvg();
