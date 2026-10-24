import type { CenterId } from '../domain/contracts';
import type { ParticipantSnapshotV1, CompositeCalculationV1, StructureGraphV1, ChannelRelationV1 } from '../domain/composite-contracts';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type MeaningVariant = 'gold' | 'r4' | 'phase-d-v2';
export type MeaningGranularity = 'exact-line' | 'gate' | 'channel' | 'line-framework' | 'mixed';
export type ReadingUse = 'local-review' | 'isolated-design-preview' | 'private-app' | 'public-app' | 'remote-model' | 'export';
export interface SelectedSpan { startCodePoint: number; endCodePoint: number; selectedTextSha256: string; granularity: Exclude<MeaningGranularity, 'mixed'>; }
export interface SourceFieldRef {
  artifactSha256: string; jsonPointer: string; valueSha256: string;
  hashEncoding: 'utf8-field-text' | 'canonical-json-v1';
  granularity: MeaningGranularity; selectedSpans?: SelectedSpan[];
  sourceIds: string[]; lineageFamily: string; transformation: 'verbatim';
}
export interface SourceField {
  fieldKey: string; value: JsonValue; ref: SourceFieldRef; shared: boolean;
  purpose: 'meaning' | 'identity' | 'source-context' | 'metadata';
}
export interface EditorialIssue {
  id: string; category: 'revision-required' | 'fixing-label' | 'semantic-adjudication';
  status: 'unresolved'; sourceArtifactSha256: string; sourcePointer: string; note: string;
}
export interface MeaningUnit {
  schema: 'AuricMeaningUnitV1'; recordId: string; variantId: MeaningVariant;
  kind: 'gate' | 'exact-line' | 'channel'; canonicalObjectRef: string; centers: CenterId[];
  gate?: number; line?: number; gates?: number[];
  fields: SourceField[]; issueFlags: EditorialIssue[];
  rawRecord: JsonValue; rawRecordHash: string; origin: { artifactSha256: string; jsonPointer: string };
  sourceStatus: 'frozen-not-cleared' | 'runtime-not-cleared' | 'proposed-not-approved';
  consumerEligible: false; publicationStatus: 'blocked';
  preservedOriginalRef?: { artifactSha256: string; jsonPointer: string; originalRecordHash: string };
}
export interface MeaningCatalogue {
  schema: 'AuricMeaningCatalogueV1'; units: MeaningUnit[];
  artifactPins: { id: string; sha256: string }[];
  catalogueHash: string; privacy: 'source-locators-excluded-originals-preserved';
}
export interface IndexedActivation {
  id: string; activationId: string; nativeActivationId: string; personId: string;
  chartVersionId: string; chartRevisionId: string; snapshotHash: string;
  side: 'personality' | 'design'; planet: string; planetKey: string;
  gate: number; line: number | null; calculatedLine: number; center: CenterId;
  exactLineEligible: boolean; lineStatus: 'exact-point' | 'uncertain-withheld';
  gateOccurrenceIds: string[]; exactLineOccurrenceIds: string[];
}
export interface IndexedCenter {
  personId: string | null; centerId: CenterId;
  state: 'defined' | 'undefined-with-activation' | 'completely-open';
  activationIds: string[]; completedChannelIds: string[];
}
export interface IndexedChannel {
  channelId: string; gates: number[]; centers: CenterId[]; personId: string | null;
  complete: boolean; endpointActivationIds: string[][]; relation?: ChannelRelationV1;
}
export interface UnfinishedPath {
  id: string; personId: string; channelId: string; presentGate: number; absentGate: number;
  centers: CenterId[]; activationIds: string[]; otherCompletedChannelIds: string[];
}
export interface IndexedFact {
  id: string; predicate: string; personIds: string[]; activationIds: string[];
  value: JsonValue; source: 'issued-natal-snapshot' | 'issued-composite-calculation';
}
export interface ReadingChartIndex {
  schema: 'AuricReadingChartIndexV1'; context: 'natal' | 'composite'; indexHash: string;
  participants: ParticipantSnapshotV1[]; composite: CompositeCalculationV1 | null;
  activations: IndexedActivation[];
  repeatedGates: { gate: number; activationIds: string[] }[];
  repeatedLines: { gate: number; line: number; activationIds: string[] }[];
  centers: IndexedCenter[]; channels: IndexedChannel[];
  graphs: StructureGraphV1[]; components: { graphId: string; id: string; centerIds: CenterId[] }[];
  unfinishedPaths: UnfinishedPath[]; facts: IndexedFact[];
}
// A capability is accepted only while the exact object is in eligibility.ts's private issuer set.
export interface DesignPreviewCapability { readonly kind: 'AuricInternalDesignPreview'; readonly cohort: readonly string[]; readonly variantIds: readonly MeaningVariant[]; readonly catalogueHash: string; }
export interface EligibilityDecision {
  allowed: boolean; result: 'local-review-only' | 'design-only' | 'withheld'; use: ReadingUse;
  reasonCodes: string[]; consumerEligible: false; publicationStatus: 'blocked';
}
