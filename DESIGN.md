# Gravura – Designprotokoll

## Ablauf (verbindlich)
1. Modell laden (Drag & Drop / Datei) → 2. Oberseite wählen → 3. Schnittebene (Tiefe unter Oberkante, Konturen live)
→ 4. Nullpunkt (3×3 + Z-Referenz, Pfeile auf der Bühne) → 5. Gravur (Strategie, Tiefe, Zustellung, Sicherheitshöhe)
→ 6. Auswahl (Konturen per Klick auf der Bühne überspringen, „Außenkante überspringen“)
→ 7. Werkzeug (Spitze in 3D über dem Nullpunkt) → 8. Berechnen (nur manuell; 3D-Weg + Simulation, 2D = Ansicht von oben)
→ 9. Programm (Start/Ende, Presets GRBL/LinuxCNC/Marlin/minimal, Snippets) → 10. Export (Download, Kopieren, Strg+C).

## Befund → Maßnahme
- Schnitt bei 50 % Höhe erfasste bei „Würfel mit Zahl“ nur den Würfel. → Schnitt relativ zur Oberkante (Standard 0,1 mm), Konturen sofort sichtbar.
- Automatische Neuberechnung bei jeder Eingabe. → Nur auf Knopfdruck; veraltete Ergebnisse werden als solche markiert.
- G-Code: modale Zeilen ohne G-Wort, erster Verfahrweg ohne garantierte Sicherheitshöhe. → Explizites G0/G1 je Zeile, `G0 Z{safe}` immer als erste Bewegung.
- Export ≠ Bühne. → G-Code und 3D-Weg entstehen aus derselben Move-Liste.
- Kein Undo. → Zustandsbasiertes Undo/Redo (Strg+Z / Strg+Shift+Z) für alle Einstellungen inkl. Auswahl.

## Tokens
Farben ausschließlich über `--mw-*` (light-dark). Ausnahme: Three.js-Canvas (`C` in Stage.tsx, dokumentiert).
Geist Sans für Text, Geist Mono + tabular-nums (`.num`) für alle Zahlen. Akzent nur für aktiv/Fokus/primäre Aktion.

## Tastatur
Strg+Z / Strg+Shift+Z Undo/Redo · Alt+←/→ Schritt · Esc stoppt Simulation · Strg+C im Export kopiert G-Code.

## Runde 3 – Frontplatten (siehe TESTMATRIX.md)
- Befund: eine Tiefe für alles → Löcher/Umriss nicht möglich. Maßnahme: Bearbeitung je Linie (Gravur/Tasche/Durchbruch/Aus) mit eigenen Tiefen; Pinsel-Klick auf der Bühne.
- Befund: erhabene Schrift + Löcher brauchen zwei Schnitthöhen. Maßnahme: bis zu 4 Schnittebenen, Konturen je Ebene farbig auf ihrer Höhe.
- Befund: Durchbrüche brauchen Radiusausgleich, Stege, Reihenfolge. Maßnahme: Offset innen/außen nach Verschachtelung, Kollaps-Erkennung (Loch < Werkzeug → Hinweis), Haltestege am Umriss, Reihenfolge Gravur → Tasche → Löcher → Umriss.
- Befund: Presets nur klickbar. Maßnahme: Vorlagen und Befehle als ziehbare Code-Chips; Drop-Linie im Textfeld, eingefügte Zeilen blitzen kurz auf.
- Befund: G-Code nur als Datei. Maßnahme: Code-Ansicht im Export (virtualisiert, Syntaxfarben, Zeilennummern), Umschalter zu 3D-Weg.
- Materialstärke wird beim Laden aus der Modellhöhe vorbelegt; Z0 „Unterseite“ für sichere Durchbrüche.

## Marke & Icon
- Name: **Gravura** (Kurzform für Gravur; im Header als Wortmarke, im `<title>` als „Gravura – 3D-Modell zu Gravur-G-Code“).
- Icon: Werkstückoberfläche mit V-Nut im Schnitt – ein Strich, der in die Tiefe läuft. Quadratische Kachel mit Akzent-Farbverlauf, weiße Linie; lesbar ab 16 px, Funktion vor Dekoration.
- Quelle: `src/assets/favicon.svg`. Ableitungen (favicon.ico 16/32/48, icon-192/512, icon-maskable-512, apple-touch-icon 120/152/167/180 und die Data-URI in `index.html`) entstehen mit `npm run icons` – nach jeder Änderung am SVG ausführen.
- Das Vektor-Icon liegt zusätzlich als Data-URI in `index.html`, damit der Single-File-Build ohne Neben-Dateien funktioniert.

