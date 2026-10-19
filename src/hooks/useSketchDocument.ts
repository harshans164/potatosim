import { useCallback, useMemo, useReducer, useState } from "react";
import { createInitialDocument } from "../geometry/sketchMath";
import type { CadSelection, SketchDocument } from "../types/sketch";

const HISTORY_LIMIT = 100;
type Updater = SketchDocument | ((current: SketchDocument) => SketchDocument);
interface HistoryState { document: SketchDocument; past: SketchDocument[]; future: SketchDocument[] }
type HistoryAction = { type: "commit"; updater: Updater } | { type: "replace"; document: SketchDocument; clearHistory: boolean } | { type: "undo" } | { type: "redo" };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "commit") {
    const next = typeof action.updater === "function" ? action.updater(state.document) : action.updater;
    if (next === state.document) return state;
    return { document: next, past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.document], future: [] };
  }
  if (action.type === "replace") return { document: action.document, past: action.clearHistory ? [] : state.past, future: action.clearHistory ? [] : state.future };
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return { document: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.document, ...state.future].slice(0, HISTORY_LIMIT) };
  }
  if (!state.future.length) return state;
  return { document: state.future[0], past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.document], future: state.future.slice(1) };
}

export function useSketchDocument() {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => ({ document: createInitialDocument(), past: [], future: [] }));
  const [selection, setSelection] = useState<CadSelection>({ kind: "plane", ids: ["xy-plane"] });
  const commit = useCallback((updater: Updater) => dispatch({ type: "commit", updater }), []);
  const replace = useCallback((document: SketchDocument, clearHistory = true) => { dispatch({ type: "replace", document, clearHistory }); setSelection({ kind: "plane", ids: [document.activePlaneId] }); }, []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const selectedIds = useMemo(() => selection.ids, [selection]);
  return { document: history.document, commit, replace, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0, selection, setSelection, selectedIds };
}
