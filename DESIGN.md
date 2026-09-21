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

## Teilen & Homescreen
- Vorschaukarte für WhatsApp, Teams, Telegram, Slack: `public/og-image.png` (1200×630) aus `src/assets/og-image.svg` per `npm run og`. Großes Motiv links, Wortmarke und zwei Zeilen Text rechts – in der Miniatur zählt das Bild, nicht der Text.
- `index.html` trägt OG- und Twitter-Tags inklusive Bildmaßen. Die Adressen sind relativ; sobald die Domain feststeht, in `og:image` und `og:url` absolut eintragen (Kommentar im HTML) – X/Twitter und Facebook verlangen das.
- Homescreen (iPhone/iPad): randlose `apple-touch-icon-{120,152,167,180}.png` – iOS rundet selbst und will keine Transparenz. `apple-mobile-web-app-title` beschriftet das Icon, `apple-mobile-web-app-capable` startet ohne Safari-Leisten. Farbe der Statusleiste: `default` (kein `black-translucent`, sonst läuft der Inhalt darunter weg).
- Schrift im Vorschaubild: Geist als Teilmenge unter `assets/fonts/` inklusive Lizenz (OFL). Fehlt sie, rendert `npm run og` mit einer Systemschrift und warnt.

## Modi
Wähler im Header („Modus“ links neben Undo/Redo). Die Wahl wird im Browser gemerkt (`gravura:mode`), Standard ist **Standard**.

| Modus | Schritte | Es fehlen |
| --- | --- | --- |
| **Schnell** | Modell → Gravur → Berechnen → Export | Ausrichten, Schnittebenen, Nullpunkt, Auswahl, Werkzeug, Programm |
| **Standard** | alle zehn | Feineinstellungen: Kurvengenauigkeit, Zeilenabstand, Radiusausgleich, Stegmaße, Maßstab, Eintauchen, eigene Programmzeilen |
| **Fein** | alle zehn | nichts |

- Befund: Zehn Schritte und jede Stellschraube überfordern, wenn nur eine Schrift graviert werden soll. Maßnahme: „Schnell“ fragt Gravurtiefe, Werkzeug und Maschine; der Rest steht auf bewährten Werten (Oberseite Z+, eine Schnittebene 0,1 mm unter der Oberkante, Nullpunkt vorne links auf der Oberfläche, alle Linien = Gravur).
- Befund: Ein Modus-Wechsel darf keine halb eingestellte Maschine zurücklassen. Maßnahme: „Schnell“ reduziert beim Wechsel auf eine Schnittebene und setzt die Linienzuweisung zurück – beides rückgängig machbar.
- Befund: Ausgeblendete Schritte dürfen den Ablauf nicht verbiegen. Maßnahme: Nummerierung, „Weiter“ und Alt+←/→ arbeiten auf der gefilterten Liste. Landet man in einem Schritt, den der neue Modus nicht kennt, springt die App auf den letzten gemeinsamen.
- Befund: „Berechnen“ weglassen spart Zeit, nimmt aber die Kontrolle. Maßnahme: der Knopf bleibt in allen Modi – auch in „Schnell“.
- Regel für neue Felder: Ein Feld bekommt eine Modus-Schwelle nur, wenn es im Alltag selten gebraucht wird. Was das Ergebnis sichtbar verändert, bleibt in „Standard“ sichtbar.
- Die Modi stecken in `MODE_STEPS` (Schritte) und `visibleIn(mode, min)` (Felder). Neue Schritte gehören in `STEPS` **und** in die Liste jedes Modus.
