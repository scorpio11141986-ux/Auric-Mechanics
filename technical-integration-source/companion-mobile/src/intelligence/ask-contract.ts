import { datasetPin } from "../content/records";
import { CONTENT_RIGHTS, QUARANTINED_RECORDS } from "../content/inference-policy";
import { calculateChart } from "../domain/calculator";
import { createParticipantSnapshot } from "../domain/composite";
import type { ParticipantSnapshotV1 } from "../domain/composite-contracts";
import { canonicalJson, contentHash } from "../domain/composite-hash";
import type { AIContextV1, BirthRecordV1, Feedback, Observation, Person, UserInterpretationProfileV1 } from "../domain/contracts";
import type { Selection } from "../ui/workspace-model";
import { contextFor, validateProfile } from "./context";
import { legacyProfile, validateReaderPreferences, type ReaderPreferencesV1 } from "./reader-preferences";

type ChartIdentity = Pick<ParticipantSnapshotV1, "personId" | "chartVersionId" | "birthInputHash" | "factsHash" | "snapshotHash" | "pins" | "eligibility">;
type AskPreferences = Pick<ReaderPreferencesV1, "schema" | "familiarity" | "depth" | "style" | "terminology" | "teaching" | "concepts" | "preset" | "interests">;
type AskFeedback = { answer: string; question: string; subjectId: string; chartRevision: string; feedback: Feedback };
export type ChartAskRequestV1 = {
  schema: "ChartAskRequestV1";
  requestId: string;
  scope: ChartIdentity & { kind: "individual" };
  birth: BirthRecordV1;
  selection: Selection;
  question: string;
  profile: UserInterpretationProfileV1;
  preferences: AskPreferences | null;
  observations: Observation[];
  feedback: AskFeedback[];
  sourcePolicy: ReturnType<typeof askSourcePolicy>;
  expectedContextHash: string;
};
export type AskContextIdentityV1 = {
  schema: "ChartAskIdentityV1";
  requestId: string;
  requestHash: string;
  scope: ChartAskRequestV1["scope"];
  selection: Selection;
  preferences: AskPreferences | null;
  sourcePolicy: ChartAskRequestV1["sourcePolicy"];
};
const invalid = (message: string): never => { throw Error(`Invalid request: ${message}`); };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export function askSourcePolicy() {
  return {
    contract: "P0A-1.0.0", runtimeVersion: datasetPin.runtimeVersion,
    canonicalSha256: datasetPin.canonical.sha256,
    app1Sha256: datasetPin.files["app1_runtime.min.json"].sha256,
    app2Sha256: datasetPin.files["app2_documents.json"].sha256,
    policyHash: contentHash({ version: "P0A-1.0.0", rights: CONTENT_RIGHTS, quarantine: QUARANTINED_RECORDS }),
  };
}
function chartIdentity(s: ParticipantSnapshotV1): ChartAskRequestV1["scope"] {
  return { kind: "individual", personId: s.personId, chartVersionId: s.chartVersionId,
    birthInputHash: s.birthInputHash, factsHash: s.factsHash, snapshotHash: s.snapshotHash,
    pins: s.pins, eligibility: s.eligibility };
}
function preferencesFor(p: ReaderPreferencesV1 | null): AskPreferences | null {
  if (!p) return null;
  validateReaderPreferences(p);
  return clone({ schema: p.schema, familiarity: p.familiarity, depth: p.depth, style: p.style,
    terminology: p.terminology, teaching: p.teaching, interests: p.interests,
    ...(p.preset ? { preset: p.preset } : {}), ...(p.concepts ? { concepts: p.concepts } : {}) });
}
function validateRequest(r: ChartAskRequestV1) {
  const keys = ["schema", "requestId", "scope", "birth", "selection", "question", "profile", "preferences", "observations", "feedback", "sourcePolicy", "expectedContextHash"];
  if (!r || r.schema !== "ChartAskRequestV1" || Object.keys(r).length !== keys.length || Object.keys(r).some(k => !keys.includes(k))) invalid("unsupported Ask contract or fields");
  if (typeof r.requestId !== "string" || !/^[a-zA-Z0-9_-]{8,120}$/.test(r.requestId)) invalid("invalid Ask request identity");
  if (r.scope?.kind !== "individual") invalid("Composite Ask is not supported by this individual contract; retain the existing issued Composite report pathway");
  if (typeof r.question !== "string" || !r.question.trim() || r.question.length > 1200) invalid("question must contain 1 to 1,200 characters");
  validateProfile(r.profile);
  const profileKeys = ["schema", "familiarity", "depth", "terminology", "style", "interests"];
  if (Object.keys(r.profile).some(k => !profileKeys.includes(k))) invalid("unsupported profile fields");
  if (r.preferences !== null) {
    const p = r.preferences;
    const full: ReaderPreferencesV1 = { ...p, onboarding: "completed", astrology: "none", astrologyBridge: false };
    validateReaderPreferences(full);
    if (canonicalJson(preferencesFor(full)) !== canonicalJson(p) || canonicalJson(legacyProfile(full)) !== canonicalJson(r.profile)) invalid("reading preferences and interpretation profile differ");
  }
  if (!Array.isArray(r.observations) || r.observations.length > 3 || r.observations.some(o => !o || o.kind !== "USER_SUPPLIED" || typeof o.id !== "string" || typeof o.createdAt !== "string" || typeof o.text !== "string" || o.text.length > 600 || Object.keys(o).some(k => !["id", "createdAt", "kind", "text"].includes(k)))) invalid("invalid observations");
  if (!Array.isArray(r.feedback) || r.feedback.length > 2 || r.feedback.some(h => !h || !["resonates", "partially", "does-not-resonate"].includes(h.feedback) || typeof h.answer !== "string" || h.answer.length > 600 || typeof h.question !== "string" || h.question.length > 600 || h.subjectId !== r.scope.personId || h.chartRevision !== r.birth.updatedAt || Object.keys(h).some(k => !["answer", "question", "subjectId", "chartRevision", "feedback"].includes(k)))) invalid("feedback differs from the current chart revision");
  if (canonicalJson(r.sourcePolicy) !== canonicalJson(askSourcePolicy())) invalid("stale source/content or policy identity");
}
function buildContext(r: ChartAskRequestV1, snapshot: ParticipantSnapshotV1): AIContextV1 {
  validateRequest(r);
  if (canonicalJson(r.scope) !== canonicalJson(chartIdentity(snapshot))) invalid("stale or forged chart issuance identity");
  const { expectedContextHash: _hash, ...identity } = r;
  const context = contextFor(r.question, snapshot.facts, r.profile, r.observations, [], { selection: r.selection });
  context.question = r.question; // Keep the exact original; the target has its own validated field.
  context.birthConfidence = snapshot.birth.confidence;
  context.feedback = r.feedback.map(h => ({ answer: h.answer, feedback: h.feedback }));
  context.ask = { schema: "ChartAskIdentityV1", requestId: r.requestId, requestHash: contentHash(identity),
    scope: clone(r.scope), selection: clone(r.selection), preferences: clone(r.preferences), sourcePolicy: clone(r.sourcePolicy) };
  return context;
}

