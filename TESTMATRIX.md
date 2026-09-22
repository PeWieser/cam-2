# Testmatrix – Frontplatten fräsen

Legende: ✅ funktioniert · 🔧 in dieser Runde ergänzt · ⚠️ mit Einschränkung (dokumentiert)

## A · Dateien & Geometrie
| # | Szenario | Status | Anmerkung |
|---|---|---|---|
| A1 | STL binär / ASCII | ✅ | three STLLoader |
| A2 | OBJ (mehrere Objekte) | ✅ | alle Meshes werden vereinigt |
| A3 | 3MF (mehrere Bauteile, Transformationen) | ✅ | matrixWorld wird angewandt |
| A4 | STEP / IGES (CAD-Export der Frontplatte) | ✅ | occt-import-js (WASM, CDN) |
| A5 | Datei in Zoll statt mm | 🔧 | Skalierung + „×25,4“-Knopf in *Ausrichtung* |
| A6 | Platte liegt „falsch herum“ / auf der Seite | ✅ | Oberseite Z±/X±/Y± |
| A7 | Platte im Modell gedreht (Text steht auf dem Kopf) | 🔧 | Drehung um Z (0/90/180/270°) |
| A8 | Gravur von hinten (Acryl, spiegelverkehrt) | 🔧 | Spiegeln in *Ausrichtung* |
| A9 | Nicht wasserdichtes Mesh (offene Kanten) | ✅ | offene Konturen werden als offene Pfade graviert |
| A10 | Sehr feine Kurven (Bohrungen, Schriftrundungen) | ✅ | Kurvengenauigkeit einstellbar; Douglas-Peucker |

## B · Was auf einer Frontplatte vorkommt
| # | Szenario | Status | Anmerkung |
|---|---|---|---|
| B1 | Beschriftung als Vertiefung im CAD modelliert | ✅ | Schnitt 0,1 mm unter Oberkante zeigt Plattenrand + Schrift; Rand überspringen |
| B2 | Beschriftung erhaben (auf der Platte) | ✅ | Schnitt knapp unter der Schriftoberkante zeigt nur die Schrift |
| B3 | Erhabene Schrift **und** Bohrungen in derselben Platte | 🔧 | **Mehrere Schnittebenen** (Schrift oben, Bohrungen tiefer) |
| B4 | Dünne Schrift als einfacher Strich (Mittellinie) | ✅ | Strategie Mittellinie (Gratverfolgung auf der Distanztransformation, siehe H) |
| B5 | Schriftlinien als Doppelkontur (Umriss) | ✅ | Strategie Umriss |
| B6 | Bohrungen für Potis/Schalter/LEDs durchfräsen | 🔧 | **Bearbeitung „Durchbruch“ je Kontur**, Tiefe = Material + Übermaß |
| B7 | Plattenumriss durchfräsen | 🔧 | Durchbruch mit **Haltestegen**, wird zuletzt gefräst |
| B8 | Displayfenster / Ausschnitt (rechteckig, gerundet) | 🔧 | Durchbruch innen |
| B9 | Vertiefung mit definierter Tiefe (Tasche, z. B. für Label) | 🔧 | Bearbeitung „Tasche“ mit eigener Tiefe + Schraffur |
| B10 | Tasche mit Insel (Steg bleibt stehen) | 🔧 | Even-Odd-Füllung: Insel-Kontur ebenfalls als Tasche markieren |
| B11 | Buchstaben-Innenflächen (Konturen im „O“, „A“, „8“) | ✅ | Verschachtelungstiefe erkannt, Innen/Außen korrekt |
| B12 | Skalenstriche / Linien (offene Pfade) | ✅ | offene Pfade, mehrere Zustellungen vor/zurück |
| B13 | Kleinste Artefakt-Konturen (< 0,5 mm) | ✅ | Filter „kürzer als … überspringen“ |
| B14 | Teile der Platte nicht bearbeiten (nur linke Hälfte) | ✅ | Konturen einzeln überspringen (Klick / Liste) |

