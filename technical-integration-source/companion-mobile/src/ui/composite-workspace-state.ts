import type { CompositeCalculationV1 } from "../domain/composite-contracts";
import { defaultChartView, type ChartView } from "./ui01-state";
import { eligibleSelection, selectionEligibility, scopeForMode, type CompositeMode, type CompositeScope, type CompositeSelection, type TemporalLayer } from "./composite-workspace-model";
import type { TemporalSlot } from "./composite-temporal-contract";
import type { RelationshipContext } from "../intelligence/relationship-contracts";

export type CompositeReader = { scrollY: number; disclosures: Record<string, boolean>; view: "Meaning" | "Mechanics" | "Sources" };
export type CompositeTemporal = Extract<TemporalSlot,{status:"notCalculated"}>;
export type CompositeWorkspaceState = {
  contextKey: string; relationshipId: string; factsHash: string;
  /** Immutable issued calculation reference for UI eligibility only; never persisted or recomputed here. */
  calculation: CompositeCalculationV1; selectionNotice: string | null;
  roles: [string, string]; mode: CompositeMode; scope: CompositeScope; temporalLayer: TemporalLayer; temporal: CompositeTemporal;
  selection: CompositeSelection; preview: CompositeSelection | null; readingLevel: "compact" | "expanded" | "full";
  relationshipContext:RelationshipContext;
  fullCursor: CompositeSelection | null; fullHistory: CompositeSelection[];
  fullReturn: null | { contextKey: string; roles: [string, string]; mode: CompositeMode; scope: CompositeScope;
    temporalLayer: TemporalLayer; temporal: CompositeTemporal; selection: CompositeSelection; chartView: ChartView;
    readingLevel: "compact" | "expanded"; relationshipContext:RelationshipContext; readers: Record<string, CompositeReader>; opener: string };
  chartView: ChartView; readers: Record<string, CompositeReader>; restoreRevision: number; requestRevision: number;
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const emptyCompositeReader = (): CompositeReader => ({ scrollY: 0, disclosures: {}, view: "Meaning" });
export const temporalUnavailable = (): CompositeTemporal => ({ status: "notCalculated", snapshotId: null, requestedUTC: null, computedAt: null, freshness: "unavailable" });
export const compositeContextKey = (c: CompositeCalculationV1) => `${c.relationshipId}/${c.calculationId}/${c.factsHash}/${c.pins.algorithm}/${c.pins.catalogSHA256}`;
export function initialCompositeWorkspace(c: CompositeCalculationV1, roles: [string, string] = c.displayParticipantIds): CompositeWorkspaceState {
  return { contextKey: compositeContextKey(c), relationshipId: c.relationshipId, factsHash: c.factsHash,
    calculation:c, selectionNotice:null,
    roles: [...roles], mode: "Combined", scope: "A+B", temporalLayer: "baseline", temporal: temporalUnavailable(),
    selection: { kind: "overview" }, preview: null, readingLevel: "compact", relationshipContext:"general",fullCursor: null, fullHistory: [], fullReturn: null,
    chartView: defaultChartView(), readers: {}, restoreRevision: 0, requestRevision: 0 };
}
export const compositeReadingSelection = (s: CompositeWorkspaceState) => eligibleSelection(s.calculation,s.readingLevel === "full" ? s.fullCursor || s.selection : s.selection,s.mode,s.roles,s.scope);
export const compositeSelectionKey = (s: CompositeSelection): string => JSON.stringify(s);
export const compositeReaderKey = (s: CompositeWorkspaceState) => `${s.contextKey}/${s.scope}/${s.relationshipContext}/${s.roles.join(",")}/${s.readingLevel}/${compositeSelectionKey(compositeReadingSelection(s))}`;
export const compositeReader = (s: CompositeWorkspaceState) => s.readers[compositeReaderKey(s)] || emptyCompositeReader();
export const scopeAvailable = (s: CompositeWorkspaceState) => !s.scope.includes("Transit");
export type CompositeAction =
  | { type: "context"; calculation: CompositeCalculationV1; roles?: [string, string] }
  | { type: "mode"; mode: CompositeMode }
  | { type: "scope"; scope: CompositeScope }
  | { type: "temporal-layer"; layer: TemporalLayer }
  | { type: "relationship-context"; context:RelationshipContext }
  | { type: "swap" }
  | { type: "select"; selection: CompositeSelection }
  | { type: "preview"; selection: CompositeSelection | null; contextKey?: string }
  | { type: "level"; level: "compact" | "expanded" }
  | { type: "full"; opener: string }
  | { type: "return" } | { type: "back" }
  | { type: "chart"; patch: Partial<ChartView> }
  | { type: "reader"; key: string; patch: Partial<CompositeReader> };
function transition(s: CompositeWorkspaceState, action: CompositeAction): CompositeWorkspaceState {
  switch (action.type) {
    case "context": return compositeContextKey(action.calculation) === s.contextKey ? {...s,calculation:action.calculation} : { ...initialCompositeWorkspace(action.calculation, action.roles), requestRevision: s.requestRevision + 1 };
    case "mode": return { ...s, mode: action.mode, scope: scopeForMode(action.mode), preview: null,selectionNotice:null, requestRevision: s.requestRevision + 1 };
    case "scope": return { ...s, scope: action.scope,
      mode: action.scope === "A" ? "Person A" : action.scope === "B" ? "Person B" : action.scope === "A+B" ? (s.mode === "Difference" ? "Difference" : "Combined") : s.mode,
      preview: null,selectionNotice:null, requestRevision: s.requestRevision + 1 };
    case "temporal-layer": return { ...s, temporalLayer: action.layer, preview: null, requestRevision: s.requestRevision + 1 };
    case "relationship-context": return ["general","friendship","romantic"].includes(action.context)?{...s,relationshipContext:action.context,preview:null,requestRevision:s.requestRevision+1}:s;
    case "swap": {
      const mode: CompositeMode = s.mode === "Person A" ? "Person B" : s.mode === "Person B" ? "Person A" : s.mode;
      const scope: CompositeScope = s.scope === "A" ? "B" : s.scope === "B" ? "A" : s.scope === "A+Transit" ? "B+Transit" : s.scope === "B+Transit" ? "A+Transit" : s.scope;
      return { ...s, roles: [s.roles[1], s.roles[0]], mode, scope, preview: null, requestRevision: s.requestRevision + 1 };
    }
    case "select": {
      if (JSON.stringify(compositeReadingSelection(s)) === JSON.stringify(action.selection)) return { ...s, preview: null,selectionNotice:null };
      if (s.readingLevel === "full") return { ...s, fullHistory: [...s.fullHistory, compositeReadingSelection(s)], fullCursor: action.selection, preview: null,selectionNotice:null };
      return { ...s, selection: action.selection, readingLevel: "compact", preview: null,selectionNotice:null };
    }
    case "preview": return action.contextKey && action.contextKey !== s.contextKey ? s : { ...s, preview: action.selection };
    case "level": return s.readingLevel === "full" ? s : { ...s, readingLevel: action.level, preview: null };
    case "full": if (s.readingLevel === "full") return s;
      return { ...s, readingLevel: "full", fullCursor: copy(s.selection), fullHistory: [], preview: null,
        fullReturn: { contextKey: s.contextKey, roles: copy(s.roles), mode: s.mode, scope: s.scope, temporalLayer: s.temporalLayer,
          temporal: copy(s.temporal), selection: copy(s.selection), chartView: copy(s.chartView),
          readingLevel: s.readingLevel, relationshipContext:s.relationshipContext,readers: copy(s.readers), opener: action.opener } };
    case "back": {
      if (s.readingLevel !== "full") return s;
      const history=s.fullHistory.filter(selection=>selectionEligibility(s.calculation,selection,s.mode,s.roles,s.scope).eligible);
      return history.length ? { ...s, fullCursor: history.at(-1)!, fullHistory: history.slice(0, -1), preview: null,selectionNotice:null } : compositeReducer(s, { type: "return" });
    }
    case "return": {
      const saved = s.fullReturn;
      if (!saved || saved.contextKey !== s.contextKey) return { ...s, selection: { kind: "overview" }, readingLevel: "compact", fullCursor: null, fullHistory: [], fullReturn: null, preview: null };
      if(!selectionEligibility(s.calculation,{kind:"overview"},saved.mode,saved.roles,saved.scope).eligible)return {...s,selection:{kind:"overview"},readingLevel:"compact",fullCursor:null,fullHistory:[],fullReturn:null,preview:null,selectionNotice:"The saved reading context is no longer eligible."};
      return { ...s, roles: saved.roles, mode: saved.mode, scope: saved.scope, temporalLayer: saved.temporalLayer,
        temporal: saved.temporal, selection: saved.selection, chartView: saved.chartView, readingLevel: saved.readingLevel,relationshipContext:saved.relationshipContext,
        readers: { ...s.readers, ...saved.readers }, fullCursor: null, fullHistory: [], fullReturn: null, preview: null,
        selectionNotice:null,restoreRevision: s.restoreRevision + 1 };
    }
    case "chart": return s.readingLevel === "full" ? s : { ...s, chartView: { ...s.chartView, ...action.patch } };
    case "reader": if (!action.key.startsWith(`${s.contextKey}/`)) return s;
      return { ...s, readers: { ...s.readers, [action.key]: { ...(s.readers[action.key] || emptyCompositeReader()), ...action.patch } } };
  }
}
export function compositeReducer(s:CompositeWorkspaceState,action:CompositeAction):CompositeWorkspaceState {
  const next=transition(s,action);
  const committed=selectionEligibility(next.calculation,next.selection,next.mode,next.roles,next.scope);
  const cursor=next.readingLevel==="full"?selectionEligibility(next.calculation,next.fullCursor||next.selection,next.mode,next.roles,next.scope):committed;
  return {...next,
    selection:committed.eligible?next.selection:{kind:"overview"},
    fullCursor:next.readingLevel==="full"?(cursor.eligible?next.fullCursor||next.selection:{kind:"overview"}):null,
    fullHistory:next.fullHistory.filter(selection=>selectionEligibility(next.calculation,selection,next.mode,next.roles,next.scope).eligible),
    preview:next.preview&&selectionEligibility(next.calculation,next.preview,next.mode,next.roles,next.scope).eligible?next.preview:null,
    selectionNotice:cursor.eligible?next.selectionNotice:cursor.reason,
  };
}
