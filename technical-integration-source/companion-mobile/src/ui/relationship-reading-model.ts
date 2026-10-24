import type { CompositeCalculationV1 } from "../domain/composite-contracts";
import { relationshipReport, relationshipRequest, validateStoredReadingEntry, type RelationshipReadingEntryV1, type RelationshipReportV1 } from "../intelligence/relationship";
import { compositeReadingSelection, compositeReducer, initialCompositeWorkspace, type CompositeWorkspaceState } from "./composite-workspace-state";

export type RelationshipDraft = {question:string; observationText:string; consented:boolean};
export const EMPTY_RELATIONSHIP_DRAFT:RelationshipDraft = {question:"",observationText:"",consented:false};
export const relationshipDraftKey=(s:CompositeWorkspaceState)=>JSON.stringify([s.contextKey,s.roles,s.mode,s.scope,s.relationshipContext,compositeReadingSelection(s)]);

export function relationshipReadingFor(c:CompositeCalculationV1,s:CompositeWorkspaceState,draft:RelationshipDraft):RelationshipReportV1 {
 return relationshipReport(c,relationshipRequest(c,{roles:s.roles,mode:s.mode,scope:s.scope,context:s.relationshipContext,selection:compositeReadingSelection(s),question:draft.question,
  observation:draft.consented&&draft.observationText.trim()?{text:draft.observationText,consented:true}:null}));
}
export function readingRequestForSave(report:RelationshipReportV1,requestedAt:string) {
 if(report.status!=="ready")throw Error(report.reason||"This reading is unsupported.");
 return {...report.request,requestedAt};
}
export function workspaceFromReading(c:CompositeCalculationV1,entry:RelationshipReadingEntryV1):CompositeWorkspaceState {
 validateStoredReadingEntry(entry);
 const report=relationshipReport(c,entry.request);
 if(report.status!=="ready")throw Error(report.reason||"Saved reading is unsupported under these rules.");
 let state=initialCompositeWorkspace(c,entry.request.roles);
 state=compositeReducer(state,{type:"mode",mode:entry.request.mode});
 state=compositeReducer(state,{type:"relationship-context",context:entry.request.context});
 return compositeReducer(state,{type:"select",selection:entry.request.selection});
}