## C · Werkzeug & Maschine
| # | Szenario | Status | Anmerkung |
|---|---|---|---|
| C1 | V-Stichel 30°/60°/90° | ✅ | Gravurbreite wird berechnet |
| C2 | Schaftfräser (für Durchbrüche) | 🔧 | Spitzenwinkel 0° = zylindrisch |
| C3 | Werkzeugradius-Korrektur bei Löchern (innen) & Umriss (außen) | 🔧 | automatisch nach Verschachtelung; abschaltbar |
| C4 | Loch kleiner als Werkzeug | 🔧 | wird übersprungen + Warnung |
| C5 | Gleichlauf / Gegenlauf | 🔧 | Fräsrichtung wählbar (nur Durchbruch/Tasche relevant) |
| C6 | Mehrere Zustellungen bei Alu (0,2–0,3 mm) | ✅ | Zustellung je Durchgang |
| C7 | Nullpunkt vorne links auf Oberfläche (üblich) | ✅ | 3×3 + Oberfläche |
| C8 | Nullpunkt Unterseite/Opferplatte (bei Durchbrüchen sicherer) | 🔧 | Z0 = Unterseite (Material­stärke) |
| C9 | Sicherheitshöhe über Spannpratzen | ✅ | einstellbar |
| C10 | Steuerungen GRBL / LinuxCNC / Mach3 / Marlin | ✅ | Presets + eigene Blöcke |
| C11 | Werkzeugwechsel zwischen Gravur und Durchbruch | ⚠️ | Ein Werkzeug je Programm. Empfehlung: zwei Programme (einmal nur Gravur, einmal nur Durchbruch markieren); Pause M0 per Snippet |
| C12 | Spindel-Hochlaufzeit | ✅ | G4 in Start-Preset |

## D · Sicherheit des G-Codes
| # | Prüfung | Status |
|---|---|---|
| D1 | Erste Bewegung ist immer G0 Z Sicherheitshöhe | ✅ |
| D2 | Kein Eilgang unterhalb der Oberfläche | ✅ (Test) |
| D3 | Eintauchen mit Eintauchvorschub, Fräsen mit XY-Vorschub | ✅ |
| D4 | Explizites G0/G1 je Zeile (keine Modalität nötig) | ✅ |
| D5 | Haltestege werden erst in den Durchgängen unterhalb der Steghöhe aktiv | 🔧 |
| D6 | Reihenfolge: Gravur → Taschen → Löcher → Umriss zuletzt | 🔧 |
| D7 | G-Code = angezeigter 3D-Weg (eine Datenquelle) | ✅ |

## E · Bedienung
| # | Prüfung | Status |
|---|---|---|
| E1 | Schritte in fester, verständlicher Reihenfolge | ✅ |
| E2 | Berechnung nur auf Knopfdruck, veraltete Ergebnisse markiert | ✅ |
| E3 | Undo/Redo für alle Einstellungen | ✅ |
| E4 | Presets & Befehle per Drag & Drop in Start/Ende | 🔧 |
| E5 | G-Code am Ende als Code lesbar (Syntaxfarben, Zeilennummern) | 🔧 |
| E6 | Kopieren (Strg+C) und Download | ✅ |
| E7 | Leerer Zustand mit klarer Einladung | ✅ |
| E8 | Vorschaukarte beim Teilen (WhatsApp, Teams, Telegram) mit Bild, Titel, Beschreibung | 🔧 |
| E9 | Auf den Homescreen gelegt (iPhone): eigenes Icon, Name „Gravura“, ohne Browserleisten | 🔧 |