## Responsiv
- Drei Stufen, am Bildschirmrand gemessen: **Handy** (< 768 px) stellen wir um – Schritte als waagerechte Leiste oben, Bühne darüber (45 % der Höhe, mindestens 220 px), Einstellungen darunter mit eigener Rolleiste und Zurück/Weiter am unteren Rand. **Tablet** (768–1023 px) behält drei Spalten, nur schmaler (148 px Ablauf, 320 px Einstellungen). **Desktop** ab 1024 px bleibt, wie er ist (168/380 px).
- Befund: Der Umschalter und die Werkzeugleiste passen auf dem Handy nicht neben die Wortmarke. Maßnahme: der Kopf darf in zwei Zeilen umbrechen – die Einstellungen stehen dann rechts in der zweiten Zeile. Der Beisatz hinter dem Namen weicht aus (`truncate`), der Modus-Umschalter nie.
- Befund: Auf dem Handy ist „Zurück/Weiter“ weit weg. Maßnahme: die Fußzeile der Einstellungen sitzt als unterste Zeile direkt am Daumen, mit `env(safe-area-inset-bottom)` über der Home-Leiste.
- Befund: Mobilbrowser rechnen 100 % Höhe hinter der Adressleiste zu groß. Maßnahme: `100dvh`, wo unterstützt; `overscroll-behavior: none` verhindert Pull-to-Refresh beim Drehen der Bühne, `touch-action: none` auf dem Canvas gibt Fingerbewegungen an die Steuerung.
- Die Bühne hängt an einem `ResizeObserver` – sie folgt jeder Layoutänderung ohne eigenes Neuladen.
- Regel: Erst umstellen (Handy), dann verschmälern (Tablet), nie bloß skalieren. Bedienelemente bleiben in Daumenreichweite, die Bühne bekommt den Platz, der übrig bleibt.

## Teilen & Homescreen
- Vorschaukarte für WhatsApp, Teams, Telegram, Slack: `public/og-image.png` (1200×630) aus `src/assets/og-image.svg` per `npm run og`. Großes Motiv links, Wortmarke und zwei Zeilen Text rechts – in der Miniatur zählt das Bild, nicht der Text.
- `index.html` trägt OG- und Twitter-Tags inklusive Bildmaßen und `canonical`. Die Adressen sind absolut auf <https://cam.mankind.lol>, weil X/Twitter und Facebook relative Angaben nicht auflösen. Zieht die App um: Domain in `og:url`, `og:image`, `twitter:image` und `canonical` ändern.
- Homescreen (iPhone/iPad): randlose `apple-touch-icon-{120,152,167,180}.png` – iOS rundet selbst und will keine Transparenz. `apple-mobile-web-app-title` beschriftet das Icon, `apple-mobile-web-app-capable` startet ohne Safari-Leisten. Farbe der Statusleiste: `default` (kein `black-translucent`, sonst läuft der Inhalt darunter weg).
- Schrift im Vorschaubild: Geist als Teilmenge unter `assets/fonts/` inklusive Lizenz (OFL). Fehlt sie, rendert `npm run og` mit einer Systemschrift und warnt.

## Modi
Wähler im Header („Modus“ links neben Undo/Redo). Die Wahl wird im Browser gemerkt (`gravura:mode`), Standard ist **Standard**.

| Modus | Schritte | Es fehlen |
| --- | --- | --- |
| **Einfach** | Modell → Gravur → Berechnen → Export | Ausrichten, Schnittebenen, Nullpunkt, Auswahl, Werkzeug, Programm |
| **Standard** | alle zehn | Feineinstellungen: Kurvengenauigkeit, Zeilenabstand, Radiusausgleich, Stegmaße, Maßstab, Eintauchen, eigene Programmzeilen |
| **Experte** | alle zehn | nichts |

