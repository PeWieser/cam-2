# Testmatrix – Frontplatten fräsen mit Stichel

Ziel: Frontplatten (Alu, Acryl, Holz, PCB-Blenden) gravieren und ggf. ausschneiden.
Status nach Prüfung: ✅ vorhanden · ⚠️ teilweise · ❌ fehlte → wird nachgezogen

## A · Datei & Modell

| # | Szenario | Erwartung | Status |
|---|---|---|---|
| A1 | STL binär/ASCII | Mesh lädt, Maße stimmen | ✅ |
| A2 | OBJ mit mehreren Objekten | Alle Meshes zusammen | ✅ |
| A3 | 3MF | Mesh lädt | ✅ |
| A4 | STEP/STP/IGES | Tessellierung via OCCT | ✅ |
| A5 | Leere / kaputte Datei | Klare Fehlermeldung, kein Crash | ✅ |
| A6 | Drag & Drop auf Bühne | Lädt, springt zu Ausrichtung | ✅ |
| A7 | Sehr großes Mesh (>1M Dreiecke) | Lädt; Schnitt kann dauern | ⚠️ akzeptiert |
| A8 | Modell in mm, Z-up | Standardpfad ohne Drehen | ✅ |
| A9 | Modell Y-up (Blender/CAD) | Ausrichtung Y+ / Z+ wählbar | ✅ |
| A10 | Modell „liegend“, Front = X | Ausrichtung X+ | ✅ |

## B · Ausrichtung & Schnitt

| # | Szenario | Erwartung | Status |
|---|---|---|---|
| B1 | Flache Frontplatte, Features oben | Schnitt 0,05–0,2 mm unter Oberkante | ✅ |
| B2 | Erhabene Schrift auf Platte | Nur Schrift-Konturen | ✅ |
| B3 | Vertiefte Schrift (Gravur im CAD) | Schnitt in Vertiefung trifft Kanten | ✅ |
| B4 | Schnitt in Plattenmitte | Äußerer Umriss der Platte | ✅ |
| B5 | Schnitt unter Modell | Warnung „keine Konturen“ | ✅ |
| B6 | Sehr dünne Features (<0,3 mm) | minLength-Filter | ✅ |
| B7 | Viele Inseln (Logo + Text + Icons) | Alle als separate Konturen | ✅ |
| B8 | Verschachtelt (Ring, Loch in Fläche) | depth/even-odd korrekt | ✅ |

## C · Frontplatten-Inhalte (Inhalt)

| # | Szenario | Strategie | Erwartung | Status |
|---|---|---|---|---|
| C1 | Gerätebeschriftung (Linientext) | Umriss | Buchstaben-Konturen | ✅ |
| C2 | Einzeilige Zahlen / Logos dünn | Mittellinie | Ein Strich je Glyphe | ✅ |
| C3 | Gefülltes Logo / Icon | Fläche | Schraffur + Kontur | ✅ |
| C4 | Nur Innen-Features, Außenkante weg | Auswahl | Außenkante ignore | ✅ |
| C5 | Nur Außenkontur ausschneiden | Umriss + außen | Offset um Werkzeugradius | ✅ |
| C6 | Tasche (Senke) innen | Umriss + innen | Offset nach innen | ✅ |
| C7 | Bohrungen als Kreise im Schnitt | Umriss | Kreise als Konturen | ✅ |
| C8 | Mischbetrieb Text+Logo | Auswahl + eine Strategie | Manuell filterbar | ⚠️ eine Strat./Job (bewusst) |
| C9 | Spiegelverkehrte Front (Rückseite) | Mirror Y | G-Code gespiegelt | ✅ |
| C10 | Mehrere Zustellungen tief | stepDown < depth | n Durchgänge | ✅ |

## D · Nullpunkt & Maschine

| # | Szenario | Erwartung | Status |
|---|---|---|---|
| D1 | Null vorne links, Z=Oberfläche | Klassisch Fräse | ✅ |
| D2 | Null Mitte, Z=Oberfläche | Zentrierter Stock | ✅ |
| D3 | Null hinten rechts | Alle 9 Positionen | ✅ |
| D4 | Z0 = Gravurgrund | Positive Z bis Oberfläche | ✅ |
| D5 | Sicherheitshöhe 3–10 mm | Alle Eilgänge ≥ safe | ✅ |
| D6 | Kein Eilgang unter Werkstück | rapid nur bei Z≥safe | ✅ |

## E · Werkzeug (Stichel)

| # | Szenario | Erwartung | Status |
|---|---|---|---|
| E1 | 30° / 0,1 mm Spitze | Darstellung + Breite-Hinweis | ✅ |
| E2 | 60° / 0,2 mm | Breite-Formel stimmt | ✅ |
| E3 | Vorschub / Eintauchen / RPM | Im G-Code F und S | ✅ |
| E4 | Werkzeug in 3D über Null | Sichtbar ab Schritt Werkzeug | ✅ |
| E5 | Simulation fährt Pfad ab | Progress 0–100 % | ✅ |

## F · Berechnung & G-Code

| # | Szenario | Erwartung | Status |
|---|---|---|---|
| F1 | Nie automatisch berechnen | Nur Knopf | ✅ |
| F2 | Nach Änderung „veraltet“ | Banner + Neu berechnen | ✅ |
| F3 | Geschlossene Kontur, 2 Zustellungen | Plunge, Schnitt, Plunge tiefer | ✅ |
| F4 | Offener Pfad, 2 Zustellungen | Vor + zurück | ✅ |
| F5 | Pfadreihenfolge nächster Start | Wenig Eilgang | ✅ |
| F6 | G0/G1 explizit je Zeile | Kein modaler Drift | ✅ |
| F7 | Erste Bewegung G0 Zsafe | Sicher | ✅ |
| F8 | Start/Ende-Blöcke mit Platzhaltern | {rpm}{safe}{feed} | ✅ |
| F9 | Presets GRBL / LinuxCNC / Marlin | Einsetzbar | ✅ |
| F10 | Snippets per Klick + Drag in Editor | Werden zu Code | ✅ |
| F11 | G-Code als Code lesbar | Zeilennummern, Syntax | ✅ |
| F12 | Download .gcode + Kopieren + Strg+C | ✅ | ✅ |
| F13 | Export ≡ Bühnen-Pfad | Dieselbe Move-Liste | ✅ |

## G · Bedienung

| # | Szenario | Erwartung | Status |
|---|---|---|---|
| G1 | Stepper vorwärts/zurück | Nur mit Modell freigeschaltet | ✅ |
| G2 | Undo/Redo Einstellungen | Strg+Z | ✅ |
| G3 | Kontur auf Bühne klicken | Toggle ignore | ✅ |
| G4 | Esc stoppt Simulation | ✅ | ✅ |
| G5 | Leerer Zustand | Einladung Drag & Drop | ✅ |
| G6 | Fehlergrenze WebGL | Meldung statt Weiß | ✅ |

## H · Typische Frontplatten-Jobs (End-to-End)

| # | Job | Schritte | Status |
|---|---|---|---|
| H1 | Alu-Blende: Logo + Schrift gravieren | Schnitt oben → Außen ignore → Mittellinie/Umriss → 0,2 mm | ✅ |
| H2 | Acryl: gefülltes Icon | Fläche, stepOver 0,3 | ✅ |
| H3 | Holzschild: Außenkontur freistellen | Umriss außen, Schaft-Ø, Tiefe = Platte | ✅ |
| H4 | Rack-Panel: nur Beschriftung, Löcher ignorieren | Auswahl | ✅ |
| H5 | Rückseitige Gravur (Spiegel) | Mirror Y | ✅ |