## F · Modi
| # | Szenario | Status | Anmerkung |
|---|---|---|---|
| F1 | „Einfach“: Modell → Gravur → Berechnen → Export | 🔧 | vier Schritte; Ausrichtung, Schnittebene, Nullpunkt, Auswahl und Werkzeug auf Werkseinstellung |
| F2 | „Standard“: alle Schritte ohne Feineinstellungen | 🔧 | Kurvengenauigkeit, Zeilenabstand, Radiusausgleich, Stegmaße, Maßstab, Eintauchen und eigene Programmzeilen fehlen |
| F3 | „Experte“: vollständiger Umfang | ✅ | wie vor den Modi |
| F4 | Wechsel auf „Einfach“ mit mehreren Ebenen und Zuweisungen | 🔧 | eine Ebene, Zuweisung zurückgesetzt – rückgängig machbar |
| F5 | Wechsel aus einem Schritt, den der neue Modus nicht kennt | 🔧 | Sprung auf den letzten gemeinsamen Schritt |
| F6 | Modus **und** Einstellungen überstehen einen Neustart | 🔧 | `gravura:mode` und `gravura:settings` im Browser; altes/halbes Schema fällt auf Werkseinstellung zurück; bei gesperrtem Speicher „Standard“ ohne Fehler |
| F7 | „Einfach“ erzeugt dasselbe Programm wie „Experte“ mit Werkseinstellungen | ✅ (Test) | gleiche Pipeline, keine eigenen Standardwerte |
| F8 | Umschalter beschriftet alle drei Modi vollständig | 🔧 | Breite nach Inhalt, kein Abschneiden von „Standard“ |
| F9 | „Einstellungen zurücksetzen“ im Header löscht Modus-werte nicht, aber alle Einstellungen | 🔧 | rückgängig machbar, Knopf inaktiv auf Werkseinstellung |

## G · Bildschirme
| # | Szenario | Status | Anmerkung |
|---|---|---|---|
| G1 | Handy (< 768 px): Schrittleiste waagerecht, Bühne darüber, Einstellungen darunter | 🔧 | umgestellte Reihenfolge; Einstellungen rollen selbst, Fußzeile bleibt sichtbar |
| G2 | Handy: aktueller Schritt wird in der Leiste nachgezogen | 🔧 | scrollIntoView beim Schrittwechsel |
| G3 | Handy: zweizeiliger Kopf, Umschalter bleibt vollständig | 🔧 | Modus-Umschalter gibt keine Breite ab, Beisatz wird gekürzt |
| G4 | Tablet (768–1023 px): drei Spalten, schmaler | 🔧 | 148 px Ablauf, 320 px Einstellungen |
| G5 | Desktop (≥ 1024 px): unverändert | ✅ | 168 px Ablauf, 380 px Einstellungen |
| G6 | Bühne folgt Größenänderungen | ✅ | ResizeObserver |
| G7 | Drehen/Zoomen mit dem Finger, kein Pull-to-Refresh | 🔧 | touch-action, overscroll-behavior |
| G8 | Home-Leiste (iOS) verdeckt „Zurück/Weiter“ nicht | 🔧 | env(safe-area-inset-bottom) |

## H · Mittellinie

