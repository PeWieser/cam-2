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
| B4 | Dünne Schrift als einfacher Strich (Mittellinie) | ✅ | Strategie Mittellinie (Skelettierung) |
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
| F1 | „Schnell“: Modell → Gravur → Berechnen → Export | 🔧 | vier Schritte; Ausrichtung, Schnittebene, Nullpunkt, Auswahl und Werkzeug auf Werkseinstellung |
| F2 | „Standard“: alle Schritte ohne Feineinstellungen | 🔧 | Kurvengenauigkeit, Zeilenabstand, Radiusausgleich, Stegmaße, Maßstab, Eintauchen und eigene Programmzeilen fehlen |
| F3 | „Fein“: vollständiger Umfang | ✅ | wie vor den Modi |
| F4 | Wechsel auf „Schnell“ mit mehreren Ebenen und Zuweisungen | 🔧 | eine Ebene, Zuweisung zurückgesetzt – rückgängig machbar |
| F5 | Wechsel aus einem Schritt, den der neue Modus nicht kennt | 🔧 | Sprung auf den letzten gemeinsamen Schritt |
| F6 | Modus übersteht einen Neustart | 🔧 | im Browser gemerkt; bei gesperrtem Speicher „Standard“ |
| F7 | „Schnell“ erzeugt dasselbe Programm wie „Fein“ mit Werkseinstellungen | ✅ (Test) | gleiche Pipeline, keine eigenen Standardwerte |