- Befund: Zehn Schritte und jede Stellschraube überfordern, wenn nur eine Schrift graviert werden soll. Maßnahme: „Einfach“ fragt Gravurtiefe, Werkzeug und Maschine; der Rest steht auf bewährten Werten (Oberseite Z+, eine Schnittebene 0,1 mm unter der Oberkante, Nullpunkt vorne links auf der Oberfläche, alle Linien = Gravur).
- Befund: Ein Modus-Wechsel darf keine halb eingestellte Maschine zurücklassen. Maßnahme: „Einfach“ reduziert beim Wechsel auf eine Schnittebene und setzt die Linienzuweisung zurück – beides rückgängig machbar.
- Befund: Ausgeblendete Schritte dürfen den Ablauf nicht verbiegen. Maßnahme: Nummerierung, „Weiter“ und Alt+←/→ arbeiten auf der gefilterten Liste. Landet man in einem Schritt, den der neue Modus nicht kennt, springt die App auf den letzten gemeinsamen.
- Befund: „Berechnen“ weglassen spart Zeit, nimmt aber die Kontrolle. Maßnahme: der Knopf bleibt in allen Modi – auch in „Einfach“.
- Regel für neue Felder: Ein Feld bekommt eine Modus-Schwelle nur, wenn es im Alltag selten gebraucht wird. Was das Ergebnis sichtbar verändert, bleibt in „Standard“ sichtbar.
- Die Modi stecken in `MODE_STEPS` (Schritte) und `visibleIn(mode, min)` (Felder). Neue Schritte gehören in `STEPS` **und** in die Liste jedes Modus.
- Gemerkt wird im Browser: `gravura:mode` (Modus) und `gravura:settings` (alle Einstellungen). Beim Laden fehlende Felder fallen auf die Werkseinstellung zurück – ein altes oder halbes Schema kann die App nicht mehr aus dem Tritt bringen. Der Knopf „Einstellungen zurücksetzen“ im Header löscht beides (und ist rückgängig machbar).
- Der Umschalter ist ein `Segmented` wie im Rest der App, Breite nach Inhalt (`minmax(max-content, 1fr)`) – Beschriftungen werden nie abgeschnitten. Feste Breiten am Umschalter sind tabu.

## Mittellinie & Vorschau

- Befund: Bei schrägen und dünnen Strichen war die Mittellinie wackelig und zerstückelt – ein 20 mm langer, um 30° gedrehter Strich zerfiel in **80 Einzelstücke** mit 0,13 mm Abweichung, ein 45°-Strich verschwand ganz. Ursache: das Raster-Skelett (Zhang-Suen) ist bei Diagonalen eine Treppe mit seitlichen Zacken, und der Ablauf startete an jedem Grad-1-Pixel.
- Maßnahme: **Gratverfolgung auf der Distanztransformation** statt Skelett-Ablauf (`src/lib/centerline.ts`):

  | Schritt | Was passiert |
  | --- | --- |
  | Regionen | **jede Kontur bildet mit den in ihr liegenden Konturen ihre eigene Region** (Buchstabe „O“: Außenkontur + Zähler = Ring). Eine große Fläche kann die Mittellinie eines darin liegenden Strichs nicht mehr verfälschen |
  | Probe | grobes Raster (220 px) + Distanztransformation: ist der größte Innenkreis klein gegen die Ausdehnung (≤ 30 % der Diagonale), ist die Form ein Strich – sonst eine **Fläche**, die entlang ihrer Kontur graviert wird. Die teure Feinberechnung entfällt dann ganz |
  | Rastern | Even-Odd-Scanline je Region, Auflösung aus Toleranz **und** geschätzter Strichbreite (2·Fläche/Umfang): mindestens ~8 Pixel über die Breite |
  | EDT | exakte euklidische Distanztransformation (Felzenszwalb, O(n)) – Abstand jedes Pixels zum Rand, bilinear auswertbar |
  | Startpunkte | lokale Maxima der 8er-Nachbarschaft, zusätzlich Krümmung quer zum Grat (Hesse-Matrix) – nur so wird aus der Rastertreppe kein zweiter Grat |
  | Lauf | von dort beidseitig in 0,7-Pixel-Schritten; die Gratrichtung ist der Eigenvektor zum *größeren* Eigenwert der Hesse-Matrix, mit Trägheit (65 %). Auf einem Plateau (breite Kreuzungsbereiche) ist die Gratrichtung Unsinn – dort läuft der Strich geradeaus weiter, bis wieder ein Grat da ist |
  | Mitte | jeder Punkt wird über den lokalen Querschnitt (beide Ränder aus der EDT, subpixel-genau) auf die Mitte gesetzt – das nimmt die Rastertreppe heraus |
  | Verlängern | die mediale Achse biegt am Strichende in die Ecken ab und endet schon eine halbe Strichbreite vor dem Ende. Der Lauf wird deshalb **geradeaus bis kurz vor den Rand verlängert** – Richtung aus den letzten Schritten, nicht aus der letzten Gratrichtung |
  | Verbinden | Pfade, die an einer Gabelung auseinandergefallen sind, werden wieder zusammengesetzt – aber nur, wenn der Verbindungsschnitt im Bauteil liegt |
  | Dubletten | Stücke, die fast ganz auf einem anderen liegen (der Grat springt an Gabelungen leicht zur Seite), werden verworfen – sonst fährt der Fräser zweimal über dieselbe Stelle |

