# Gravura – Projektdokumentation / Project Documentation

*Diese Dokumentation beschreibt die Architektur, Algorithmen, Bedienphilosophie und Implementierungsdetails von Gravura zweisprachig (Deutsch und Englisch).*
*This documentation covers the architecture, algorithms, UX philosophy, and implementation details of Gravura in both German and English.*

---

## Inhaltsverzeichnis / Table of Contents

- [Teil 1: Deutsche Dokumentation](#teil-1-deutsche-dokumentation)
  - [1. Projektübersicht & Zielsetzung](#1-projektübersicht--zielsetzung)
  - [2. Systemarchitektur & Technologie-Stack](#2-systemarchitektur--technologie-stack)
  - [3. Geometrie- & Schnitt-Pipeline (Slicing)](#3-geometrie---schnitt-pipeline-slicing)
  - [4. Der Mittellinien-Algorithmus (Centerline Engine)](#4-der-mittellinien-algorithmus-centerline-engine)
  - [5. Werkzeugwege & Frässtrategien](#5-werkzeugwege--frässtrategien)
  - [6. G-Code-Postprozessor & Maschinenprofile](#6-g-code-postprozessor--maschinenprofile)
  - [7. Benutzeroberfläche, Modi & Mehrsprachigkeit (i18n)](#7-benutzeroberfläche-modi--mehrsprachigkeit-i18n)
  - [8. Testmatrix & Verifikation](#8-testmatrix--verifikation)
  - [9. Build, Single-File-Inlining & LittleFS-Deployment](#9-build-single-file-inlining--littlefs-deployment)
- [Part 2: English Documentation](#part-2-english-documentation)
  - [1. Project Overview & Objectives](#1-project-overview--objectives)
  - [2. System Architecture & Technology Stack](#2-system-architecture--technology-stack)
  - [3. Geometry & Slicing Pipeline](#3-geometry--slicing-pipeline)
  - [4. Centerline Extraction Engine](#4-centerline-extraction-engine)
  - [5. Toolpath Generation & Machining Strategies](#5-toolpath-generation--machining-strategies)
  - [6. G-Code Post-Processor & Machine Profiles](#6-g-code-post-processor--machine-profiles)
  - [7. User Interface, Complexity Modes & Internationalization (i18n)](#7-user-interface-complexity-modes--internationalization-i18n)
  - [8. Test Matrix & Verification](#8-test-matrix--verification)
  - [9. Build, Single-File Inlining & LittleFS Deployment](#9-build-single-file-inlining--littlefs-deployment)

---

# Teil 1: Deutsche Dokumentation

## 1. Projektübersicht & Zielsetzung

**Gravura** ist eine spezialisierte Web-CAM-Anwendung, die 3D-CAD-Modelle (Frontplatten, Beschriftungen, Skalen, Gehäusedeckel) direkt im Browser schneidet und in sauberen, präzisen CNC-G-Code übersetzt.

### Kernmerkmale:
- **100 % Client-seitig**: Keine Server-Uploads, kein Benutzerkonto, vollständiger Datenschutz. Alle Berechnungen laufen auf dem lokalen Rechner via JavaScript und WebAssembly.
- **Geometrische Rekonstruktion**: Statt Pixelgrafiken abzufahren, schneidet Gravura 3D-Dreiecksnetze und STEP-Volumenkörper mit echter horizontaler Schnittebenen-Geometrie.
- **Echte Mittellinien**: Automatische Skelettierung von Konturschriften und Strichen ("wie in einer Linie gezeichnet"), ohne doppelte Fahrten, ohne Eckenhäkchen und ohne Werkzeugrückzug an Verzweigungen.
- **Vollständige Bearbeitung**: Gravur (Kontur oder Mittellinie), Taschenräumen mit Schraffur, Durchbrüche mit Fräserradius-Kompensation und Haltestegen (Tabs).

---

## 2. Systemarchitektur & Technologie-Stack

Gravura basiert auf modernsten Webstandards und ist modular aufgebaut:

- **UI-Framework**: React 19 mit TypeScript in striktem Typisierungsmodus.
- **Build-System**: Vite 7 mit `@tailwindcss/vite` (Tailwind CSS v4).
- **3D-Rendering**: Three.js mit OrbitControls, benutzerdefinierten Shadern/Materialien und Raycaster für Klick-Interaktion.
- **BAP-CAD-Kernel**: `occt-import-js` (Open CASCADE Technology via WebAssembly) zum direkten Parsen von STEP-, IGES- und BREP-Modellen ohne Server.
- **Single-File-Paketierung**: `vite-plugin-singlefile` bündelt die gesamte Applikation (HTML, CSS, JS, SVG) in eine einzige portable `dist/index.html` (< 1,2 MB), die selbst per `file://` oder von Mikrocontrollern geladen werden kann.

### Modulübersicht (`src/`):

```
src/
├── App.tsx               # Haupt-Shell: Header, Navigationsleiste, Layout, ErrorBoundary
├── i18n.tsx              # Internationalisierung: Automatische Spracherkennung & UI-Wörterbuch
├── store.ts              # Zustandsverwaltung: Settings-Reducer, 80-stufige Undo/Redo-Historie, localStorage
├── types.ts              # Datenmodelle: Contour, Toolpath, Settings, Move, Modes
├── components/
│   ├── Stage.tsx         # 3D-Bühne: Three.js-Szene, Werkzeugvisualisierung, Pfadanimation, Picking
│   ├── steps.tsx         # Die 10 Panel-Schritte (Model, Orient, Slice, Origin, Machining, ...)
│   ├── ui.tsx            # Wiederverwendbare Eingabeelemente (Field, Slider, Toggle, Segmented, OriginPicker)
│   ├── CodeArea.tsx      # G-Code-Editor mit Drag-and-Drop für Befehls-Chips
│   └── CodeView.tsx      # Virtualisierter G-Code-Viewer mit Syntax-Highlighting
└── lib/
    ├── centerline.ts     # Voronoi-/EDT-basierte Mittellinien-Extraktion & T-Zweig-Verbindung
    ├── geometry.ts       # Dreiecks-Schnitt, Polygon-Offsetting, Even-Odd-Schachtelung, Schraffur
    ├── gcode.ts          # G-Code-Formatter, Platzhalterauflösung, Werkzeugkommentare
    ├── loaders.ts        # Mesh-Loader (STL, OBJ, 3MF) & WASM-Loader (STEP, IGES, BREP)
    └── toolpath.ts       # Werkzeugweg-Planung, Taschen-Offset, Tab-Generierung, TSP-Sortierung
```

---

## 3. Geometrie- & Schnitt-Pipeline (Slicing)

1. **Import & Parsing**:
   - STL (Binär/ASCII), OBJ und 3MF werden über Three.js geparst.
   - STEP, STP, IGES und BREP werden dynamisch über WebAssembly (`occt-import-js`) tesselliert.
2. **Ausrichtung (`orientMesh`)**:
   - Translation und Rotation bringen die ausgewählte Oberseite (+Z, -Z, +X, -X, +Y, -Y) in die XY-Ebene.
   - 90°-Rotationsschritte um Z und optionale X-Achsen-Spiegelung (für Hinterglasgravur auf Acryl).
   - Skalierungsfaktor (z. B. 25,4 für Zoll → mm).
3. **Schnittebenen (`sliceMesh`)**:
   - Waagerechte Schnittebenen auf definierter Tiefe (Standard 0,1 mm unter Oberkante).
   - Schnitt jedes Modell-Dreiecks mit der Z-Ebene ergibt 2D-Liniensegmente.
   - Kettung (`chainSegments`) zu geschlossenen Ringen oder offenen Polylinien mit einstellbarer Kurventoleranz.
4. **Schachtelungsanalyse (`nestingDepth`)**:
   - Mittels Point-in-Polygon (Raycasting-Even-Odd) wird für jede Kontur bestimmt, ob sie eine Außenkante (Tiefe 0, 2, ...) oder ein Loch (Tiefe 1, 3, ...) darstellt.

---

## 4. Der Mittellinien-Algorithmus (Centerline Engine)

In der Frontplattenfertigung sind Buchstaben und Symbole im CAD meist als geschlossene Flächen (Outline) modelliert. Gravurwerkzeuge (V-Stichel) sollen diese jedoch als **einzelnen zentrierten Strich** abfahren.

Herkömmliche Raster-Skelettierungen (wie Zhang-Suen) erzeugen diagonale Treppenartefakte, zerstückeln Kurven in hunderte Fragmente und biegen an Enden in die Ecken ab. Gravura verwendet einen maßstabsunabhängigen **Gratverfolgungs-Algorithmus (Ridge-March)** auf einer exakten euklidischen Distanztransformation.

### Mathematische Schritte (`src/lib/centerline.ts`):

1. **Regionenbildung & Binnenloch-Verbrauch (`consumed`)**:
   - Konturen werden nach Fläche absteigend sortiert. Jede Außenkontur bildet mit ihren inneren Löchern ein geschlossenes System.
   - Löcher, die zu einer erfolgreich als Strich berechneten Region gehören, werden in einem `consumed`-Set markiert. Sie werden nicht mehr separat als Umriss graviert, wodurch Geister-Mittellinien bei Ziffern mit Innenlöchern (0, 4, 6, 8, 9) verhindert werden.
2. **Strich- vs. Flächenentscheidung**:
   - Eine Form wird nur dann skelettiert, wenn ihre maximale Breite den Schwellwert `centerlineWidth` (Standard 8 mm) unterschreitet **und** das Breiten-zu-Längen-Verhältnis ≤ 0,3 beträgt. Breitere Flächen werden automatisch als Kontur graviert.
3. **Euklidische Distanztransformation (EDT)**:
   - Exakte Distanzkarte $d(x,y)$ nach Felzenszwalb in $\mathcal{O}(n)$. Jeder Pixel enthält den orthogonalen Abstand zum nächsten Rand.
4. **Gratverfolgung (Ridge March)**:
   - Start an lokalen Maxima von $d$.
   - Ermittlung der lokalen Gratrichtung über die Hesse-Matrix $\mathcal{H}$: Die Hauptkrümmungsrichtung entspricht dem Eigenvektor des kleineren Betragseigenwerts.
   - Zentrierung quer zur Fahrtrichtung auf das lokale Maximum von $d$.
5. **Eckenhäkchen-Eliminierung (`0.85 * dMid`)**:
   - *Problem*: Die mathematische mediale Achse biegt an rechteckigen Strichenden auf der Winkelhalbierenden in die beiden 90°-Ecken ab.
   - *Lösung*: Zu einer echten Ecke hat die Mittellinie immer einen Abstand von mindestens $1{,}0 \cdot d_{\text{mid}}$. Punkte innerhalb von $0{,}85 \cdot d_{\text{mid}}$ zu Kontur-Ecken werden gekappt. Der Pfad wird stattdessen tangential auf seiner Achse gerade bis zur Stirnkante verlängert.
6. **T-Zweige-Verbindung (`joinBranches`) – Ziffern in einem Zug**:
   - Bei Ziffern wie "1" (Dachhaken trifft senkrechten Stamm), "3", "7" oder "T" treffen Äste an T-Kreuzungen aufeinander.
   - `joinBranches` erkennt offene Endpunkte nahe einem Pfadinneren (`lim = Math.max(4, 1.5 * d)`).
   - Ist der Ast ein kurzer Ausläufer (`Math.min(lLeft, lRight) <= 5.0 * u`), wird der Pfad nahtlos umgelenkt: Haken-Spitze → oberer Scheitelpunkt → Stamm hinab zum Fuß. Die Ziffer wird **in einer einzigen durchgehenden Linie** ohne Kopfheben gefräst.
7. **Maßstabs- und Drehungsinvarianz**:
   - Alle Schwellenwerte, Schrittweiten und Glättungsfenster sind an den realen Randabstand $d$ gekoppelt. Ob 25 mm oder 200 mm Modellgröße: Die relative Pfadlänge $L/S$ weicht um weniger als 0,03 % ab.

---

## 5. Werkzeugwege & Frässtrategien

Die Pfadberechnung (`src/lib/toolpath.ts`) fasst alle Operationen zusammen:

| Operation | Werkzeugbahn | Besonderheiten |
|---|---|---|
| **Gravur (Kontur)** | Entlang der Schnittlinie | Auf Sollmaß |
| **Gravur (Mittellinie)** | Zentrierter Einzelstrich | Keine doppelten Wege, Enden entgratet |
| **Tasche** | Innen-Offset + Schraffur | 45°-Schraffur mit einstellbarem Zeilenabstand |
| **Durchbruch** | Offset außen/innen | Werkzeugradius-Kompensation, Gleich-/Gegenlauf |

### Haltestege (Tabs)
Um ausgefräste Frontplatten vor dem Verkanten am Fräser zu schützen, werden am Außenumriss automatisch Haltestege eingefügt:
- Einstellbare Anzahl (0–12), Breite (mm) und Höhe (mm).
- Werkzeug hebt an den Stegen in Z an und setzt danach den Schnitt fort.

### Wegoptimierung
Pfade werden chronologisch geordnet (Gravur → Tasche → Innendurchbrüche → Außenumriss). Innerhalb einer Gruppe minimiert eine Nearest-Neighbor-Heuristik die Eilgangstrecke zwischen Konturen.

---

## 6. G-Code-Postprozessor & Maschinenprofile

Der erzeugte G-Code (`src/lib/gcode.ts`) ist für Standard-Steuerungen optimiert:

- **GRBL**: Industriestandard für Desktop-Fräsen (Shapeoko, Stepcraft, X-Carve).
- **LinuxCNC / Mach3**: Erweiterte G-Codes (G64 Bahnsteuerung, M30 Programmende).
- **Marlin (CNC)**: Kompatibel mit 3D-Drucker-basierten CNCs.
- **Minimal**: Reine Fahrbefehle (G0/G1) ohne M-Codes.

### Dynamische Variablen:
- `{rpm}`: Spindeldrehzahl (z. B. `M3 S12000`).
- `{safe}`: Absolute Sicherheitshöhe.
- `{feed}`: Vorschub in XY.

---

## 7. Benutzeroberfläche, Modi & Mehrsprachigkeit (i18n)

### Drei Arbeitsmodi
Gravura passt die Komplexität an den Erfahrungsgrad an:
1. **Einfach**: Reduziert auf 4 Schritte (Modell → Gravurtiefe/Werkzeug → Berechnen → Export). Alle Spezialparameter nutzen erprobte Standardwerte.
2. **Standard**: Zeigt alle 10 Schritte für den regulären Fertigungsablauf.
3. **Experte**: Schaltet alle Feineinstellungen frei (Kurventoleranz, Radiusausgleich, Stegmaße, Eintauchvorschub, Zeilenabstand, benutzerdefinierte G-Code-Blöcke).

### Automatische Spracherkennung & Umschaltung
- **Systemsprachen-Erkennung**: Beim ersten Laden prüft Gravura `navigator.languages`. Beginnt die Sprache mit `de`, startet die Oberfläche auf Deutsch; andernfalls automatisch auf Englisch.
- **Manueller Switch**: Über den `DE | EN`-Schalter im Header kann die Sprache jederzeit gewechselt werden. Die Wahl wird in `localStorage ('gravura:lang')` gespeichert.
- **Vollständige Lokalisierung**: Alle Schaltflächen, Hinweistexte, Fehlermeldungen, 3D-Bühnen-Beschriftungen, Ausrichtungsoptionen und G-Code-Header passen sich dynamisch an.

---

## 8. Testmatrix & Verifikation

Gravura wird kontinuierlich anhand einer strengen Testmatrix geprüft (`TESTMATRIX.md`):

- **Ziffern 0–9 als Einzelzug**: Alle 10 Ziffern werden in DejaVu Sans als genau 1 Zug gefräst. In Geist Sans 1–2 Züge (keine Geisterlinien).
- **Eckenentgratung**: Rotierte Rechtecke von 0° bis 90° (in 15°-Schritten) beenden Striche gerade auf der Achse ohne Häkchen in die Ecken.
- **Skaleninvarianz**: Skalierungssweep 25 mm bis 200 mm zeigt konstante relative Längen mit < 0,03 % Abweichung.
- **Präzisionsringe**: Ring $r = 8 / 7{,}6\text{ mm}$ trifft Sollumfang auf 0,2 ‰ ($48{,}9\text{ mm}$ zu $49{,}01\text{ mm}$).
- **Große Kämme**: Skala mit 200 Zähnen wird in unter 600 ms berechnet.

---

## 9. Build, Single-File-Inlining & LittleFS-Deployment

Die gesamte Web-Applikation wird über Vite und `vite-plugin-singlefile` in eine einzige Datei (`dist/index.html`) gebündelt.
- **Keine externen Abhängigkeiten**: Alle JavaScript-, CSS- und Grafik-Ressourcen sind base64- oder inline-kodiert.
- **LittleFS / ESP32**: Kann direkt auf das Flash-Dateisystem eines Mikrocontrollers geflasht werden, sodass eine Fräsmaschine ihre eigene Web-Steuerung ohne Internetzugang hostet.

---
---

# Part 2: English Documentation

## 1. Project Overview & Objectives

**Gravura** is a dedicated browser-based CAM solution engineered to slice 3D CAD files (front panels, instrument enclosures, scales, labels, faceplates) and generate clean, highly optimized CNC G-code directly in the browser.

### Key Highlights:
- **100% Client-Side**: No cloud uploads, no logins, total data privacy. Everything is processed locally in the browser using JavaScript and WebAssembly.
- **True Geometric Slicing**: Slices 3D triangle meshes and B-rep STEP solids using exact horizontal clipping planes rather than converting to raster heightmaps.
- **Continuous Centerline Engine**: Automatically extracts true centerlines from outline fonts ("drawn in a single stroke"), without double laps, without corner hooks, and without tool retractions at T-junctions.
- **Comprehensive 2.5D Operations**: Engraving (outline or centerline), pocket clearing with hatch fill, through-cutouts with cutter radius compensation and holding tabs.

---

## 2. System Architecture & Technology Stack

Gravura is built with a lightweight, high-performance modular frontend stack:

- **UI Framework**: React 19 with strict TypeScript typing.
- **Build System**: Vite 7 with `@tailwindcss/vite` (Tailwind CSS v4).
- **3D Viewport**: Three.js featuring OrbitControls, custom materials, dynamic tool visualization, and raycast line selection.
- **WASM CAD Kernel**: `occt-import-js` (Open CASCADE Technology compiled to WebAssembly) for on-the-fly client-side STEP, IGES, and BREP parsing.
- **Single-File Bundling**: `vite-plugin-singlefile` packages HTML, CSS, JavaScript, and SVG assets into a single monolithic `dist/index.html` (< 1.2 MB), runnable offline from local storage, `file://` URIs, or embedded microcontrollers.

### Directory Layout (`src/`):

```
src/
├── App.tsx               # Root application shell: header, step navigation, responsive layout
├── i18n.tsx              # Internationalization: system language auto-detection & dictionaries
├── store.ts              # State management: settings reducer, 80-step undo/redo stack, localStorage
├── types.ts              # Type definitions: Contour, Toolpath, Settings, Move, Modes
├── components/
│   ├── Stage.tsx         # 3D viewport: Three.js scene, live toolhead, path simulation, raycasting
│   ├── steps.tsx         # 10 step panels (Model, Orient, Slice, Origin, Machining, ...)
│   ├── ui.tsx            # Modular UI controls (Field, Slider, Toggle, Segmented, OriginPicker)
│   ├── CodeArea.tsx      # G-code block editor featuring drag-and-drop snippet chips
│   └── CodeView.tsx      # Virtualized, syntax-highlighted G-code inspector
└── lib/
    ├── centerline.ts     # Voronoi / EDT centerline extraction & T-junction branch joining
    ├── geometry.ts       # Mesh slicing, polygon offsetting, nesting hierarchy, hatch fill
    ├── gcode.ts          # G-code formatting, variable substitution, header comments
    ├── loaders.ts        # Mesh loaders (STL, OBJ, 3MF) and WASM loader (STEP, IGES, BREP)
    └── toolpath.ts       # Toolpath planner, pocket generation, tab placement, TSP ordering
```

---

## 3. Geometry & Slicing Pipeline

1. **Import & Ingestion**:
   - STL (binary & ASCII), OBJ, and 3MF files are parsed via Three.js geometry loaders.
   - STEP, STP, IGES, and BREP files are dynamically converted to triangular meshes using client-side Open CASCADE WebAssembly.
2. **Orientation (`orientMesh`)**:
   - Reorients the 3D model so the chosen top face (+Z, -Z, +X, -X, +Y, -Y) aligns with the XY plane.
   - Supports 90° incremental rotations around Z and mirror flipping across X (ideal for reverse engraving acrylic).
   - Scale factor adjustment (e.g. 25.4 for inch to mm conversion).
3. **Horizontal Slicing (`sliceMesh`)**:
   - Slices the oriented mesh at user-defined depths below the top surface (default 0.1 mm).
   - Calculates intersections between triangle facets and horizontal Z-planes to produce 2D line segments.
   - Chains line segments (`chainSegments`) into closed loops or open polylines according to a curve tolerance parameter.
4. **Nesting Depth Analysis (`nestingDepth`)**:
   - Evaluates point-in-polygon containment using raycasting even-odd rules to determine whether a contour is an exterior boundary (depth 0, 2, ...) or an interior cutout/hole (depth 1, 3, ...).

---

## 4. Centerline Extraction Engine

In front panel CAD models, text and graphics are typically designed as closed 2D outlines. To mill these efficiently with engraving V-bits, the CAM system must compute a **single centered toolpath** rather than tracing both sides of the contour.

Traditional pixel-based thinning algorithms (e.g., Zhang-Suen) produce jagged diagonal staircases, split lines into dozens of stubs, and curl inward into corners. Gravura implements a scale-invariant **ridge-march algorithm** on an exact Euclidean Distance Transform (EDT).

### Algorithmic Pipeline (`src/lib/centerline.ts`):

1. **Region Isolation & Hole Consumption (`consumed`)**:
   - Contours are sorted by bounding area in descending order. Each outer contour and its contained holes form an isolated domain.
   - Holes that are successfully resolved within a stroke region are registered in a `consumed` set. This prevents inner hole contours from being re-emitted as redundant perimeter cuts, eliminating phantom centerlines on digits like 0, 4, 6, 8, and 9.
2. **Stroke vs. Pocket Classification**:
   - A contour is classified as a stroke only if its maximum inscribed radius is below `centerlineWidth` (default 8 mm) **and** its aspect ratio satisfies the slimness constraint ($\le 0.3 \times \text{diagonal}$). Wider geometric features are automatically engraved along their perimeter.
3. **Euclidean Distance Transform (EDT)**:
   - Evaluates the exact Euclidean distance $d(x,y)$ to the nearest boundary using Felzenszwalb's linear-time $\mathcal{O}(n)$ algorithm.
4. **Ridge Marching**:
   - Starts at local distance maxima.
   - Computes local ridge direction using the Hessian matrix $\mathcal{H}$, stepping along the eigenvector associated with the ridge crest.
   - Refines point coordinates orthogonally to the direction of travel to locate the parabolic maximum of the distance field.
5. **Corner Hook Elimination (`0.85 * dMid`)**:
   - *Problem*: The Medial Axis naturally branches along corner angle bisectors, creating unsightly hooks at rectangular stroke endpoints.
   - *Solution*: A true centerline is proven to maintain a distance of at least $1.0 \cdot d_{\text{mid}}$ from corner vertices. Endpoints within $0.85 \cdot d_{\text{mid}}$ of corner vertices are pruned, and the stroke is extended tangentially along its axis directly to the end cap.
6. **T-Junction Branch Joining (`joinBranches`) – Single-Stroke Digits**:
   - On glyphs such as numeral "1" (top hook meeting the vertical stem), "3", "7", or "T", strokes meet at T-junctions.
   - `joinBranches` identifies open branch ends that terminate near the interior of an adjacent path (`lim = Math.max(4, 1.5 * d)`).
   - If the dead-end branch is short (`Math.min(lLeft, lRight) <= 5.0 * u`), the two paths are spliced into a continuous line: hook tip → apex → down the stem to the baseline. The entire numeral is milled in **one continuous stroke without retracting the Z-axis**.
7. **Scale and Rotation Invariance**:
   - All march parameters (step size, Hessian kernel span, smoothing radius, plateau detection) scale with local stroke radius $d$. Whether tested at 25 mm or 200 mm, the path length ratio $L/S$ remains constant within 0.03%.

---

## 5. Toolpath Generation & Machining Strategies

The path generation engine (`src/lib/toolpath.ts`) manages four distinct cutting modes:

| Operation | Tool Motion | Strategy |
|---|---|---|
| **Engrave (Contour)** | Along sliced boundary | Direct nominal path |
| **Engrave (Centerline)** | Single center pass | Pruned corners, merged branches, continuous cut |
| **Pocket** | Inset boundary + 45° hatch | Clean pocket perimeter with customizable step-over |
| **Cutout** | Offset perimeter / holes | Radius compensation, climb or conventional milling |

### Holding Tabs
To prevent cut out panels from breaking loose and damaging the tool, holding tabs can be automatically applied to the exterior boundary:
- Configurable tab count (0–12), width (mm), and height (mm).
- The tool retracts smoothly to the tab clearance height before plunging back to depth.

### Travel Optimization
Toolpaths are sequenced logically (Engrave → Pocket → Interior Holes → Perimeter Cutout). Within each operation category, a nearest-neighbor traveling salesperson heuristic minimizes non-cutting rapid moves.

---

## 6. G-Code Post-Processor & Machine Profiles

The G-code output (`src/lib/gcode.ts`) complies with industrial CNC standards:

- **GRBL**: Standard for hobby and desktop routers (Shapeoko, Stepcraft, X-Carve, OpenBuilds).
- **LinuxCNC / Mach3**: Supports path blending (G64) and industrial program ends (M30).
- **Marlin (CNC)**: Tuned for 3D-printer control boards running CNC firmware.
- **Minimal**: Pure motion commands (G0/G1) without spindle or coolant macros.

### Dynamic Placeholders:
- `{rpm}`: Spindle speed (e.g. `M3 S12000`).
- `{safe}`: Safe Z clearance plane.
- `{feed}`: Cutting feedrate in XY.

---

## 7. User Interface, Complexity Modes & Internationalization (i18n)

### Three Complexity Modes
Gravura tailors its UI complexity to the user's workflow:
1. **Simple (`einfach`)**: Streamlined 4-step workflow (Model → Engrave Depth/Tool → Compute → Export). All secondary parameters assume verified workshop defaults.
2. **Standard**: Exposes all 10 standard CAM steps for comprehensive job preparation.
3. **Expert (`experte`)**: Unlocks advanced fine-tuning: curve tolerance, tool radius compensation, tab geometry, plunge rates, pocket step-over, and custom G-code start/end blocks.

### Automatic System Language Selection & Manual Switcher
- **Automatic Detection**: On launch, Gravura evaluates `navigator.languages`. If the browser locale begins with `de`, the German UI is loaded; otherwise, the interface defaults to English.
- **Manual Header Switcher**: Users can click the `DE | EN` toggle in the header at any time. The choice is saved immediately to `localStorage ('gravura:lang')`.
- **100% Bilingual Coverage**: All buttons, step descriptions, tooltips, warnings, viewport legends, and G-code header comments update dynamically without requiring a page reload.

---

## 8. Test Matrix & Verification

Every build is validated against an extensive automated and visual test suite (`TESTMATRIX.md`):

- **Single-Line Digits 0–9**: In DejaVu Sans, all digits 0 to 9 mill in exactly 1 piece. In Geist Sans, digits mill in 1–2 pieces without phantom inner loops.
- **Corner Hook Pruning**: Rotated rectangles (0° to 90° in 15° increments) terminate straight at the edge on the stroke axis without curling into corners.
- **Scale Invariance Sweep**: Testing across 25, 50, 100, and 200 mm frames yields consistent $L/S$ length ratios with < 0.03% variation.
- **Ring Accuracy**: Annular ring $r = 8 / 7.6\text{ mm}$ achieves 0.2 ‰ accuracy ($48.9\text{ mm}$ measured vs $49.01\text{ mm}$ theoretical).
- **Dense Combs**: 200-tooth comb scales compute in under 600 ms.

---

## 9. Build, Single-File Inlining & LittleFS Deployment

The application compiles into an entirely self-contained distribution (`dist/index.html`):
- **Zero External CDNs Needed**: All JavaScript, stylesheets, and SVG assets are inlined via `vite-plugin-singlefile`.
- **LittleFS / ESP32 Compatibility**: The monolithic HTML file can be directly flashed onto the SPIFFS/LittleFS partition of an ESP32 or Raspberry Pi Pico, allowing a CNC machine to serve its own CAM interface over local Wi-Fi without internet connectivity.
