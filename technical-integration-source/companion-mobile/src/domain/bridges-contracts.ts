import type { CenterId } from './contracts';
import type { CompositeContributionV1, StructureGraphV1 } from './composite-contracts';

export type BridgeScope='pair'|{personId:string};
export type BridgeTarget=
  |{kind:'completeChannel';channelId:string}
  |{kind:'connectCenters';centers:[CenterId,CenterId]}
  |{kind:'joinSelectedIslands';personId:string;islandIds:string[]}
  |{kind:'joinAllNatalIslands';personId:string};
export type BridgeContext={relationshipId:string;calculationId:string;factsHash:string;catalogHash:string;inputRefs:{personId:string;chartVersionId:string|null;snapshotHash:string|null}[]};
export type BridgeBounds={maxStates:number;maxElapsedMs:number;maxAddedGates?:number;maxAlternatives?:number;maxPaths?:number;maxPathSteps?:number};
export type BridgeRequest={scope:BridgeScope;target:BridgeTarget;candidateGates:number[];bounds:BridgeBounds;expectedContext?:BridgeContext};
export type BridgeContribution=({kind:'natal'}&CompositeContributionV1)|{kind:'synthetic-reference';id:string;personId:string;gate:number;activationId:string;planet:string|null;side:'personality'|'design'|null;line:number|null;chartVersionId:null;snapshotHash:null};
export type BridgeFixture={people:[{personId:string;gates:number[]},{personId:string;gates:number[]}];records?:{id:string;personId:string;gate:number;line?:number;planet?:string;side?:'personality'|'design'}[]};
export type BridgeGraph={id:string;gates:number[];definedCenters:CenterId[];components:CenterId[][];edges:{channelId:string;gates:[number,number];centers:[CenterId,CenterId]}[]};
export type BridgeBaseline={basis:'validated-pinned-natal'|'synthetic-gate-fixture';eligibility:'exact-point'|'provisional-point'|'synthetic-reference';context:BridgeContext;scope:BridgeScope;graph:BridgeGraph;contributions:BridgeContribution[];natalGraphs:StructureGraphV1[]};
export type BridgeWitness={id:string;from:CenterId;to:CenterId;centers:CenterId[];edges:{channelId:string;gates:[number,number];from:CenterId;to:CenterId;preexisting:boolean;endpoints:{gate:number;contributionIds:string[];hypotheticalIds:string[]}[]}[];claim:'sufficient-complete-path'};
export type BridgeAlternative={id:string;gates:number[];hypothetical:{kind:'hypothetical-gate';id:string;gate:number}[];graph:BridgeGraph;witnesses:BridgeWitness[];witnessCoverage:{complete:boolean;reason:string|null};minimality:{removedGate:number;goalSatisfied:false;graphId:string}[];delta:{addedChannelIds:string[];unchangedChannelIds:string[];addedCenterIds:CenterId[];componentCountBefore:number;componentCountAfter:number;islandMappings:{personId:string;islandId:string;centers:CenterId[];afterComponent:number|null}[]}};
export type BridgeAnalysisV1={schema:'BridgeAnalysisV1';algorithm:'CM02-1.0.0';resultId:string;status:'exhaustive'|'bounded_partial'|'stopped'|'unsupported';targetState:'already_satisfied'|'not_applicable'|'solutions_found'|'no_solution_within_scope'|'unresolved';reason:string|null;baseline:BridgeBaseline|null;request:BridgeRequest|null;alternatives:BridgeAlternative[];coverage:{candidateGates:number[];excludedAbsentGates:number[];ignoredPresentGates:number[];maxAddedGates:number;visitedSubsets:number;evaluatedGraphs:number;skippedSupersets:number;pathSteps:number;gateSetsComplete:boolean;pathsComplete:boolean;elapsedMs:number;bounds:BridgeBounds|null};sharedAcrossExhaustiveAlternatives:number[]|null;nonclaims:string[]};
