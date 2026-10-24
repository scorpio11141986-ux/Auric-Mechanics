/** CM-01b UI projection of PLAN-02 / TRANSIT-CORE. This port calculates no sky positions. */
export type ActorRef =
  | { actorKind:"natalPerson"; actorKey:string; personId:string; chartVersionId:string; snapshotHash:string }
  | { actorKind:"transitSnapshot"; actorKey:string; snapshotId:string };
export type ActivationSource =
  | { contributionId:string; actor:Extract<ActorRef,{actorKind:"natalPerson"}>; natalSide:"personality"|"design"; activationId:string; gate:number; line:number; planetKey:string }
  | { contributionId:string; actor:Extract<ActorRef,{actorKind:"transitSnapshot"}>; natalSide:null; bodyKey:string; gate:number; line:number };
export type TemporalSlot =
  | { status:"notCalculated"; snapshotId:null; requestedUTC:null; computedAt:null; freshness:"unavailable" }
  | { status:"ready"|"stale"|"historical"; snapshotId:string; requestedUTC:string; computedAt:string;
      bodyInventoryHash:string; astronomyVersion:string; nodeHash:string; zodiacHash:string; wheelHash:string;
      adapterHash:string; schemaVersion:string; freshness:"as-of"|"stale"; eventWindow:{status:"notCalculated"} };
export type WorkspaceContext = {
  contextKind:"natalPair"|"personalTransit"|"pairTransit"; temporalLayer:"baseline"|"overlay"|"temporary-only";
  relationshipId:string; baselineCalculationId:string; baselineFactsHash:string;
  personVersionHashes:readonly {personId:string;chartVersionId:string;snapshotHash:string}[];
  worldId:null|string; temporal:TemporalSlot; schemaVersion:string; algorithmVersion:string; catalogHash:string;
};
export type AnalyticalScope = "A"|"B"|"A+B"|"A+Transit"|"B+Transit"|"A+B+Transit";
export type ScopeResult<T> =
  | {status:"ready";context:WorkspaceContext;scope:AnalyticalScope;facts:T}
  | {status:"notCalculated"|"stale"|"cancelled"|"failed";scope:AnalyticalScope;reason:string};
export type TemporalOverlayAdapter<T> = {resolve(context:WorkspaceContext,scope:AnalyticalScope,signal:AbortSignal):Promise<ScopeResult<T>>};
export const unavailableTemporalAdapter:TemporalOverlayAdapter<never> = {
  async resolve(_context,scope,signal) {
    return {status:signal.aborted?"cancelled":"notCalculated",scope,reason:signal.aborted?"Request cancelled.":"TRANSIT-CORE and CM-05 are not implemented. Permanent natal mechanics remain the baseline."};
  },
};
