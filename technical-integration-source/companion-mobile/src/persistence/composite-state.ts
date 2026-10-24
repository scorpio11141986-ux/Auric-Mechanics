import type { AppStateV1 } from "../domain/contracts";
import type { CompositeCalculationV1, CompositePinsV1 } from "../domain/composite-contracts";
import { calculateComposite, relationshipIdentity, snapshotFromPerson } from "../domain/composite";
import { sha256 } from "../domain/composite-hash";
import { emptyState, restoreState } from "./state";
import { readingEntry, validateStoredReadingEntry, type ReportRequestV1, type RelationshipReadingEntryV1 } from "../intelligence/relationship";

export const LEGACY_STATE_KEY = "infinity-rae-companion:v1";
export const COMPOSITE_HEAD_KEY = "auric-mechanics:state-v2:head";
const slotKey = (slot: 0 | 1) => `auric-mechanics:state-v2:${slot}`;
export type CompositeRevisionV1 = {
  schema: "CompositeRevisionV1";
  calculationId: string;
  computedAt: string;
  factsHash: string;
  status: CompositeCalculationV1["status"];
  pins: CompositePinsV1;
  inputRefs: { personId: string; chartVersionId: string; snapshotHash: string }[];
};
export type RelationshipV1 = {
  schema: "RelationshipV1";
  relationshipId: string;
  pairKey: string;
  personIds: [string, string];
  displayParticipantIds: [string, string];
  label: string;
  createdAt: string;
  updatedAt: string;
  revisions: CompositeRevisionV1[];
  selectedCalculationId: string;
};
export type CompositeAppStateV2 = Omit<AppStateV1, "schema"> & {
  schema: "AppStateV2";
  relationships: RelationshipV1[];
  relationshipReadingHistory?: RelationshipReadingEntryV1[];
};
export type StoragePort = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};
type Head = { schema: "AppStateV2Head"; slot: 0 | 1; sha256: string };
const iso = (value: string) => typeof value === "string" && Number.isFinite(Date.parse(value));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const emptyCompositeState = (): CompositeAppStateV2 => ({ ...emptyState(), schema: "AppStateV2", relationships: [] });
export function hasNewerNatalRevision(state:CompositeAppStateV2,calculation:CompositeCalculationV1):boolean {
  return calculation.inputs.some(ref=>{const person=state.people.find(p=>p.birth.id===ref.personId);
    return !person||(person.activeChartVersionId||`${person.birth.id}:${person.birth.updatedAt}`)!==ref.chartVersionId;});
}

