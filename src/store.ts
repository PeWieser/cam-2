import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { defaultSettings, type Settings } from './types';

type History = { past: Settings[]; present: Settings; future: Settings[] };
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
  const [h, dispatch] = useReducer(reducer, { past: [], present: defaultSettings, future: [] });
  const set = useCallback((patch: Partial<Settings>) => dispatch({ type: 'set', patch }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const reset = useCallback(() => dispatch({ type: 'replace', settings: defaultSettings }), []);

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
  }), [h, set, undo, redo, reset]);
}
