import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { defaultSettings, type Settings } from './types';

type History = { past: Settings[]; present: Settings; future: Settings[] };

const STORE_KEY = 'gravura:settings';

/** Einstellungen aus dem Browser holen. Unbekannte oder fehlende Felder fallen auf die Werkseinstellung zurück. */
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultSettings;
    const saved = JSON.parse(raw) as Partial<Settings>;
    return { ...defaultSettings, ...saved, tool: { ...defaultSettings.tool, ...saved.tool } };
  } catch { return defaultSettings; } // nichts gespeichert oder Speicher gesperrt
}

/** Kleinen Zustand (z. B. den Arbeitsmodus) im Browser merken. */
export function useStored<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return allowed.includes(saved as T) ? (saved as T) : fallback;
    } catch { return fallback; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, value); } catch { /* gesperrt: gilt dann nur für diese Sitzung */ }
  }, [key, value]);
  return [value, setValue] as const;
}

type Action =
  | { type: 'set'; patch: Partial<Settings> }
  | { type: 'replace'; settings: Settings }
  | { type: 'undo' }
  | { type: 'redo' };

function reducer(h: History, a: Action): History {
  switch (a.type) {
    case 'set': {
      const next = { ...h.present, ...a.patch };
      if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
      return { past: [...h.past.slice(-80), h.present], present: next, future: [] };
    }
    case 'replace':
      return { past: [...h.past.slice(-80), h.present], present: a.settings, future: [] };
    case 'undo': {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
    }
    case 'redo': {
      if (!h.future.length) return h;
      const [next, ...rest] = h.future;
      return { past: [...h.past, h.present], present: next, future: rest };
    }
  }
}

export function useSettings() {
  const [h, dispatch] = useReducer(reducer, undefined, (): History => ({ past: [], present: loadSettings(), future: [] }));
  const set = useCallback((patch: Partial<Settings>) => dispatch({ type: 'set', patch }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const reset = useCallback(() => {
    try { localStorage.removeItem(STORE_KEY); } catch { /* gesperrt */ }
    dispatch({ type: 'replace', settings: defaultSettings });
  }, []);

  // Einstellungen im Browser merken – gesammelt, damit nicht jede Taste schreibt
  const { present } = h;
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(present)); } catch { /* gesperrt */ }
    }, 250);
    return () => clearTimeout(t);
  }, [present]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return useMemo(() => ({
    settings: h.present, set, undo, redo, reset,
    canUndo: h.past.length > 0, canRedo: h.future.length > 0,
    canReset: JSON.stringify(h.present) !== JSON.stringify(defaultSettings),
  }), [h, set, undo, redo, reset]);
}
