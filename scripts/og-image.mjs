/**
 * Erzeugt das Link-Vorschaubild public/og-image.png (1200×630) aus src/assets/og-image.svg.
 * Wird von WhatsApp, Teams, Telegram, Slack & Co. angezeigt, wenn jemand die Adresse teilt.
 *
 *   npm run og
 *
 * Schrift: Die Vorlage nutzt „Geist“ – liegt die Schrift als TTF/OTF unter assets/fonts/,
 * wird sie eingebettet, sonst greift resvg auf eine Systemschrift zurück (und warnt).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'assets/fonts');
const fontFiles = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(ttf|otf|ttc)$/i.test(f)).map((f) => resolve(dir, f)) : [];
if (!fontFiles.length) console.warn('! Keine Schriftdatei unter assets/fonts/ – das Vorschaubild nutzt eine Systemschrift.');

const svg = readFileSync(resolve(root, 'src/assets/og-image.svg'), 'utf8');
const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { fontFiles, loadSystemFonts: true, defaultFontFamily: fontFiles.length ? 'Geist SemiBold' : undefined },
}).render().asPng();

mkdirSync(resolve(root, 'public'), { recursive: true });
writeFileSync(resolve(root, 'public/og-image.png'), png);
console.log(`og-image.png  1200×630  ${(png.length / 1024).toFixed(1)} kB`);