| # | Szenario | Status | Anmerkung |
|---|---|---|---|
| H1 | Gerader Strich, 0,6 mm breit | ✅ | 1 Zug, 19,97 mm von 20 mm, Endpunkt 0,02 mm vor der Kappe |
| H2 | Strich 30° gedreht | ✅ | 1 Zug (vorher 80), 19,96 mm |
| H3 | Strich 45° gedreht | ✅ | 1 Zug (vorher gar nichts mehr übrig), 19,95 mm |
| H4 | Strich 5° gedreht (fast waagerecht) | ✅ | 1 Zug |
| H5 | Senkrechter Strich | ✅ | 1 Zug |
| H6 | Kreisbogen (r = 10 mm, 200°) | ✅ | 1 Zug, 33,84 mm |
| H7 | „H“ als echte Außenkontur | ✅ | 4 Züge: zwei Senkrechte über die volle Höhe (0,02 – 7,99 mm), Querbalken, Kreuzungsübergang |
| H8 | „L“ (Winkel) | ✅ | 2 Züge, 16,8 mm; Ecke bleibt rund, kein Sprung |
| H9 | „O“ als Ring (Außen- + Innenkontur) | ✅ | 1 geschlossener Zug, Länge 50,19 mm (ideal 50,27) |
| H10 | Drei sehr dünne Striche (0,15 mm) | ✅ | 3 Züge, Länge 44,96 mm (ideal 45) |
| H11 | Sehr feiner Strich (0,2 mm) bei Toleranz 0,2 mm | ✅ | Auflösung wird selbstständig verfeinert (≈ 8 Pixel über die Breite) |
| H12 | Breiter Balken (4 mm) | ✅ | 1 Zug, 19,03 mm – läuft bis fast an die Kappe (vorher 1,9 mm zu kurz) |
| H13 | Gefüllte Fläche 100 × 60 mm | ✅ | **keine** Mittellinie mehr, wird entlang des Umrisses graviert |
| H14 | 120 Striche (8 × 1 mm, im Raster) | ✅ | ~320 ms, ein Zug je Strich |
| H15 | Mehrere Schnittebenen, Formen übereinander | ✅ | je Ebene eigenes Raster, keine Vermischung |
| H16 | Vorschau: „Mittellinie“ wählen | ✅ | Linien erscheinen sofort zyan in der Bühne, knapp über der Ebene |
| H17 | Vorschau bei geändertem Toleranz-Regler | ✅ | rechnet zurückgestellt nach, Bedienung bleibt flüssig |
| H18 | Vorschau nach „Berechnen“ | ✅ | berechneter Weg verdeckt die Vorschau, Legendeneintrag wechselt |
| H19 | Konturen auf „Aus“ oder „Tasche“ gesetzt | ✅ | erscheinen nicht in der Vorschau |
| H20 | Zwei Gravurstücke mit < 0,3 mm Abstand | ✅ | werden ohne Abheben verbunden (`LINK_GAP`) |
| H21 | **Platte mit vertiefter Schrift („10“)** | ✅ | Mittellinien liegen **in** den Buchstaben, nicht mehr außen herum; 4 Züge, 31,4 mm statt 210 mm Skelett um die Zeichen |
| H22 | Plattenrand allein (100 × 60 mm, eine Kontur) | ✅ | als Fläche erkannt → Kontur graviert, kein Skelett |
| H23 | Gefülltes Quadrat 20 × 20, Kreis r=10 | ✅ | als Fläche erkannt → Kontur graviert |
| H24 | Rahmen 100 × 60 mm, 5 mm Rand | ✅ | **1 geschlossener Zug**, 297,0 mm – genau mittig im Rand, keine Eckenhäkchen (vorher 7 Züge, 326 mm) |
| H25 | Platte mit drei Schlitzen 10 × 2 mm | ✅ | 3 Züge, 28,5 mm – je Schlitz einer; Platte als Kontur |
| H25b | Platte mit drei Löchern 10 × 10 mm | ✅ | **keine** Mittellinie: Löcher sind Flächen, werden als Kontur graviert |
| H26 | Buchstaben A–Z, a–z, 0–9 (DejaVu, 10 mm) | ✅ | **102 Züge** statt 294 (alt), 0 von 1847 Punkten außerhalb der Form; „B“ 11 → 1 Zug, „M“ 9 → 1, „8“ 11 → 1 |
| H27 | Toleranz 0,01 / 0,02 / 0,05 / 0,1 / 0,2 mm | ✅ | alle Fälle innen, Längen stabil (± 1 %); erst bei 0,2 mm zerfällt ein „B“ wieder in 4 Züge |
| H28 | **„1“ mit spitzer Fahne** | ✅ | **1 Zug, 11,1 mm** durch die Spitze bis ans Strichende – vorher 3 Züge, dazu 3,4 mm Linie quer ins Leere bis an den Rand |
| H29 | Skala als Kamm: 100 mm, 40 Zähne 0,4 mm breit, Lücke 0,1 mm | ✅ | **41 Züge** = eine Grundlinie + 40 Zähne, kein Zahn verschluckt, keine Linie dazwischen (vorher 60) |
| H30 | dto. mit 200 Zähnen, 0,2 mm breit, Lücke 0,3 mm | ✅ | **201 Züge**, 816 mm |
| H31 | Skala aus 20 einzelnen Zähnen (0,5 × 3 mm) | ✅ | 20 Züge, je 2,97 mm von 3 mm |
| H32 | **Schwellwert „Mittellinie bis“** an Platte mit vertieftem „10“ | ✅ | 0,5 mm → 0 Züge (alles Kontur) · 1 mm → 1 Zug (nur die „1“) · 2 mm und 8 mm → 4 Züge (beide Zeichen) |
| H33 | Balken 20 × 8 mm | ✅ | keine Mittellinie – breiter als der Schwellwert, wird entlang des Umrisses graviert |
| H34 | Punkte knapp außerhalb der Form | ✅ | 30°-Strich: 1 von 8 Punkten 0,0016 mm außerhalb – Rasterquantisierung, ohne Belang |
| H35 | **Häkchen in die Ecken** (Anfang, Ende, Mitte der „1“) | ✅ | gekappt und geradeaus bis an den Rand verlängert: „1“ synthetisch **11,2 mm** in einem Zug, Ende 0,24 mm vor der Kappe. Erkennung über den Innenwinkel der Ecke (70–145°): Spitzen bleiben stehen, abgeflachte Kurven werden nicht angetastet, geschlossene Ringe (keine Enden) bleiben ganz |
| H36 | Häkchen bei „H“ 10 mm | ✅ | 3 Züge, 18,7 mm – die Senkrechten enden an den Kappen, kein Bogen in die vier Ecken (vorher 19,6 mm **mit** vier Häkchen) |
| H37 | **Ecke statt Bogen** („L“ 8/1,6 mm) | ✅ | 14,0 mm, schärfste Ecke **90,0°** bei (0,79 / 7,20) – die Schenkel laufen bis zum Schnitt. Vorher 13,0 mm mit 44° verrundet |
| H38 | Ecke beim Zusammenfügen | ✅ | fehlt der Bogen der Achse (dort sitzt kein Maximum der Breite), wird der Schnittpunkt der beiden Schenkel eingesetzt statt einer Sehne quer durch die Ecke – nur, wenn der Umweg klein bleibt (≤ 2,2 × Lücke) |
| H39 | Rahmen 100 × 60 mm, Steg 5 mm | ✅ | **1 geschlossener Zug, 297,8 mm**; theoretisch 297,6 mm (die Achse läuft an den Ecken auf Parabeln, Ecke bei 2,93 / 2,93). Vorher 297,0 mm, zwischenzeitlich offen mit 3,5 mm Lücke |
| H40 | Kreisring r = 8 / 7,6 mm | ✅ | 49,0 mm = 2 π × 7,8 (Mitte des Stegs) – auf 0,1 ‰ genau |
| H41 | Keine Einbußen | ✅ | A–Z, a–z, 0–9 bei 10 mm: 100 Züge, 1031,5 mm, **0** von 1733 Punkten außerhalb; „O“ / „S“ / „8“ / „X“ unverändert 19,9 / 17,2 / 31,5 / 19,1 mm |
| H42 | Rahmen 40 × 40 mm, Steg 5 mm | ⚠️ | 3 Züge, 141,0 mm (vorher 145,4 mm, 3 Züge): an den äußeren Ecken bleiben Häkchen stehen. Ursache: die Laufparameter hängen am Raster, und das Raster ist bei der kleinen Form feiner (0,025 statt 0,0625 mm je Zelle). Kein Rückschritt, aber noch nicht richtig |
