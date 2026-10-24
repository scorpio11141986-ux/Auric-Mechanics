export type CenterId =
  | "Head"
  | "Ajna"
  | "Throat"
  | "G"
  | "Ego"
  | "Spleen"
  | "SolarPlexus"
  | "Sacral"
  | "Root";
export const CENTER_NAMES: Record<CenterId, string> = {
  Head: "Head / Crown",
  Ajna: "Third Eye / Ajna",
  Throat: "Throat",
  G: "Identity / G",
  Ego: "Will / Ego",
  Spleen: "Spleen",
  SolarPlexus: "Solar Plexus",
  Sacral: "Sacral",
  Root: "Root",
};
export type BirthRecordV1 = {
  schema: "BirthRecordV1";
  id: string;
  name: string;
  date: string;
  localTime: string;
  timezone: string;
  latitude: number;
  longitude: number;
  place: string;
  confidence: "exact" | "approximate" | "range" | "unknown";
  timeWindow?: { earliestLocal: string; latestLocal: string };
  utcDisambiguation?: "earlier" | "later";
  source: "user-entered";
  updatedAt: string;
  resolution?: {
    status: "unresolved" | "resolved" | "manual";
    originalPlace: string;
    resolvedPlace: string;
    coordinateSource: "open-meteo-geonames" | "manual" | "synthetic";
    sourceVersion: string | null;
    resolvedAt: string;
    timezoneOverride: boolean;
  };
  conversion?: {
    utc: string;
    offsetMinutes: number;
    timezone: string;
    runtime: "Intl.DateTimeFormat";
    databaseVersion: string | null;
  };
};
export type Activation = {
  id: string;
  side: "personality" | "design";
  planet: string;
  longitude: number;
  gate: number;
  line: number;
  center: CenterId;
  boundaryRisk: boolean;
};
export type HumanDesignFactsV1 = {
  schema: "HumanDesignFactsV1";
  birthId: string;
  birthUpdatedAt: string;
  personalityUtc: string;
  designUtc: string;
  type: string;
  strategy: string;
  authority: string;
  profile: string;
  definition: string;
  centers: { id: CenterId; defined: boolean }[];
  gates: number[];
  channels: {
    id: string;
    gates: number[];
    centers: CenterId[];
    circuit: string;
  }[];
  activations: Activation[];
  hangingGates: number[];
  definitionIslands: CenterId[][];
  incarnationCross: { gates: number[]; namingStatus: "geometry-only" };
  uncertainty: string[];
  timeWindowAnalysis?: BirthTimeAnalysisV1;
  engine: {
    name: "Infinity Rae Core";
    version: "1.0.0";
    astronomy: "2.1.19";
    adapter: "1.0.0";
    node: "true-osculating";
    zodiac: "tropical";
    designArc: 88;
  };
};
export type BirthTimeAnalysisV1 = {
  schema: "BirthTimeAnalysisV1";
  algorithm: "minute-sweep-v1";
  window: { earliestLocal: string; latestLocal: string };
  timezone: string;
  sampleCount: number;
  skippedLocalMinutes: number;
  repeatedLocalMinutes: number;
  representativeUtc: string;
  summaries: { label: string; values: string[] }[];
  activations: { id: string; side: Activation["side"]; planet: string; values: string[] }[];
  gates: { stable: number[]; variable: number[] };
  channels: { stable: string[]; variable: string[] };
  centers: { id: CenterId; values: string[] }[];
};
export type UserInterpretationProfileV1 = {
  schema: "UserInterpretationProfileV1";
  familiarity: "new" | "basics" | "advanced";
  depth: "concise" | "standard" | "deep";
  terminology: "modern" | "traditional" | "both";
  style: "practical" | "technical" | "integrated";
  interests: string[];
};
export const DEFAULT_PROFILE: UserInterpretationProfileV1 = {
  schema: "UserInterpretationProfileV1",
  familiarity: "new",
  depth: "concise",
  terminology: "modern",
  style: "practical",
  interests: ["self-understanding"],
};
export type Observation = {
  id: string;
  text: string;
  createdAt: string;
  kind: "USER_SUPPLIED";
};
export type Feedback = "resonates" | "partially" | "does-not-resonate";
export type Evidence = {
  id: string;
  recordId: string;
  recordHash?: string;
  activationIds?: string[];
  title: string;
  kind: "CANONICAL";
  supportingFactIds: string[];
  inferenceStatus?: "internal-evaluation-only";
  sourceAuthentication?: "recovered-not-original-authenticated";
  mechanic: string;
  coherent: string;
  distorted: string;
  boundary: string;
  appInterpretation: {
    blockId: string;
    text: string;
    kind: "APP_INTERPRETATION";
  }[];
  appBoundary: string;
};
export type AIContextV1 = {
  schema: "AIContextV1";
  question: string;
  subject: { id: string; mode: "HD" };
  profile: UserInterpretationProfileV1;
  facts: { id: string; kind: "CALCULATED" | "DERIVED"; value: string }[];
  evidence: Evidence[];
  userContext: Observation[];
  feedback: { answer: string; feedback: Feedback }[];
  uncertainty: string[];
  selection: "exact" | "lexical" | "overview" | "not-in-chart";
  chartRevision?: string;
  birthConfidence?: BirthRecordV1["confidence"];
  exclusions?: { recordId: string; reason: string }[];
  dataset: {
    runtimeVersion: string;
    canonicalSha256: string;
    app1Sha256: string;
    app2Sha256: string;
    releaseStatus: string;
    sourceAuthentication: string;
  };
  engine: HumanDesignFactsV1["engine"];
  activationBindings?: import("../intelligence/ask-selection").ActivationBinding[];
  ask?: import("../intelligence/ask-contract").AskContextIdentityV1;
};
export type InterpretationResponseV1 = {
  schema: "InterpretationResponseV1";
  kind: "AI_SYNTHESIS";
  answer: string;
  claims: {
    text: string;
    evidenceIds: string[];
    kind?: "mechanical" | "source-supported" | "exploratory";
    subjectId?: string;
    factIds?: string[];
    validation?: "structurally-verified" | "source-excerpt-verified" | "exploratory-not-proven";
  }[];
  uncertainty: string[];
  followUps: string[];
  confidence: "interpretive-not-established";
  model: { provider: "OpenAI"; id: string };
  contextVersion: "AIContextV1";
  validationVersion?: "ClaimValidationV1";
};
export type SavedQuestion = {
  id: string;
  createdAt: string;
  context: AIContextV1;
  response?: InterpretationResponseV1;
  feedback?: Feedback;
};
export type Person = {
  birth: BirthRecordV1;
  facts: HumanDesignFactsV1;
  history: SavedQuestion[];
  observations: Observation[];
  activeChartVersionId?: string;
  versions?: {
    id: string;
    birth: BirthRecordV1;
    facts: HumanDesignFactsV1;
  }[];
};
export type AppStateV1 = {
  schema: "AppStateV1";
  people: Person[];
  activeId: string | null;
  profile: UserInterpretationProfileV1;
};
export type WesternAstrologyConfigV1 = {
  schema: "WesternAstrologyConfigV1";
  zodiac: "tropical";
  houses: "whole-sign" | "placidus";
  node: "true" | "mean";
  aspectPolicyVersion: string;
  status: "DEFERRED";
};
