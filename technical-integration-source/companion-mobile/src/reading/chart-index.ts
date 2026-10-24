import { runtime, centerId } from '../content/records';
import { validateParticipantSnapshot, calculateComposite } from '../domain/composite';
import type { ParticipantSnapshotV1, CompositeCalculationV1, StructureGraphV1 } from '../domain/composite-contracts';
import type { CenterId } from '../domain/contracts';
import { contentHash } from '../domain/composite-hash';
import { exactLineEligible } from '../intelligence/ask-selection';
import { freezeReadingValue } from './compiler';
import type { IndexedActivation, IndexedChannel, IndexedCenter, IndexedFact, JsonValue, ReadingChartIndex, UnfinishedPath } from './contracts';

const indexes = new WeakSet<object>();
const identity = (snapshot: ParticipantSnapshotV1, native: string) => `${snapshot.personId}:${snapshot.chartVersionId}:${native}`;
function natalGraph(snapshot: ParticipantSnapshotV1): StructureGraphV1 {
  const edges = snapshot.facts.channels.map(c => ({ channelId: c.id, gates: c.gates as [number, number], centers: c.centers as [CenterId, CenterId] }));
  return { schema: 'StructureGraphV1', id: `natal:${snapshot.snapshotHash}`, scope: { kind: 'participant', personIds: [snapshot.personId], inputRefs: [{ personId: snapshot.personId, chartVersionId: snapshot.chartVersionId, snapshotHash: snapshot.snapshotHash }] }, gates: [...snapshot.facts.gates], definedCenters: snapshot.facts.centers.filter(c => c.defined).map(c => c.id), edges, components: snapshot.facts.definitionIslands.map((centerIds, i) => ({ id: `${snapshot.snapshotHash}:component:${i}`, centerIds: [...centerIds] })), componentCount: snapshot.facts.definitionIslands.length, definition: snapshot.facts.definition };
}
function build(participants: ParticipantSnapshotV1[], composite: CompositeCalculationV1 | null): ReadingChartIndex {
  const activations: IndexedActivation[] = participants.flatMap(p => p.facts.activations.map(a => {
    const exact = p.eligibility === 'exact-point' && exactLineEligible(p.facts, a);
    return { id: identity(p, a.id), activationId: identity(p, a.id), nativeActivationId: a.id, personId: p.personId, chartVersionId: p.chartVersionId, chartRevisionId: p.chartVersionId, snapshotHash: p.snapshotHash, side: a.side, planet: a.planet, planetKey: a.id.split(':').at(-1)!, gate: a.gate, line: exact ? a.line : null, calculatedLine: a.line, center: a.center, exactLineEligible: exact, lineStatus: exact ? 'exact-point' as const : 'uncertain-withheld' as const, gateOccurrenceIds: [] as string[], exactLineOccurrenceIds: [] as string[] };
  }));
  for (const a of activations) {
    a.gateOccurrenceIds = activations.filter(b => b.personId === a.personId && b.gate === a.gate).map(b => b.id);
    a.exactLineOccurrenceIds = a.line === null ? [] : activations.filter(b => b.personId === a.personId && b.gate === a.gate && b.line === a.line).map(b => b.id);
  }
  const channels: IndexedChannel[] = participants.flatMap(p => runtime.channels.map(c => ({ channelId: c.id, gates: [...c.gates], centers: c.centers.map((_, i) => p.facts.activations.find(a => a.gate === c.gates[i])?.center || canonicalCenter(c.gates[i])), personId: p.personId, complete: c.gates.every(g => p.facts.gates.includes(g)), endpointActivationIds: c.gates.map(g => activations.filter(a => a.personId === p.personId && a.gate === g).map(a => a.id)) })));
  if (composite) for (const relation of composite.facts.channelRelations) channels.push({ channelId: relation.channelId, gates: [...relation.gates], centers: [...relation.centers], personId: null, complete: relation.formed, endpointActivationIds: relation.gates.map(g => activations.filter(a => a.gate === g).map(a => a.id)), relation });
  const centers: IndexedCenter[] = participants.flatMap(p => p.facts.centers.map(c => {
    const active = activations.filter(a => a.personId === p.personId && a.center === c.id).map(a => a.id);
    return { personId: p.personId, centerId: c.id, state: c.defined ? 'defined' as const : active.length ? 'undefined-with-activation' as const : 'completely-open' as const, activationIds: active, completedChannelIds: p.facts.channels.filter(ch => ch.centers.includes(c.id)).map(ch => ch.id) };
  }));
  if (composite) for (const c of composite.facts.topology.centers) {
    const active = activations.filter(a => a.center === c.centerId).map(a => a.id);
    centers.push({ personId: null, centerId: c.centerId, state: c.combinedDefined ? 'defined' : active.length ? 'undefined-with-activation' : 'completely-open', activationIds: active, completedChannelIds: composite.facts.topology.combinedGraph.edges.filter(e => e.centers.includes(c.centerId)).map(e => e.channelId) });
  }
  const graphs = composite ? [...composite.facts.topology.natalGraphs, composite.facts.topology.combinedGraph] : participants.map(natalGraph);
  const unfinishedPaths: UnfinishedPath[] = [];
  for (const p of participants) for (const c of channels.filter(c => c.personId === p.personId && !c.complete)) {
    const present = c.gates.filter(g => p.facts.gates.includes(g));
    if (present.length === 1) unfinishedPaths.push({ id: `${p.personId}:unfinished:${c.channelId}`, personId: p.personId, channelId: c.channelId, presentGate: present[0], absentGate: c.gates.find(g => g !== present[0])!, centers: c.centers, activationIds: activations.filter(a => a.personId === p.personId && a.gate === present[0]).map(a => a.id), otherCompletedChannelIds: p.facts.channels.filter(ch => ch.gates.includes(present[0])).map(ch => ch.id) });
  }
  const facts: IndexedFact[] = [];
  const fact = (predicate: string, personIds: string[], activationIds: string[], value: unknown) => facts.push({ id: `reading-fact:${contentHash({ predicate, personIds, activationIds, value })}`, predicate, personIds, activationIds, value: value as JsonValue, source: composite ? 'issued-composite-calculation' : 'issued-natal-snapshot' });
  for (const a of activations) fact('activation', [a.personId], [a.id], { activationId: a.id, gate: a.gate, line: a.line, side: a.side, planetKey: a.planetKey, center: a.center, lineStatus: a.lineStatus });
  for (const p of participants) fact('natal-classification', [p.personId], [], { personId: p.personId, type: p.facts.type, strategy: p.facts.strategy, authority: p.facts.authority, profile: p.facts.profile, definition: p.facts.definition, componentIds: graphs.find(g => g.scope.personIds.length === 1 && g.scope.personIds[0] === p.personId)!.components.map(c => c.id) });
  for (const c of centers) fact('center-state', c.personId ? [c.personId] : participants.map(p => p.personId), c.activationIds, c);
  for (const c of channels.filter(c => c.complete)) fact(c.relation ? 'channel-ownership' : 'channel-completion', c.personId ? [c.personId] : participants.map(p => p.personId), c.endpointActivationIds.flat(), c);
  for (const g of graphs) for (const c of g.components) fact('definition-component', g.scope.personIds, [], { graphId: g.id, componentId: c.id, centerIds: c.centerIds, channelIds: g.edges.filter(e => e.centers.every(center => c.centerIds.includes(center))).map(e => e.channelId) });
  for (const path of unfinishedPaths) fact('unfinished-harmonic-path', [path.personId], path.activationIds, path);
  if (composite) {
    for (const join of composite.facts.topology.actualJoins) fact('actual-island-join', [join.personId], [], join);
    for (const route of composite.facts.topology.motorRoutes) fact('motor-route', participants.map(p => p.personId), [], route);
  }
  const repeatedGates = [...new Set(activations.map(a => a.gate))].sort((a,b) => a-b).map(gate => ({ gate, activationIds: activations.filter(a => a.gate === gate).map(a => a.id) })).filter(g => g.activationIds.length > 1);
  const repeatedLines = [...new Set(activations.filter(a => a.line !== null).map(a => `${a.gate}.${a.line}`))].map(gl => { const [gate,line] = gl.split('.').map(Number); return { gate, line, activationIds: activations.filter(a => a.gate === gate && a.line === line).map(a => a.id) }; }).filter(g => g.activationIds.length > 1);
  const body = { schema: 'AuricReadingChartIndexV1' as const, context: composite ? 'composite' as const : 'natal' as const, participants, composite, activations, repeatedGates, repeatedLines, centers, channels, graphs, components: graphs.flatMap(g => g.components.map(c => ({ graphId: g.id, ...c }))), unfinishedPaths, facts };
  const index = freezeReadingValue({ ...body, indexHash: contentHash(body) }); indexes.add(index); return index;
}
function canonicalCenter(gate: number): CenterId {
  const g = runtime.gates.find(g => g.gate_number === gate)!;
  return centerId(g.center);
}
export function buildNatalChartIndex(snapshot: ParticipantSnapshotV1): ReadingChartIndex { return build([validateParticipantSnapshot(snapshot)], null); }
export function buildCompositeChartIndex(calculation: CompositeCalculationV1): ReadingChartIndex {
  if (!calculation || calculation.inputs?.length !== 2) throw Error('UNTRUSTED_ISSUANCE: Composite needs two issued participants.');
  const inputs = calculation.inputs.map(p => validateParticipantSnapshot(p));
  const ordered = calculation.displayParticipantIds.map(id => inputs.find(p => p.personId === id));
  if (ordered.length !== 2 || !ordered[0] || !ordered[1] || ordered[0] === ordered[1]) throw Error('UNTRUSTED_ISSUANCE: Composite role order differs from participants.');
  const rebuilt = calculateComposite(ordered[0], ordered[1], { computedAt: calculation.computedAt });
  if (contentHash(rebuilt) !== contentHash(calculation)) throw Error('UNTRUSTED_ISSUANCE: Composite differs from the issued calculation.');
  return build(inputs, rebuilt);
}
export function assertReadingChartIndex(index: unknown): asserts index is ReadingChartIndex {
  if (!index || typeof index !== 'object' || !indexes.has(index)) throw Error('UNTRUSTED_ISSUANCE: A fresh application-issued chart index is required.');
}
