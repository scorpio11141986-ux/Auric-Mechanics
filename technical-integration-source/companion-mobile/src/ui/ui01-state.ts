import type { Person } from "../domain/contracts";
import { chartSelection, selectionKey, type Selection } from "./workspace-model";
import type { InspectorView } from "./MechanicsInspector";

export type ReadingLevel = "compact" | "expanded" | "full";
export type ReaderState = { scrollY: number; disclosures: Record<string, boolean>; view: InspectorView };
export type ChartView = {
  zoom: number; center: { x: number; y: number }; layer: "Centers" | "Channels" | "Gates";
  fitWhole: boolean; canvasScrollY: number; pageScrollY: number; focusOrigin: string | null;
};
export type Preview = { target: Selection; origin: "graph" | "reference"; input: "pointer-or-focus"; scopeKey: string };
export type UI01State = {
  scopeKey: string; committedSelection: Selection; readingLevel: ReadingLevel;
  preview: Preview | null; chartView: ChartView; readers: Record<string, ReaderState>;
  fullCursor: Selection | null; fullHistory: Selection[];
  fullReturn: null | { selection: Selection; chartView: ChartView; level: "compact" | "expanded"; readers: Record<string, ReaderState>; scopeKey: string; opener: string };
  restoreRevision: number;
};
export const emptyReader = (): ReaderState => ({ scrollY: 0, disclosures: {}, view: "Interpretation" });
export const defaultChartView = (): ChartView => ({ zoom: 1, center: { x: .5, y: .5 }, layer: "Centers", fitWhole: true, canvasScrollY: 0, pageScrollY: 0, focusOrigin: null });
export function workspaceScope(person: Person | null) {
  // Workspace kind leaves a named extension point without implementing Composite/Transit.
  return person ? `natal:${person.birth.id}:${person.birth.updatedAt}:${person.facts.birthUpdatedAt}:${person.facts.engine.version}:${person.facts.engine.adapter}` : "natal:empty";
}
export function initialUI01(scopeKey: string): UI01State {
  return { scopeKey, committedSelection: chartSelection, readingLevel: "compact", preview: null, chartView: defaultChartView(), readers: {}, fullCursor: null, fullHistory: [], fullReturn: null, restoreRevision: 0 };
}
export const readingSelection = (state: UI01State) => state.readingLevel === "full" ? state.fullCursor || state.committedSelection : state.committedSelection;
export const readerKey = (state: UI01State) => `${state.scopeKey}/${state.readingLevel}/${selectionKey(readingSelection(state))}`;
export const currentReader = (state: UI01State): ReaderState => state.readers[readerKey(state)] || emptyReader();
export type UI01Action =
  | { type: "scope"; scopeKey: string }
  | { type: "commit"; selection: Selection }
  | { type: "preview"; target: Selection | null; origin?: Preview["origin"]; scopeKey?: string }
  | { type: "level"; level: "compact" | "expanded" }
  | { type: "full"; opener: string }
  | { type: "return" } | { type: "back" }
  | { type: "chart"; patch: Partial<ChartView> }
  | { type: "reader"; key: string; patch: Partial<ReaderState> }
  | { type: "clear-preview" };
export function ui01Reducer(state: UI01State, action: UI01Action): UI01State {
  switch (action.type) {
    case "scope": return action.scopeKey === state.scopeKey ? state : initialUI01(action.scopeKey);
    case "clear-preview": return state.preview ? { ...state, preview: null } : state;
    case "preview":
      if (action.scopeKey && action.scopeKey !== state.scopeKey) return state;
      if (!action.target && action.origin && state.preview?.origin !== action.origin) return state;
      return { ...state, preview: action.target ? { target: action.target, origin: action.origin || "graph", input: "pointer-or-focus", scopeKey: state.scopeKey } : null };
    case "commit": {
      const current = readingSelection(state);
      if (selectionKey(current) === selectionKey(action.selection)) return { ...state, preview: null };
      if (state.readingLevel === "full") return { ...state, preview: null, fullHistory: [...state.fullHistory, current], fullCursor: action.selection };
      return { ...state, preview: null, committedSelection: action.selection, readingLevel: "compact" };
    }
    case "level": return state.readingLevel === "full" ? state : { ...state, readingLevel: action.level, preview: null };
    case "full":
      if (state.readingLevel === "full") return state;
      return { ...state, readingLevel: "full", fullCursor: state.committedSelection, fullHistory: [], preview: null,
        fullReturn: { selection: { ...state.committedSelection }, chartView: { ...state.chartView, center: { ...state.chartView.center } }, level: state.readingLevel, readers: Object.fromEntries(Object.entries(state.readers).map(([key, reader]) => [key, { ...reader, disclosures: { ...reader.disclosures } }])), scopeKey: state.scopeKey, opener: action.opener } };
    case "back":
      if (state.readingLevel !== "full") return state;
      if (state.fullHistory.length) return { ...state, fullCursor: state.fullHistory.at(-1)!, fullHistory: state.fullHistory.slice(0, -1), preview: null };
      return ui01Reducer(state, { type: "return" });
    case "return": {
      const saved = state.fullReturn;
      if (!saved || saved.scopeKey !== state.scopeKey) return initialUI01(state.scopeKey);
      return { ...state, committedSelection: saved.selection, chartView: saved.chartView, readingLevel: saved.level,
        readers: { ...state.readers, ...saved.readers }, preview: null, fullCursor: null, fullHistory: [], fullReturn: null, restoreRevision: state.restoreRevision + 1 };
    }
    case "chart": return state.readingLevel === "full" ? state : { ...state, chartView: { ...state.chartView, ...action.patch } };
    case "reader": return !action.key.startsWith(`${state.scopeKey}/`) ? state : { ...state, readers: { ...state.readers, [action.key]: { ...(state.readers[action.key] || emptyReader()), ...action.patch } } };
  }
}