export function createChartAsk(input: {
  requestId: string; person: Person; selection: Selection; question: string;
  profile: UserInterpretationProfileV1; preferences?: ReaderPreferencesV1 | null;
}): { request: ChartAskRequestV1; context: AIContextV1 } {
  const { person } = input;
  const snapshot = createParticipantSnapshot({ origin: "application-calculated", personId: person.birth.id,
    chartVersionId: person.activeChartVersionId || `${person.birth.id}:${person.birth.updatedAt}`, birth: person.birth, facts: person.facts });
  const profile = input.profile;
  validateProfile(profile);
  const request: ChartAskRequestV1 = {
    schema: "ChartAskRequestV1", requestId: input.requestId, scope: chartIdentity(snapshot), birth: clone(snapshot.birth),
    selection: clone(input.selection), question: input.question,
    profile: { schema: profile.schema, familiarity: profile.familiarity, depth: profile.depth, terminology: profile.terminology, style: profile.style, interests: [...profile.interests] },
    preferences: preferencesFor(input.preferences || null),
    observations: person.observations.slice(-3).map(o => ({ id: o.id, createdAt: o.createdAt, kind: "USER_SUPPLIED", text: String(o.text).slice(0, 600) })),
    feedback: person.history.filter(h => h.feedback && h.context.subject.id === person.birth.id && h.context.chartRevision === person.birth.updatedAt).slice(-2).map(h => ({
      answer: (h.response?.answer || h.context.question).slice(0, 600), question: h.context.question.slice(0, 600),
      subjectId: person.birth.id, chartRevision: person.birth.updatedAt, feedback: h.feedback!,
    })),
    sourcePolicy: askSourcePolicy(), expectedContextHash: "",
  };
  const context = buildContext(request, snapshot);
  request.expectedContextHash = contentHash(context);
  return { request, context };
}

// Transported hashes are integrity assertions, never trusted issuance. Recalculate and
// issue a local validated snapshot from the birth input before comparing identities.
export function resolveChartAsk(request: unknown, requestId?: string): AIContextV1 {
  const r = request as ChartAskRequestV1;
  validateRequest(r);
  if (requestId !== undefined && r.requestId !== requestId) invalid("Ask identity differs from idempotency key");
  const snapshot = createParticipantSnapshot({ origin: "application-calculated", personId: r.birth.id,
    chartVersionId: `${r.birth.id}:${r.birth.updatedAt}`, birth: r.birth, facts: calculateChart(r.birth) });
  const context = buildContext(r, snapshot);
  if (r.expectedContextHash !== contentHash(context)) invalid("client/server context digest differs; no provider call is eligible");
  return context;
}

export function assertChartAskContext(request: ChartAskRequestV1, context: AIContextV1) {
  const rebuilt = resolveChartAsk(request, request.requestId);
  if (canonicalJson(rebuilt) !== canonicalJson(context)) invalid("local Ask context differs from the request");
}
