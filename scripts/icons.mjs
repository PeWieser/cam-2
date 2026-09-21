/**
 * Erzeugt die Raster-Icons aus der Vektorquelle src/assets/favicon.svg:
 *   favicon.ico (16/32/48), apple-touch-icon.png (180),
 *   icon-192.png, icon-512.png, icon-maskable-512.png (randlos, Safe Zone)
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

/** Maskable: randlos füllen, Motiv auf ~62 % verkleinert (Safe Zone der Android-Maske). */
const maskable = source
  .replace('rx="7.5"', 'rx="0"')
  .replace(/(<path[^>]*\/>)/, '<g transform="translate(16 16) scale(0.62) translate(-16 -16)">$1</g>');

const render = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

const png = (svg, size, file) => {
  const data = render(svg, size);
  writeFileSync(resolve(outDir, file), data);
  console.log(`${file.padEnd(22)} ${size}px  ${(data.length / 1024).toFixed(1)} kB`);
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
  console.log(`${file.padEnd(22)} ${sizes.join('/')}  ${(data.length / 1024).toFixed(1)} kB`);
};

/** Vektor-Icon als Data-URI in index.html einbetten – der Single-File-Build bleibt selbstständig. */
const inlineSvg = () => {
  const svg = source.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\n\s*/g, '').trim();
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const file = resolve(root, 'index.html');
  const html = readFileSync(file, 'utf8');
  const next = html.replace(/(<link rel="icon" type="image\/svg\+xml" href=")[^"]*(")/, `$1${uri}$2`);
  if (next === html) throw new Error('Icon-Link in index.html nicht gefunden');
  writeFileSync(file, next);
  console.log(`${'index.html'.padEnd(22)} inline  ${(uri.length / 1024).toFixed(1)} kB`);
};

mkdirSync(outDir, { recursive: true });
png(source, 192, 'icon-192.png');
png(source, 512, 'icon-512.png');
png(source, 180, 'apple-touch-icon.png');
png(maskable, 512, 'icon-maskable-512.png');
ico([16, 32, 48], 'favicon.ico');
inlineSvg();
