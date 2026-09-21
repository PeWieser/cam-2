# Stichel – Designprotokoll

## Ablauf (verbindlich)
1. Modell laden (Drag & Drop / Datei) → 2. Oberseite wählen → 3. Schnittebene (Tiefe unter Oberkante, Konturen live)
→ 4. Nullpunkt (3×3 + Z-Referenz, Pfeile auf der Bühne) → 5. Gravur (Strategie, Tiefe, Zustellung, Sicherheitshöhe)
→ 6. Auswahl (Konturen per Klick auf der Bühne überspringen, „Außenkante überspringen“)
→ 7. Werkzeug (Stichel in 3D über dem Nullpunkt) → 8. Berechnen (nur manuell; 3D-Weg + Simulation, 2D = Ansicht von oben)
→ 9. Programm (Start/Ende, Presets GRBL/LinuxCNC/Marlin/minimal, Snippets) → 10. Export (Download, Kopieren, Strg+C).

## Befund → Maßnahme
- Schnitt bei 50 % Höhe erfasste bei „Würfel mit Zahl“ nur den Würfel. → Schnitt relativ zur Oberkante (Standard 0,1 mm), Konturen sofort sichtbar.
- Automatische Neuberechnung bei jeder Eingabe. → Nur auf Knopfdruck; veraltete Ergebnisse werden als solche markiert.
- G-Code: modale Zeilen ohne G-Wort, erster Verfahrweg ohne garantierte Sicherheitshöhe. → Explizites G0/G1 je Zeile, `G0 Z{safe}` immer als erste Bewegung.
- Export ≠ Bühne. → G-Code und 3D-Weg entstehen aus derselben Move-Liste.
- Kein Undo. → Zustandsbasiertes Undo/Redo (Strg+Z / Strg+Shift+Z) für alle Einstellungen inkl. Auswahl.
- Frontplatte freistellen/Tasche. → `pathSide` on|outside|inside mit Schaft-Ø/2-Offset.
- Rückseitengravur. → `mirrorY`.
- Presets nur Klick. → Chips drag & drop in Start/Ende-Felder, morphen zu Code.
- G-Code unsichtbar. → Export-Schritt: Code-Pane rechts neben der Bühne mit Syntaxfarben.
- „Außenkante“ unklar bei Inseln. → Größte Kontur + „Nur Features“.

Siehe TESTMATRIX.md für alle Frontplatten-Szenarien.

## Tokens
Farben ausschließlich über `--mw-*` (light-dark). Ausnahme: Three.js-Canvas (`C` in Stage.tsx, dokumentiert).
Geist Sans für Text, Geist Mono + tabular-nums (`.num`) für alle Zahlen. Akzent nur für aktiv/Fokus/primäre Aktion.

## Tastatur
Strg+Z / Strg+Shift+Z Undo/Redo · Alt+←/→ Schritt · Esc stoppt Simulation · Strg+C im Export kopiert G-Code.
