# Gravura

**From a 3D model to engraving G-code – in the browser, on your own machine.**

Gravura slices a 3D model horizontally, turns the resulting contours into toolpaths and writes the
G-code for engraved front panels: lettering, scales, pockets, holes and the panel outline. It runs
entirely client-side, needs no account and uploads nothing.

🌐 Try it: <https://cam.mankind.lol>

---

## What it does

| | |
| --- | --- |
| **Import** | STL, OBJ, 3MF, STEP, IGES, BREP – drag and drop or file picker |
| **Orient** | pick the top face, rotate in 90° steps, mirror for engraving from the back, inch → mm |
| **Slice** | up to four horizontal planes; contours are shown live on the model |
| **Origin** | 3 × 3 grid plus Z reference (top surface or spoil board) |
| **Operations** | per contour: engrave, pocket, cut through or skip – assigned by clicking the line |
| **Strategy** | outline or centre line, depths, step-over, step-down, safe height |
| **Cutting** | tabs on the outline, lead-in overshoot, climb/conventional, tool-radius compensation |
| **Tool** | V-bit (angle, tip width) or end mill; engraving width is calculated from depth |
| **Verify** | toolpath statistics, 3D preview and a simulation you can scrub through |
| **Program** | start/end blocks, presets for GRBL, LinuxCNC/Mach3 and Marlin, placeholders for rpm, feed and safe height |
| **Export** | download `.gcode`, copy with <kbd>Ctrl</kbd>+<kbd>C</kbd>, syntax-highlighted code view |

Every step is undoable with <kbd>Ctrl</kbd>+<kbd>Z</kbd>.

## Three modes

The header switches between three modes – the choice and all settings are kept in the browser.

| Mode (UI) | Steps | Left out |
| --- | --- | --- |
| **Einfach** (Simple) | Model → Engraving → Calculate → Export | orientation, slice planes, origin, contour assignment, tool – all use proven defaults |
| **Standard** | all ten | fine-tuning: curve tolerance, step-over, radius compensation, tab sizes, scale, plunge rate, custom program lines |
| **Experte** (Expert) | all ten | nothing |

## Getting started

```bash
npm install
npm run dev        # dev server on http://localhost:5173
```

Requires Node 20 or newer (developed on Node 22).

| Script | Purpose |
| --- | --- |
| `npm run build` | production build into `dist/` – one self-contained `index.html` |
| `npm run preview` | serve the build locally |
| `npm run icons` | re-render favicon, app icons and the inlined SVG from `src/assets/favicon.svg` |
| `npm run og` | re-render the 1200 × 630 link-preview image from `src/assets/og-image.svg` |

The build is a single file (`vite-plugin-singlefile`): drop `dist/index.html` on any static host and
it works – including from the file system. The icon files next to it are only needed for favicon,
home screen and link previews.

## Layout

```
src/
  App.tsx            shell: header, step bar, settings panel, 3D stage
  types.ts           settings, modes, steps, presets
  store.ts           settings state, undo/redo, browser persistence
  components/        step panels, 3D stage, G-code view, UI primitives
  lib/               slicing, toolpath, G-code, geometry, file loaders
  assets/            favicon and link-preview artwork
public/              generated icons, web manifest
scripts/             icon and preview-image generation
```

`DESIGN.md` (German) records the design decisions and the reasoning behind them;
`TESTMATRIX.md` lists the scenarios the app is checked against, from STEP imports to tabs.

## Privacy

No upload, no telemetry, no account. Models are parsed in the browser; only STEP, IGES and BREP
load their converter from a CDN on demand (`occt-import-js`) – everything else works offline.
Stored locally: the selected mode and your settings (`localStorage`), so a reload continues where
you left off. The header has a button to reset them.

## Technology

React 19 · TypeScript · Vite · Tailwind CSS 4 · three.js · lucide-react · Geist

## Notes

- The interface is German; the code and this README are English.
- Type: browser tool, not a replacement for a full CAM program – one tool per program, no
  tool-change logic.
- The link preview uses absolute URLs on `cam.mankind.lol`. If the app moves, update `og:url`,
  `og:image`, `twitter:image` and `canonical` in `index.html`.

## Fonts

The interface uses [Geist](https://github.com/vercel/geist-font); a subset for the link-preview
image is bundled in `assets/fonts/` under the SIL Open Font License 1.1 (licence included).

## Licence

The source has no licence file yet – by default all rights are reserved by the repository owner.
The bundled Geist subset is covered by the OFL-1.1 (see `assets/fonts/LICENSE-Geist.txt`).