- Ergebnis (20 mm langer Strich, 0,6 mm breit, Toleranz 0,03 mm):

  | Fall | alt | neu |
  | --- | --- | --- |
  | waagerecht | 1 Stück, 19,49 mm lang | 1 Stück, **19,97 mm** (fast die volle Länge) |
  | 30° gedreht | **80 Stück**, 0,1335 mm | **1 Stück**, 19,96 mm |
  | 45° gedreht | **0 Stück** (nichts übrig) | 1 Stück, 19,95 mm |
  | Kreisbogen r=10 | 8 Stück, 0,0886 mm | 1 Stück, 33,84 mm |
  | Ring r=8, 0,8 mm breit | zerstückelt | **1 geschlossener Zug**, 50,19 mm (ideal 50,27) |

  Ein „H“ (echte Außenkontur) ergibt 3–4 Züge: zwei Senkrechte über die volle Höhe, der Querbalken und der Übergang an den Kreuzungen.
- Befund: Bei einer Platte mit **vertiefter** Schrift liegt der Buchstabe als Loch im Plattenrand. Alle Konturen gemeinsam gerastert ergab das ein Skelett, das **außen um die Buchstaben herum** lief statt durch sie hindurch – mit 210 mm Weg für zwei Zeichen. Maßnahme: die Regionenregel oben – jede Kontur rechnet für sich, der Plattenrand wird als Fläche erkannt und entlang seines Umrisses graviert.
- Befund: Der Kopf hob mitten im Strich ab, weil jedes Stück neu angefahren wurde. Maßnahme: erst die Geometrie heilen (ein Strich = ein Pfad), zusätzlich verbindet der Werkzeugweg zwei Gravurstücke unter 0,3 mm Abstand **ohne** Abheben (`LINK_GAP` in `src/lib/toolpath.ts`).
- Befund: Die Mittellinie war erst nach „Berechnen“ sichtbar. Maßnahme: **Vorschau direkt bei der Wahl** – `centerlinePaths()` läuft im Schritt „Bearbeitung“ mit und zeichnet die Linien zyan (`#22d3ee`) in die Bühne; die Legende bekommt einen Eintrag, der berechnete Weg verdeckt die Vorschau. Gerechnet wird zurückgestellt (`useDeferredValue`), damit Regler beim Ziehen flüssig bleiben.
- `computeCenterlines` liefert je Kontur ein Stück: entweder eine echte Mittellinie (`centerline: true`) oder – bei zu breiter Form – die Kontur selbst (`centerline: false`). Die Vorschau zeigt nur die Mittellinien, der Werkzeugweg nimmt beides. So geht keine markierte Linie verloren.
- Vorschau und Werkzeugweg nutzen dieselbe Funktion (`centerlinePaths`), getrennt je Schnittebene – was zyan erscheint, wird auch gefräst. Mehrere Ebenen werden nicht mehr zu einem Raster verschmolzen.
