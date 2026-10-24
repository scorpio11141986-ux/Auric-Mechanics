import assert from "node:assert/strict";
import test from "node:test";
import { calculateComposite, snapshotFromPerson } from "../src/domain/composite";
import type { BirthRecordV1 } from "../src/domain/contracts";
import { emptyState, replacePerson } from "../src/persistence/state";
import {
  COMPOSITE_HEAD_KEY, LEGACY_STATE_KEY, emptyCompositeState, exportRelationshipReceipt,
  importRelationshipReceipt, readCompositeState, rebuildComposite, removePersonAndDependents,
  removeRelationship, restoreCompositeState, saveRelationship, writeCompositeState,
  hasNewerNatalRevision,
  type CompositeAppStateV2, type StoragePort,
} from "../src/persistence/composite-state";

const birth = (id: string, date: string, updatedAt = "2026-10-12T00:00:00.000Z"): BirthRecordV1 => ({
  schema: "BirthRecordV1", id, name: "Synthetic shared name", date, localTime: "00:00", timezone: "UTC",
  latitude: 0, longitude: 0, place: "Synthetic, not a person", confidence: "exact", source: "user-entered", updatedAt,
});
function pair() {
  let s: CompositeAppStateV2 = emptyCompositeState();
  for (const b of [birth("synthetic-A", "2024-01-01"), birth("synthetic-B", "2024-06-01")])
    s = { ...replacePerson(s, b), schema: "AppStateV2", relationships: s.relationships };
  const result = calculateComposite(snapshotFromPerson(s.people[0]), snapshotFromPerson(s.people[1]), { computedAt: "2026-10-12T00:00:00.000Z" });
  return { s, result };
}
class MemoryPort implements StoragePort {
  data = new Map<string, string>();
  fail: "set" | "remove" | null = null;
  failKey = "";
  async getItem(key: string) { return this.data.get(key) ?? null; }
  async setItem(key: string, value: string) { if (this.fail === "set" && key === this.failKey) throw Error("synthetic write failure"); this.data.set(key, value); }
  async removeItem(key: string) { if (this.fail === "remove" && key === this.failKey) throw Error("synthetic cleanup failure"); this.data.delete(key); }
}
test("V1 migration preserves natal data and chart revisions byte-relevant fields", async () => {
  const { s } = pair(), port = new MemoryPort();
  const legacy = { schema: "AppStateV1", people: s.people, activeId: s.activeId, profile: s.profile };
  port.data.set(LEGACY_STATE_KEY, JSON.stringify(legacy));
  const got = await readCompositeState(port);
  assert.equal(got.schema, "AppStateV2");
  assert.deepEqual(JSON.parse(JSON.stringify(got.people.map(p => p.versions))), JSON.parse(JSON.stringify(s.people.map(p => p.versions))));
  assert.equal(port.data.has(LEGACY_STATE_KEY), false);
  assert.ok(port.data.has(COMPOSITE_HEAD_KEY));
  assert.deepEqual(JSON.parse(JSON.stringify((await readCompositeState(port)).people.map(p => p.birth))), JSON.parse(JSON.stringify(s.people.map(p => p.birth))));
});
test("one unordered pair reuses identity; swapped roles, immutable revisions and explicit recalculation survive reopen", async () => {
  let { s, result } = pair();
  s = saveRelationship(s, result, ["synthetic-A", "synthetic-B"]);
  const id = s.relationships[0].relationshipId;
  s = saveRelationship(s, result, ["synthetic-B", "synthetic-A"]);
  assert.equal(s.relationships.length, 1);
  assert.equal(s.relationships[0].relationshipId, id);
  assert.deepEqual(s.relationships[0].displayParticipantIds, ["synthetic-B", "synthetic-A"]);
  const oldId = s.relationships[0].selectedCalculationId;
  s = { ...replacePerson(s, birth("synthetic-A", "2024-02-01", "2026-10-12T00:01:00.000Z")), schema: "AppStateV2", relationships: s.relationships };
  assert.equal(rebuildComposite(s, s.relationships[0]).calculationId, oldId);
  result = calculateComposite(snapshotFromPerson(s.people.find(p => p.birth.id === "synthetic-A")!), snapshotFromPerson(s.people.find(p => p.birth.id === "synthetic-B")!));
  s = saveRelationship(s, result, ["synthetic-B", "synthetic-A"]);
  assert.equal(s.relationships[0].revisions.length, 2);
  const port = new MemoryPort();
  assert.deepEqual(await writeCompositeState(port, s), { cleanupComplete: true });
  const reopened = await readCompositeState(port);
  assert.equal(reopened.relationships[0].revisions[0].calculationId, oldId);
  assert.equal(rebuildComposite(reopened, reopened.relationships[0], oldId).calculationId, oldId);
});
test("corrupt pins, unsupported schema and missing person refuse calculated status", () => {
  let { s, result } = pair();s = saveRelationship(s, result, ["synthetic-A", "synthetic-B"]);
  const altered = structuredClone(s);altered.relationships[0].revisions[0].factsHash = "wrong";
  assert.throws(() => restoreCompositeState(JSON.stringify(altered)), /no longer match/);
  assert.throws(() => restoreCompositeState('{"schema":"AppStateV3"}'), /unsupported/);
  altered.relationships[0].revisions[0].factsHash = s.relationships[0].revisions[0].factsHash;
  altered.activeId = "synthetic-A";
  altered.people.pop();
  assert.throws(() => restoreCompositeState(JSON.stringify(altered)), /pinned person is missing/);
});
test("failed staging and failed commit preserve previous generation; cleanup failure is disclosed and repaired on reopen", async () => {
  const { s, result } = pair(), port = new MemoryPort();
  await writeCompositeState(port, s);
  const original = await port.getItem(COMPOSITE_HEAD_KEY);
  const next = saveRelationship(s, result, ["synthetic-A", "synthetic-B"]);
  port.fail = "set";port.failKey = "auric-mechanics:state-v2:1";
  await assert.rejects(writeCompositeState(port, next), /synthetic write failure/);
  assert.equal(await port.getItem(COMPOSITE_HEAD_KEY), original);
  port.failKey = COMPOSITE_HEAD_KEY;
  await assert.rejects(writeCompositeState(port, next), /synthetic write failure/);
  assert.equal(await port.getItem(COMPOSITE_HEAD_KEY), original);
  port.fail = "remove";port.failKey = "auric-mechanics:state-v2:0";
  assert.deepEqual(await writeCompositeState(port, next), { cleanupComplete: false });
  await assert.rejects(readCompositeState(port), /synthetic cleanup failure/);
  port.fail = null;
  assert.equal((await readCompositeState(port)).relationships.length, 1);
  assert.equal(port.data.has("auric-mechanics:state-v2:0"), false);
});
test("Person deletion cascades pair revisions; relationship deletion retains both people", async () => {
  let { s, result } = pair();s = saveRelationship(s, result, ["synthetic-A", "synthetic-B"]);
  assert.equal(removeRelationship(s, s.relationships[0].relationshipId).people.length, 2);
  const removed = removePersonAndDependents(s, "synthetic-A");
  assert.equal(removed.people.length, 1);assert.equal(removed.relationships.length, 0);
  const port = new MemoryPort();await writeCompositeState(port, s);await writeCompositeState(port, removed);
  assert.deepEqual((await readCompositeState(port)).relationships, []);
  assert.equal([...port.data.values()].some(raw => raw.includes("synthetic-A")), false);
});
test("redacted export retains pins and rejects manual reimport", () => {
  const { s, result } = pair(), rel = saveRelationship(s, result, ["synthetic-A", "synthetic-B"]).relationships[0];
  const receipt = exportRelationshipReceipt(rel);
  assert.equal(receipt.includes("2024-01-01"), false);
  assert.equal(receipt.includes("Synthetic shared name"), false);
  assert.equal(JSON.parse(receipt).selectedCalculationId, result.calculationId);
  assert.throws(() => importRelationshipReceipt(receipt), /reference-only/);
});
test("staging and marker readback faults fail visibly and restart follows only a complete validated commit",async()=>{
  const {s,result}=pair(),next=saveRelationship(s,result,["synthetic-A","synthetic-B"]);
  class ReadFaultPort extends MemoryPort {
    fault:"stage-readback"|"marker-readback"|null=null;staged=false;committed=false;
    async setItem(key:string,value:string){await super.setItem(key,value);if(key.endsWith(":1"))this.staged=true;if(key===COMPOSITE_HEAD_KEY&&this.staged)this.committed=true;}
    async getItem(key:string){const value=await super.getItem(key);if(this.fault==="stage-readback"&&this.staged&&key.endsWith(":1"))return "corrupt staging readback";
      if(this.fault==="marker-readback"&&this.committed&&key===COMPOSITE_HEAD_KEY)return JSON.stringify({schema:"AppStateV2Head",slot:0,sha256:"0".repeat(64)});return value;}
  }
  const stage=new ReadFaultPort();await writeCompositeState(stage,s);const head=await stage.getItem(COMPOSITE_HEAD_KEY);
  stage.fault="stage-readback";await assert.rejects(writeCompositeState(stage,next),/staging readback failed/);stage.fault=null;
  assert.equal(await stage.getItem(COMPOSITE_HEAD_KEY),head);assert.equal((await readCompositeState(stage)).relationships.length,0);
  const marker=new ReadFaultPort();await writeCompositeState(marker,s);marker.fault="marker-readback";
  await assert.rejects(writeCompositeState(marker,next),/commit marker readback failed/);marker.fault=null;
  const recovered=await readCompositeState(marker);assert.equal(recovered.relationships.length,1);
  assert.equal(rebuildComposite(recovered,recovered.relationships[0]).factsHash,result.factsHash);
});
test("failed migration staging keeps the original natal key usable; malformed selected revision fails closed",async()=>{
  const {s,result}=pair(),port=new MemoryPort();const legacy={schema:"AppStateV1",people:s.people,activeId:s.activeId,profile:s.profile};
  const raw=JSON.stringify(legacy);port.data.set(LEGACY_STATE_KEY,raw);port.fail="set";port.failKey="auric-mechanics:state-v2:0";
  await assert.rejects(readCompositeState(port),/synthetic write failure/);assert.equal(port.data.get(LEGACY_STATE_KEY),raw);assert.equal(port.data.has(COMPOSITE_HEAD_KEY),false);
  port.fail=null;assert.equal((await readCompositeState(port)).people.length,2);
  const saved=saveRelationship(s,result,["synthetic-A","synthetic-B"]);saved.relationships[0].selectedCalculationId="missing";
  assert.throws(()=>restoreCompositeState(JSON.stringify(saved)),/revision is unavailable/);
});
test("legacy current versions do not create false newer-chart notices; real edits do",()=>{
  let {s,result}=pair();for(const person of s.people){delete person.activeChartVersionId;delete person.versions;}
  assert.equal(hasNewerNatalRevision(s,result),false);
  s=replacePerson(s,birth("synthetic-A","2024-02-01","2026-10-12T00:01:00.000Z"));
  assert.equal(hasNewerNatalRevision(s,result),true);
});
