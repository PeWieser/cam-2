import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Lang = 'de' | 'en';

export function detectSystemLanguage(): Lang {
  try {
    const saved = localStorage.getItem('gravura:lang');
    if (saved === 'de' || saved === 'en') return saved;
  } catch {
    // localStorage might be unavailable or restricted
  }

  if (typeof navigator !== 'undefined') {
    const languages = navigator.languages || [navigator.language];
    for (const l of languages) {
      if (!l) continue;
      const lower = l.toLowerCase();
      if (lower.startsWith('de')) return 'de';
      if (lower.startsWith('en')) return 'en';
    }
  }
  return 'en';
}

export const DICT = {
  de: {
    // Header & Meta
    appTitle: 'Gravura – 3D-Modell zu Gravur-G-Code',
    appSubtitle: '· Frontplatten aus 3D-Modellen fräsen',
    mode: 'Modus',
    undoTitle: 'Rückgängig (Strg+Z)',
    redoTitle: 'Wiederholen (Strg+Shift+Z)',
    resetTitle: 'Alle Einstellungen auf Werkseinstellung zurücksetzen',
    close: 'Schließen',
    back: 'Zurück',
    next: 'Weiter',
    workflow: 'Ablauf',

    // Drag & Drop
    dropzoneTitle: '3D-Datei hierher ziehen',
    dropzoneSubtitle: 'oder „Datei wählen“ im nächsten Schritt',

    // Legend & Stage
    legendCenterline: 'Mittellinie',
    legendRapid: 'Eilgang',
    legendControls: 'Ziehen: drehen · Rad: zoomen · Rechts: verschieben',
    legendClickToAssign: 'Klick auf eine Linie → ',
    webglUnavailable: 'WebGL ist in diesem Browser nicht verfügbar.',

    // Errors
    errorFileRead: 'Datei konnte nicht gelesen werden.',
    errorNoToolpath: 'Mit diesen Einstellungen entsteht kein Werkzeugweg.',
    errorComputeFailed: 'Berechnung fehlgeschlagen.',
    errorGenericTitle: 'Etwas ist schiefgelaufen',
    reload: 'Neu laden',

    // Modes
    modes: {
      einfach: {
        label: 'Einfach',
        hint: 'Kurzer Weg: Modell rein, Gravur einstellen, berechnen, G-Code raus',
      },
      standard: {
        label: 'Standard',
        hint: 'Üblicher Weg: ausrichten, schneiden, Linien zuweisen, fertig',
      },
      experte: {
        label: 'Experte',
        hint: 'Alle Stellschrauben: Kurvengenauigkeit, Radiusausgleich, Stege, eigener Programmrahmen',
      },
    },

    // Operations
    ops: {
      engrave: 'Gravur',
      pocket: 'Tasche',
      cut: 'Durchbruch',
      off: 'Aus',
    },
    opHints: {
      engrave: 'Gravieren',
      pocket: 'Fläche ausräumen',
      cut: 'Durchfräsen (Loch/Umriss)',
      off: 'Nicht fräsen',
    },

    // Steps
    steps: {
      model: 'Modell',
      orient: 'Ausrichtung',
      slice: 'Schnittebenen',
      origin: 'Nullpunkt',
      machining: 'Bearbeitung',
      select: 'Auswahl',
      tool: 'Werkzeug',
      compute: 'Berechnen',
      program: 'Programm',
      export: 'Export',
    },

    // Step 1: Model
    stepModel: {
      title: 'Modell laden',
      lead: 'Ziehe die 3D-Datei deiner Frontplatte auf die Bühne oder wähle sie aus. Alles bleibt auf deinem Rechner.',
      btnLoading: 'Wird gelesen…',
      btnChange: 'Andere Datei wählen',
      btnChoose: 'Datei wählen',
      triangles: 'Dreiecke',
      formats: 'STL · OBJ · 3MF · STEP · IGES',
    },

    // Step 2: Orient
    stepOrient: {
      title: 'Ausrichten',
      lead: 'Welche Seite zeigt nach oben zum Fräser? Drehe die Platte so, wie sie später auf der Maschine liegt.',
      topSide: 'Oberseite',
      axisHint: (axis: string) => `Modellachse ${axis} zeigt nach oben`,
      planeRotation: 'Drehung in der Ebene',
      mirror: 'Spiegeln (Gravur von der Rückseite, z. B. Acryl)',
      scale: 'Maßstab',
      scaleInchToMm: 'Zoll → mm',
      scaleMm: 'mm',
      scaleBtnTitle: 'Datei in Zoll → Millimeter',
      widthX: 'Breite X',
      depthY: 'Tiefe Y',
      heightZ: 'Höhe Z',
      warnSmallModel: 'Das Modell ist sehr klein – wurde es in Zoll gespeichert? Dann „Zoll → mm“.',
    },

    // Step 3: Slice
    stepSlice: {
      title: 'Schnittebenen',
      lead: 'Die Platte wird waagerecht aufgeschnitten; die Linien des Schnitts werden gefräst. Knapp unter der Oberkante findest du Schrift und Löcher. Liegt Schrift erhaben über der Platte, füge eine zweite Ebene tiefer hinzu, um Löcher und Umriss zu erfassen.',
      planeLabel: (i: number) => `Ebene ${i}`,
      contoursCount: (count: number) => `${count} Konturen`,
      removePlane: 'Ebene entfernen',
      depthBelowTop: 'Tiefe unter Oberkante',
      center: 'Mitte',
      addPlane: 'Ebene hinzufügen',
      tolerance: 'Kurvengenauigkeit',
      toleranceHint: 'Maximale Abweichung von der Originalkurve. Kleiner = feiner, längerer G-Code.',
      warnNoIntersection: 'Auf dieser Höhe schneidet die Ebene das Modell nicht. Schiebe den Regler etwas tiefer.',
    },

    // Step 4: Origin
    stepOrigin: {
      title: 'Nullpunkt',
      lead: 'Wo steht der Fräser bei X0 Y0 Z0? Die Pfeile zeigen den Punkt an der Platte – dort wird an der Maschine der Nullpunkt angetastet.',
      xyOriginLabel: 'Nullpunkt XY',
      zOriginLabel: 'Z-Nullpunkt',
      zTop: 'Oberfläche',
      zTopHint: 'Z0 auf der Plattenoberfläche (üblich für Gravuren)',
      zBottom: 'Unterseite',
      zBottomHint: 'Z0 auf der Opferplatte – sicherer bei Durchbrüchen',
      zSurfaceNote: (mat: string) => `Die Oberfläche liegt dann bei Z ${mat} (Materialstärke).`,
      gridHelp: 'Oben = hinten (Y+),\nunten = vorne (Y−)',
      origins: {
        'back-left': 'hinten links',
        'back-center': 'hinten Mitte',
        'back-right': 'hinten rechts',
        'center-left': 'Mitte links',
        'center': 'Mitte',
        'center-right': 'Mitte rechts',
        'front-left': 'vorne links',
        'front-center': 'vorne Mitte',
        'front-right': 'vorne rechts',
      },
    },

    // Step 5: Machining
    stepMachining: {
      titleSimple: 'Gravur',
      leadSimple: 'Wie tief gefräst wird und womit. Material, Vorschub und Programmrahmen stehen auf bewährten Werten – unter „Standard“ und „Experte“ kommen sie dazu.',
      title: 'Bearbeitung',
      lead: 'Drei Arten, die du im nächsten Schritt einzelnen Linien zuweist: Gravur (Standard), Tasche und Durchbruch. Hier legst du für jede die Tiefen fest.',
      stepDown: 'Zustellung je Durchgang',
      safeZ: 'Sicherheitshöhe',
      engraveTitle: 'Gravur',
      engraveSub: 'Schrift, Linien, Skalen',
      engraveDepth: 'Gravurtiefe',
      engraveDepthHint: '0,3 mm ist für Schrift meist genau richtig.',
      engraveDepthShort: 'Tiefe',
      engraveModeContour: 'Umriss abfahren',
      engraveModeContourHint: 'Jede Linie wird genau abgefahren',
      engraveModeCenterline: 'Mittellinie',
      engraveModeCenterlineHint: 'Schrift als ein Strich in der Mitte',
      centerlineNotice: 'Die Mittellinien erscheinen sofort zyan in der Ansicht – ein Strich wird dabei in einem Zug gefräst, ohne dass der Kopf zwischendurch abhebt.',
      centerlineWidth: 'Mittellinie bis',
      centerlineWidthHint: 'Schwelle zwischen Strich und Fläche: Bis zu dieser Breite bekommt eine Form eine Mittellinie. Alles Breitere wird entlang seines Umrisses graviert – stell den Wert kleiner, wenn irgendwo Linien entstehen, wo keine hingehören.',
      pocketTitle: 'Tasche',
      pocketSub: 'Flächen bis zu einer Tiefe ausräumen',
      pocketDepth: 'Tiefe',
      pocketStepOver: 'Zeilenabstand',
      cutTitle: 'Durchbruch',
      cutSub: 'Löcher, Fenster, Plattenumriss',
      material: 'Materialstärke',
      takeModelHeight: 'Modellhöhe übernehmen',
      cutOvershoot: 'Übermaß nach unten',
      cutDir: 'Fräsrichtung',
      cutDirClimb: 'Gleichlauf',
      cutDirConv: 'Gegenlauf',
      tabCount: 'Haltestege',
      tabWidth: 'Stegbreite',
      tabHeight: 'Steghöhe',
      compensate: 'Werkzeugradius ausgleichen (Löcher innen, Umriss außen)',
      cutNotes: 'Haltestege nur am Plattenumriss. Durchbrüche werden zuletzt gefräst, der Umriss ganz am Ende.',
      toolChoice: 'Werkzeug',
      toolV: 'V-Stichel',
      toolVHint: 'Kegelförmig – feine Linien, Breite wächst mit der Tiefe',
      toolFlat: 'Schaftfräser',
      toolFlatHint: 'Zylindrisch – überall gleich breite Nut',
      machine: 'Maschine',
      engraveWidthNote: (depth: string, width: string, presetName: string) =>
        `Gravurbreite bei ${depth} mm Tiefe: ${width} mm. Alles andere übernimmt ${presetName}.`,
    },

    // Step 6: Select
    stepSelect: {
      title: 'Linien zuweisen',
      lead: 'Wähle unten eine Bearbeitung und klicke auf der Bühne die Linien an, die sie bekommen sollen. Erneutes Klicken setzt sie auf Gravur zurück.',
      assignOnClick: 'Beim Klick zuweisen',
      outerOff: 'Außenkante aus',
      outerOffTitle: 'Plattenrand nicht bearbeiten',
      outerCut: 'Außenkante = Durchbruch',
      outerCutTitle: 'Plattenrand durchfräsen',
      reset: 'Zurücksetzen',
      minLength: 'Kürzer als … ignorieren',
      planePrefix: (p: number) => `E${p} · `,
      lineNumber: (n: number) => `Linie ${n}`,
      outer: ' · außen',
      inner: (d: number) => ` · innen ${d}`,
      open: ' · offen',
      opAria: 'Bearbeitung',
      warnNoLines: 'Keine Linie ausgewählt – es gäbe nichts zu fräsen.',
    },

    // Step 7: Tool
    stepTool: {
      title: 'Werkzeug',
      lead: 'Das Werkzeug erscheint über dem Nullpunkt. Die Maße bestimmen Gravurbreite und Radiusausgleich.',
      toolV: 'V-Stichel',
      toolVHint: 'Kegelförmig – für Gravuren',
      toolFlat: 'Schaftfräser',
      toolFlatHint: 'Zylindrisch – für Durchbrüche und Taschen',
      tipAngle: 'Spitzenwinkel',
      tipDiaV: 'Spitze Ø',
      tipDiaFlat: 'Fräser Ø',
      shaftDia: 'Schaft Ø',
      engraveWidthNote: (depth: string, width: string) => `Gravurbreite bei ${depth} mm: ${width} mm`,
      warnVBitConical: ' · Durchbrüche werden mit V-Stichel konisch.',
      feedXY: 'Vorschub',
      feedZ: 'Eintauchen',
      rpm: 'Drehzahl',
      unitMmMin: 'mm/min',
      unitRpm: 'U/min',
    },

    // Step 8: Compute
    stepCompute: {
      title: 'Werkzeugweg berechnen',
      lead: 'Erst auf Knopfdruck entsteht der komplette Fahrweg. Farbig ist Fräsen, rot gestrichelt Eilgang. Danach kannst du den Fräser den Weg abfahren lassen.',
      btnComputing: 'Berechne…',
      btnRecompute: 'Neu berechnen',
      btnCompute: 'Werkzeugweg berechnen',
      warnStale: 'Einstellungen wurden geändert – der gezeigte Weg ist veraltet. Bitte neu berechnen.',
      warnNoLines: 'Keine Linien zugewiesen. Gehe zurück zu „Auswahl“ oder „Schnittebenen“.',
      statCut: 'Fräsweg',
      statRapid: 'Eilgang',
      statPaths: 'Pfade',
      statDuration: 'Dauer ≈',
      simulation: 'Simulation',
      play: 'Abspielen',
      pause: 'Pause',
      view: 'Ansicht',
      view3D: '3D',
      viewTop: 'Von oben (2D)',
    },

    // Step 9: Program
    stepProgram: {
      title: 'Programm-Rahmen',
      leadExpert: 'Was die Maschine vor und nach dem Fräsen tun soll. Ziehe eine Vorlage oder einzelne Befehle in die Felder – oder klicke, um sie am Ende anzuhängen.',
      leadStandard: 'Was die Maschine vor und nach dem Fräsen tun soll. Wähle eine Vorlage – eigene Befehle und Zeilen kommen im Modus „Experte“ dazu.',
      presets: 'Vorlagen',
      presetsHintExpert: '· Klick setzt Start und Ende, Ziehen fügt ein',
      presetsHintStandard: '· Klick setzt Start und Ende',
      start: 'Start',
      end: 'Ende',
      commands: 'Befehle',
      commandsHint: (target: string) => `· Klick hängt an „${target}“ an`,
      previewTitle: 'So sieht der Start aktuell aufgelöst aus',
      placeholdersHint: 'Platzhalter: {rpm} Drehzahl · {safe} Sicherheitshöhe · {feed} Vorschub',
      snippets: {
        pause: { label: 'Pause', desc: 'Programm anhalten (z. B. Werkzeugwechsel)' },
        spindleOn: { label: 'Spindel an', desc: 'Spindel im Uhrzeigersinn starten' },
        spindleOff: { label: 'Spindel aus', desc: 'Spindel stoppen' },
        dwell: { label: 'Warten 2 s', desc: 'Verweilzeit' },
        coolantOn: { label: 'Kühlung an', desc: 'Kühlmittel / Luft ein' },
        coolantOff: { label: 'Kühlung aus', desc: 'Kühlmittel / Luft aus' },
        safeZ: { label: 'Sicherheitshöhe', desc: 'Auf sichere Höhe fahren' },
        toOrigin: { label: 'Zum Nullpunkt', desc: 'XY-Nullpunkt anfahren' },
        probeZ: { label: 'Z antasten', desc: 'Werkzeuglänge per Taster setzen' },
      },
    },

    // Step 10: Export
    stepExport: {
      title: 'Exportieren',
      lead: 'Rechts siehst du das fertige Programm. Es entspricht genau dem berechneten Weg. Herunterladen oder mit Strg + C kopieren.',
      warnNoToolpath: 'Noch kein Werkzeugweg berechnet – gehe zu „Berechnen“.',
      download: 'Herunterladen',
      copy: 'Kopieren',
      copied: 'Kopiert',
      stats: (lines: string, size: string, file: string) => `${lines} Zeilen · ${size} kB · ${file}`,
      viewRight: 'Rechts anzeigen',
      viewGcode: 'G-Code',
      viewStage: '3D-Weg',
      cheatsheet: {
        rapid: 'Eilgang',
        cut: 'Fräsen',
        machine: 'Maschine',
        feed: 'Vorschub',
      },
    },

    // Code area
    codeArea: {
      insertHere: 'Hier einfügen',
    },

    // Toolpath warnings
    warnings: {
      pocketSkipped: (label: string) => `Tasche ${label} ist kleiner als das Werkzeug und wird übersprungen.`,
      cutSkipped: (label: string) => `Durchbruch ${label} ist kleiner als das Werkzeug und wird übersprungen.`,
      vBitCutout: 'Durchbrüche mit V-Stichel werden konisch. Für saubere Kanten Schaftfräser (Spitzenwinkel 0°) verwenden.',
    },
  },

  en: {
    // Header & Meta
    appTitle: 'Gravura – 3D Model to Engraving G-Code',
    appSubtitle: '· Mill front panels from 3D models',
    mode: 'Mode',
    undoTitle: 'Undo (Ctrl+Z)',
    redoTitle: 'Redo (Ctrl+Shift+Z)',
    resetTitle: 'Reset all settings to defaults',
    close: 'Close',
    back: 'Back',
    next: 'Next',
    workflow: 'Workflow',

    // Drag & Drop
    dropzoneTitle: 'Drag 3D file here',
    dropzoneSubtitle: 'or click "Choose file" in the next step',

    // Legend & Stage
    legendCenterline: 'Centerline',
    legendRapid: 'Rapid',
    legendControls: 'Drag: rotate · Wheel: zoom · Right-click: pan',
    legendClickToAssign: 'Click line → ',
    webglUnavailable: 'WebGL is not available in this browser.',

    // Errors
    errorFileRead: 'Could not read file.',
    errorNoToolpath: 'No toolpath generated with these settings.',
    errorComputeFailed: 'Computation failed.',
    errorGenericTitle: 'Something went wrong',
    reload: 'Reload',

    // Modes
    modes: {
      einfach: {
        label: 'Simple',
        hint: 'Quick workflow: load model, set engraving, compute, get G-code',
      },
      standard: {
        label: 'Standard',
        hint: 'Standard workflow: align, slice, assign lines, done',
      },
      experte: {
        label: 'Expert',
        hint: 'All controls: curve tolerance, radius compensation, tabs, custom program frame',
      },
    },

    // Operations
    ops: {
      engrave: 'Engrave',
      pocket: 'Pocket',
      cut: 'Cutout',
      off: 'Off',
    },
    opHints: {
      engrave: 'Engrave',
      pocket: 'Clear out area',
      cut: 'Cut through (hole/outline)',
      off: 'Do not mill',
    },

    // Steps
    steps: {
      model: 'Model',
      orient: 'Orientation',
      slice: 'Slice Planes',
      origin: 'Origin',
      machining: 'Machining',
      select: 'Selection',
      tool: 'Tool',
      compute: 'Compute',
      program: 'Program',
      export: 'Export',
    },

    // Step 1: Model
    stepModel: {
      title: 'Load Model',
      lead: 'Drag and drop your front panel 3D file onto the stage or browse for it. Everything stays on your computer.',
      btnLoading: 'Reading file…',
      btnChange: 'Choose different file',
      btnChoose: 'Choose file',
      triangles: 'triangles',
      formats: 'STL · OBJ · 3MF · STEP · IGES',
    },

    // Step 2: Orient
    stepOrient: {
      title: 'Orient',
      lead: 'Which side faces up towards the cutter? Rotate the panel as it will lie on the machine.',
      topSide: 'Top face',
      axisHint: (axis: string) => `Model axis ${axis} points up`,
      planeRotation: 'In-plane rotation',
      mirror: 'Mirror (engrave from back, e.g. acrylic)',
      scale: 'Scale',
      scaleInchToMm: 'Inch → mm',
      scaleMm: 'mm',
      scaleBtnTitle: 'File in inches → millimeters',
      widthX: 'Width X',
      depthY: 'Depth Y',
      heightZ: 'Height Z',
      warnSmallModel: 'The model is very small – was it saved in inches? Try "Inch → mm".',
    },

    // Step 3: Slice
    stepSlice: {
      title: 'Slice Planes',
      lead: 'The panel is sliced horizontally; slice contours are milled. Just below the surface you find lettering and holes. If lettering is raised, add a lower plane to capture holes and perimeter.',
      planeLabel: (i: number) => `Plane ${i}`,
      contoursCount: (count: number) => `${count} contours`,
      removePlane: 'Remove plane',
      depthBelowTop: 'Depth below top surface',
      center: 'Center',
      addPlane: 'Add plane',
      tolerance: 'Curve tolerance',
      toleranceHint: 'Maximum deviation from original curve. Smaller = finer curves, longer G-code.',
      warnNoIntersection: 'The plane does not intersect the model at this height. Slide the slider lower.',
    },

    // Step 4: Origin
    stepOrigin: {
      title: 'Work Origin',
      lead: 'Where is the tool at X0 Y0 Z0? The arrows indicate the point on the workpiece to probe on the machine.',
      xyOriginLabel: 'Work origin XY',
      zOriginLabel: 'Z Origin',
      zTop: 'Top surface',
      zTopHint: 'Z0 on workpiece top surface (standard for engraving)',
      zBottom: 'Bottom surface',
      zBottomHint: 'Z0 on spoil board – safer for through-cuts',
      zSurfaceNote: (mat: string) => `The top surface is then at Z ${mat} (material thickness).`,
      gridHelp: 'Top = back (Y+),\nbottom = front (Y−)',
      origins: {
        'back-left': 'Back left',
        'back-center': 'Back center',
        'back-right': 'Back right',
        'center-left': 'Center left',
        'center': 'Center',
        'center-right': 'Center right',
        'front-left': 'Front left',
        'front-center': 'Front center',
        'front-right': 'Front right',
      },
    },

    // Step 5: Machining
    stepMachining: {
      titleSimple: 'Engraving',
      leadSimple: 'Milling depth and tooling. Material, feed rates, and program frames use proven defaults – "Standard" and "Expert" expose them.',
      title: 'Machining',
      lead: 'Three operations assigned to individual lines in the next step: Engrave (default), Pocket, and Cutout. Configure depths for each here.',
      stepDown: 'Step-down per pass',
      safeZ: 'Safe Z clearance',
      engraveTitle: 'Engrave',
      engraveSub: 'Lettering, lines, scales',
      engraveDepth: 'Engraving depth',
      engraveDepthHint: '0.3 mm is usually ideal for lettering.',
      engraveDepthShort: 'Depth',
      engraveModeContour: 'Trace outline',
      engraveModeContourHint: 'Each contour is traced precisely',
      engraveModeCenterline: 'Centerline',
      engraveModeCenterlineHint: 'Lettering as a single stroke down the middle',
      centerlineNotice: 'Centerlines appear cyan immediately – each stroke is milled in a single continuous pass without retracting.',
      centerlineWidth: 'Centerline threshold',
      centerlineWidthHint: 'Threshold between stroke and filled area: shapes up to this width receive a centerline. Wider shapes are engraved along their perimeter – decrease if unwanted centerlines appear.',
      pocketTitle: 'Pocket',
      pocketSub: 'Clear out areas down to a depth',
      pocketDepth: 'Depth',
      pocketStepOver: 'Step-over',
      cutTitle: 'Cutout',
      cutSub: 'Holes, windows, panel outline',
      material: 'Material thickness',
      takeModelHeight: 'Use model height',
      cutOvershoot: 'Bottom overshoot',
      cutDir: 'Milling direction',
      cutDirClimb: 'Climb',
      cutDirConv: 'Conventional',
      tabCount: 'Holding tabs',
      tabWidth: 'Tab width',
      tabHeight: 'Tab height',
      compensate: 'Compensate tool radius (inside holes, outside perimeter)',
      cutNotes: 'Holding tabs only on panel outline. Cutouts are milled last, with outline at the very end.',
      toolChoice: 'Tool',
      toolV: 'V-bit',
      toolVHint: 'Conical – fine lines, width increases with depth',
      toolFlat: 'End mill',
      toolFlatHint: 'Cylindrical – constant width groove',
      machine: 'Machine',
      engraveWidthNote: (depth: string, width: string, presetName: string) =>
        `Engraving width at ${depth} mm depth: ${width} mm. Everything else is handled by ${presetName}.`,
    },

    // Step 6: Select
    stepSelect: {
      title: 'Assign Lines',
      lead: 'Select an operation below and click lines on the stage to assign it. Clicking again resets back to engraving.',
      assignOnClick: 'Assign on click',
      outerOff: 'Outer edge off',
      outerOffTitle: 'Do not mill workpiece perimeter',
      outerCut: 'Outer edge = Cutout',
      outerCutTitle: 'Cut through workpiece perimeter',
      reset: 'Reset',
      minLength: 'Ignore shorter than …',
      planePrefix: (p: number) => `P${p} · `,
      lineNumber: (n: number) => `Line ${n}`,
      outer: ' · outer',
      inner: (d: number) => ` · inner ${d}`,
      open: ' · open',
      opAria: 'Operation',
      warnNoLines: 'No lines selected – nothing to mill.',
    },

    // Step 7: Tool
    stepTool: {
      title: 'Tool',
      lead: 'The tool appears above the origin. Dimensions determine engraving width and radius compensation.',
      toolV: 'V-bit',
      toolVHint: 'Conical – for engraving',
      toolFlat: 'End mill',
      toolFlatHint: 'Cylindrical – for cutouts and pockets',
      tipAngle: 'Tip angle',
      tipDiaV: 'Tip dia',
      tipDiaFlat: 'Cutter dia',
      shaftDia: 'Shaft dia',
      engraveWidthNote: (depth: string, width: string) => `Engraving width at ${depth} mm: ${width} mm`,
      warnVBitConical: ' · Cutouts with a V-bit will be tapered.',
      feedXY: 'Feed rate',
      feedZ: 'Plunge rate',
      rpm: 'Spindle speed',
      unitMmMin: 'mm/min',
      unitRpm: 'RPM',
    },

    // Step 8: Compute
    stepCompute: {
      title: 'Compute Toolpath',
      lead: 'The complete toolpath is generated on demand. Colored moves are cutting, red dashed moves are rapid. Then simulate cutter motion.',
      btnComputing: 'Computing…',
      btnRecompute: 'Recompute',
      btnCompute: 'Compute toolpath',
      warnStale: 'Settings have changed – the displayed path is outdated. Please recompute.',
      warnNoLines: 'No lines assigned. Go back to "Selection" or "Slice Planes".',
      statCut: 'Cut path',
      statRapid: 'Rapid path',
      statPaths: 'Paths',
      statDuration: 'Duration ≈',
      simulation: 'Simulation',
      play: 'Play',
      pause: 'Pause',
      view: 'View',
      view3D: '3D',
      viewTop: 'Top view (2D)',
    },

    // Step 9: Program
    stepProgram: {
      title: 'Program Frame',
      leadExpert: 'What the machine should do before and after milling. Drag a preset or commands into the fields – or click to append.',
      leadStandard: 'What the machine should do before and after milling. Choose a preset – custom commands and lines are available in "Expert" mode.',
      presets: 'Presets',
      presetsHintExpert: '· Click sets start & end, drag inserts',
      presetsHintStandard: '· Click sets start & end',
      start: 'Start',
      end: 'End',
      commands: 'Commands',
      commandsHint: (target: string) => `· Click appends to "${target}"`,
      previewTitle: 'Current resolved start block preview',
      placeholdersHint: 'Placeholders: {rpm} spindle speed · {safe} safe height · {feed} feed rate',
      snippets: {
        pause: { label: 'Pause', desc: 'Pause program (e.g. tool change)' },
        spindleOn: { label: 'Spindle on', desc: 'Start spindle clockwise' },
        spindleOff: { label: 'Spindle off', desc: 'Stop spindle' },
        dwell: { label: 'Dwell 2 s', desc: 'Dwell time' },
        coolantOn: { label: 'Coolant on', desc: 'Coolant / air blast on' },
        coolantOff: { label: 'Coolant off', desc: 'Coolant / air blast off' },
        safeZ: { label: 'Safe height', desc: 'Move to safe clearance height' },
        toOrigin: { label: 'To origin', desc: 'Move to XY origin' },
        probeZ: { label: 'Probe Z', desc: 'Set tool length with touch probe' },
      },
    },

    // Step 10: Export
    stepExport: {
      title: 'Export',
      lead: 'On the right is your completed program, matching the computed path exactly. Download or copy with Ctrl + C.',
      warnNoToolpath: 'No toolpath computed yet – go to "Compute".',
      download: 'Download',
      copy: 'Copy',
      copied: 'Copied',
      stats: (lines: string, size: string, file: string) => `${lines} lines · ${size} kB · ${file}`,
      viewRight: 'Display on right',
      viewGcode: 'G-Code',
      viewStage: '3D Path',
      cheatsheet: {
        rapid: 'Rapid',
        cut: 'Cut',
        machine: 'Machine',
        feed: 'Feed',
      },
    },

    // Code area
    codeArea: {
      insertHere: 'Insert here',
    },

    // Toolpath warnings
    warnings: {
      pocketSkipped: (label: string) => `Pocket ${label} is smaller than the tool and will be skipped.`,
      cutSkipped: (label: string) => `Cutout ${label} is smaller than the tool and will be skipped.`,
      vBitCutout: 'Cutouts with a V-bit will be tapered. For vertical edges, use an end mill (tip angle 0°).',
    },
  },
};

export type Translations = typeof DICT['de'];

export interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectSystemLanguage);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    try {
      localStorage.setItem('gravura:lang', newLang);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.title = DICT[lang].appTitle;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute(
          'content',
          lang === 'de'
            ? 'Gravura – 3D-Modell laden, Konturen schneiden, Nullpunkt setzen und Gravur-, Taschen- und Durchbruch-G-Code im Browser erzeugen.'
            : 'Gravura – Load 3D model, slice contours, set work origin, and generate engraving, pocket, and cutout G-code directly in your browser.'
        );
      }
    }
  }, [lang]);

  const value = {
    lang,
    setLang,
    t: DICT[lang],
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    const l = detectSystemLanguage();
    return { lang: l, setLang: () => {}, t: DICT[l] };
  }
  return ctx;
}