export function revisionFor(calculation: CompositeCalculationV1): CompositeRevisionV1 {
  return {
    schema: "CompositeRevisionV1", calculationId: calculation.calculationId,
    computedAt: calculation.computedAt, factsHash: calculation.factsHash,
    status: calculation.status, pins: calculation.pins,
    inputRefs: calculation.inputs.map(p => ({ personId: p.personId, chartVersionId: p.chartVersionId, snapshotHash: p.snapshotHash })),
  };
}
export function rebuildComposite(state: CompositeAppStateV2, relationship: RelationshipV1, requestedId = relationship.selectedCalculationId): CompositeCalculationV1 {
  const revision = relationship.revisions.find(r => r.calculationId === requestedId);
  if (!revision) throw Error("The saved calculation revision is unavailable.");
  const snapshots = revision.inputRefs.map(ref => {
    const person = state.people.find(p => p.birth.id === ref.personId);
    if (!person) throw Error("A pinned person is missing; saved Composite mechanics are withheld.");
    const snapshot = snapshotFromPerson(person, ref.chartVersionId);
    if (snapshot.snapshotHash !== ref.snapshotHash) throw Error("A pinned natal revision changed; saved Composite mechanics are withheld.");
    return snapshot;
  });
  if (snapshots.length !== 2) throw Error("A saved Composite requires exactly two validated natal snapshots.");
  const result = calculateComposite(snapshots[0], snapshots[1], { computedAt: revision.computedAt, expectedInputs: revision.inputRefs });
  if (result.calculationId !== revision.calculationId || result.factsHash !== revision.factsHash || result.status !== revision.status || !same(result.pins, revision.pins) || result.relationshipId !== relationship.relationshipId)
    throw Error("Saved Composite identity or calculation pins no longer match. The revision remains stored but cannot be shown as current facts.");
  return result;
}
export function saveRelationship(state: CompositeAppStateV2, calculation: CompositeCalculationV1, displayParticipantIds: [string, string]): CompositeAppStateV2 {
  const pair = relationshipIdentity(displayParticipantIds[0], displayParticipantIds[1]);
  if (pair.relationshipId !== calculation.relationshipId || !same([...displayParticipantIds].sort(), calculation.inputs.map(p => p.personId).sort()))
    throw Error("Display participants do not match the issued calculation.");
  const now = new Date().toISOString(), existing = state.relationships.find(r => r.relationshipId === pair.relationshipId);
  const revision = revisionFor(calculation);
  const next: RelationshipV1 = existing ? {
    ...existing, displayParticipantIds, updatedAt: now,
    revisions: existing.revisions.some(r => r.calculationId === revision.calculationId) ? existing.revisions : [...existing.revisions, revision],
    selectedCalculationId: revision.calculationId,
  } : {
    schema: "RelationshipV1", relationshipId: pair.relationshipId, pairKey: pair.pairKey,
    personIds: [...displayParticipantIds].sort() as [string, string], displayParticipantIds,
    label: "", createdAt: now, updatedAt: now, revisions: [revision], selectedCalculationId: revision.calculationId,
  };
  const result = { ...state, relationships: [...state.relationships.filter(r => r.relationshipId !== pair.relationshipId), next] };
  // Validate the actual app-owned pinned versions before claiming Saved.
  rebuildComposite(result, next);
  return result;
}
export function removeRelationship(state: CompositeAppStateV2, relationshipId: string): CompositeAppStateV2 {
  return { ...state, relationships: state.relationships.filter(r => r.relationshipId !== relationshipId),...(state.relationshipReadingHistory?{relationshipReadingHistory:state.relationshipReadingHistory.filter(x=>x.request.relationshipId!==relationshipId)}:{}) };
}
export function removePersonAndDependents(state: CompositeAppStateV2, personId: string): CompositeAppStateV2 {
  const people = state.people.filter(p => p.birth.id !== personId);
  return { ...state, people, activeId: state.activeId === personId ? people[0]?.birth.id || null : state.activeId,
    relationships: state.relationships.filter(r => !r.personIds.includes(personId)),...(state.relationshipReadingHistory?{relationshipReadingHistory:state.relationshipReadingHistory.filter(x=>!x.request.roles.includes(personId))}:{}) };
}
export function saveRelationshipReading(state:CompositeAppStateV2,calculation:CompositeCalculationV1,request:ReportRequestV1):CompositeAppStateV2 {
  const entry=readingEntry(calculation,request),rel=state.relationships.find(x=>x.relationshipId===request.relationshipId);
  if(!rel||!rel.revisions.some(x=>x.calculationId===request.calculationId))throw Error("Save this relationship revision before retaining a request.");
  const owned=rebuildComposite(state,rel,request.calculationId);readingEntry(owned,request);
  return {...state,relationshipReadingHistory:[...(state.relationshipReadingHistory||[]).filter(x=>x.id!==entry.id),entry].slice(-100)};
}
export function restoreCompositeState(raw: string | null): CompositeAppStateV2 {
  if (!raw) return emptyCompositeState();
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Saved app state has an invalid envelope.");
  const row = parsed as Record<string, unknown>;
  if (row.schema === "AppStateV1") return { ...restoreState(raw), schema: "AppStateV2", relationships: [] };
  if (row.schema !== "AppStateV2" || !Array.isArray(row.relationships) || row.relationships.length > 100)
    throw Error("Saved app state version is unsupported; storage was left untouched.");
  const restored = restoreState(JSON.stringify({ schema: "AppStateV1", people: row.people, activeId: row.activeId, profile: row.profile }));
  const state: CompositeAppStateV2 = { ...row, ...restored, schema: "AppStateV2", relationships: row.relationships as RelationshipV1[] };
  const ids = new Set<string>();
  for (const rel of state.relationships) {
    if (!rel || rel.schema !== "RelationshipV1" || !Array.isArray(rel.personIds) || rel.personIds.length !== 2 || !Array.isArray(rel.displayParticipantIds) || rel.displayParticipantIds.length !== 2 || typeof rel.label !== "string" || rel.label.length > 140 || !iso(rel.createdAt) || !iso(rel.updatedAt) || !Array.isArray(rel.revisions) || !rel.revisions.length || rel.revisions.length > 100)
      throw Error("Saved Relationship has invalid fields.");
    const pair = relationshipIdentity(rel.personIds[0], rel.personIds[1]);
    if (pair.relationshipId !== rel.relationshipId || pair.pairKey !== rel.pairKey || !same(rel.personIds, [...rel.personIds].sort()) || !same([...rel.displayParticipantIds].sort(), rel.personIds) || ids.has(rel.relationshipId))
      throw Error("Saved Relationship identity is invalid or duplicated.");
    ids.add(rel.relationshipId);
    if (new Set(rel.revisions.map(r => r.calculationId)).size !== rel.revisions.length) throw Error("Saved calculation revisions are duplicated.");
    for (const rev of rel.revisions) {
      if (rev.schema !== "CompositeRevisionV1" || !iso(rev.computedAt) || !Array.isArray(rev.inputRefs) || rev.inputRefs.length !== 2 || !same(rev.inputRefs.map(p => p.personId).sort(), rel.personIds) || typeof rev.factsHash !== "string" || !rev.factsHash || !rev.pins)
        throw Error("Saved Composite revision is invalid.");
    }
    rebuildComposite(state, rel);
  }
  if(row.relationshipReadingHistory!==undefined) {
    if(!Array.isArray(row.relationshipReadingHistory)||row.relationshipReadingHistory.length>100)throw Error("Saved relationship request history is invalid.");
    state.relationshipReadingHistory=row.relationshipReadingHistory as RelationshipReadingEntryV1[];
    const seen=new Set<string>();
    for(const entry of state.relationshipReadingHistory){
      validateStoredReadingEntry(entry);const q=entry.request,rel=state.relationships.find(x=>x.relationshipId===q.relationshipId),rev=rel?.revisions.find(x=>x.calculationId===q.calculationId);
      if(!rel||!rev||seen.has(entry.id)||!same([...q.roles].sort(),rel.personIds)||!same(q.inputRefs,rev.inputRefs)||q.factsHash!==rev.factsHash||q.catalogSHA256!==rev.pins.catalogSHA256||q.canonicalSHA256!==rev.pins.canonicalSHA256)throw Error("Stored reading has missing or inconsistent relationship/revision evidence.");
      seen.add(entry.id);
    }
  }
  return state;
}
function readHead(raw: string | null): Head | null {
  if (!raw) return null;
  const h: Head = JSON.parse(raw);
  if (h?.schema !== "AppStateV2Head" || (h.slot !== 0 && h.slot !== 1) || !/^[a-f0-9]{64}$/.test(h.sha256))
    throw Error("Saved state commit marker is invalid; storage was left untouched.");
  return h;
}
async function cleanup(storage: StoragePort, active: 0 | 1) {
  await storage.removeItem(slotKey(active === 0 ? 1 : 0));
  await storage.removeItem(LEGACY_STATE_KEY);
}
export async function readCompositeState(storage: StoragePort): Promise<CompositeAppStateV2> {
  const head = readHead(await storage.getItem(COMPOSITE_HEAD_KEY));
  if (head) {
    const raw = await storage.getItem(slotKey(head.slot));
    if (!raw || sha256(raw) !== head.sha256) throw Error("Saved state commit does not match its data; storage was left untouched.");
    const state = restoreCompositeState(raw);
    await cleanup(storage, head.slot);
    return state;
  }
  const legacy = await storage.getItem(LEGACY_STATE_KEY);
  const migrated = restoreCompositeState(legacy);
  const result = await writeCompositeState(storage, migrated);
  if (!result.cleanupComplete) throw Error("Old local data cleanup is pending; retry reopening before editing.");
  return migrated;
}
export async function writeCompositeState(storage: StoragePort, state: CompositeAppStateV2): Promise<{ cleanupComplete: boolean }> {
  restoreCompositeState(JSON.stringify(state));
  const old = readHead(await storage.getItem(COMPOSITE_HEAD_KEY));
  const slot: 0 | 1 = old?.slot === 0 ? 1 : 0;
  const data = JSON.stringify(state), head: Head = { schema: "AppStateV2Head", slot, sha256: sha256(data) };
  await storage.setItem(slotKey(slot), data);
  const readback = await storage.getItem(slotKey(slot));
  if (readback !== data) throw Error("Saved state staging readback failed; previous committed state remains selected.");
  await storage.setItem(COMPOSITE_HEAD_KEY, JSON.stringify(head));
  const marker = readHead(await storage.getItem(COMPOSITE_HEAD_KEY));
  if (!marker || !same(marker, head)) throw Error("Saved state commit marker readback failed; reopen storage before making more changes.");
  try { await cleanup(storage, slot); return { cleanupComplete: true }; }
  catch { return { cleanupComplete: false }; }
}

export function exportRelationshipReceipt(relationship: RelationshipV1): string {
  return JSON.stringify({ schema: "RedactedRelationshipReceiptV1", importability: "reference-only", relationshipId: relationship.relationshipId,
    pairKey: relationship.pairKey, selectedCalculationId: relationship.selectedCalculationId,
    revisions: relationship.revisions.map(r => ({ calculationId: r.calculationId, factsHash: r.factsHash, status: r.status, pins: r.pins,
      inputRefs: r.inputRefs })) }, null, 2);
}
export function importRelationshipReceipt(_raw: string): never {
  throw Error("Redacted or manual relationship receipts are reference-only. Recalculate from two validated saved natal charts.");
}
