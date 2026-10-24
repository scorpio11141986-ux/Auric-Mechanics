import { runtime, gates, centerId, datasetPin, byId } from "../content/records";
import { calculateChart, deriveStructure, PLANETS } from "./calculator";
import { mapLongitude } from "./astronomy";
import { resolveBirthUtc, validateBirth } from "./birth";
import { CENTER_NAMES, type CenterId, type HumanDesignFactsV1, type BirthRecordV1, type Person } from "./contracts";
import { canonicalJson, contentHash } from "./composite-hash";
import type { ParticipantSnapshotV1, CompositePinsV1, CompositeContributionV1, ChannelRelationV1, EndpointState, ChannelClassification, ChannelRole, StructureGraphV1, PathWitnessV1, PairTopologyV1, CompositeFactsV1, CompositeCalculationV1, MechanicsFactV1 } from "./composite-contracts";
export type * from "./composite-contracts";
export class CompositeInputError extends Error {
    constructor(public readonly code: "INVALID_INPUT" | "INVALID_IDENTITY" | "INVALID_ACTIVATION" | "INCONSISTENT_FACTS" | "UNSUPPORTED_BIRTH_TIME" | "UNVALIDATED_IMPORT" | "INCOMPATIBLE_PIN" | "STALE_INPUT" | "CANCELLED" | "INVALID_TRACE", message: string) { super(message); this.name = "CompositeInputError"; }
}
function fail(code: CompositeInputError["code"], message: string): never { throw new CompositeInputError(code, message); }
function record(value: unknown): Record<string, any> {
    if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        fail("INVALID_INPUT", "Expected a plain versioned input record.");
    return value as Record<string, any>;
}
function identity(value: unknown): string {
    if (typeof value !== "string" || !value.trim() || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value))
        fail("INVALID_IDENTITY", "Missing or invalid immutable identity.");
    return value;
}
const sorted = <T extends string | number>(items: T[]): T[] => [...items].sort((a, b) => typeof a === "number" && typeof b === "number" ? a - b : a < b ? -1 : a > b ? 1 : 0);
const unique = <T>(items: T[]): T[] => [...new Set(items)];
function freeze<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        for (const item of Object.values(value))
            freeze(item);
        Object.freeze(value);
    }
    return value;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const pins: CompositePinsV1 = freeze({ algorithm: "CM01a-1.0.0", schema: "CompositeCalculationV1", catalogVersion: datasetPin.runtimeVersion, catalogSHA256: datasetPin.files["app1_runtime.min.json"].sha256, canonicalSHA256: datasetPin.canonical.sha256, sourceAuthentication: datasetPin.sourceAuthentication });
const issuedSnapshots = new WeakSet<object>(), issuedCalculations = new WeakSet<object>();
const centers = sorted(Object.keys(CENTER_NAMES) as CenterId[]);
const channels = [...runtime.channels].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const nonclaims = ["Structural roles do not predict feelings, compatibility, communication ability, consent or safety.", "No combined natal Type, Authority, Strategy, Profile or birth identity.", "One sufficient route does not establish uniqueness, necessity or complete alternatives.", "Structural validation does not authenticate birth information, original sources or content rights."];
type Options = {
    signal?: AbortSignal;
};
function check(options: Options) {
    if (options.signal?.aborted)
        fail("CANCELLED", "CM-01a calculation cancelled; no partial result is returned.");
}
function equal(a: unknown, b: unknown) { return canonicalJson(a) === canonicalJson(b); }
export type ParticipantInput = {
    origin: "application-calculated" | "manual-import";
    personId: string;
    chartVersionId: string;
    birth: BirthRecordV1;
    facts: HumanDesignFactsV1;
};
function normalizeFacts(facts: HumanDesignFactsV1): HumanDesignFactsV1 {
    return { ...facts, activations: [...facts.activations].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), gates: sorted(facts.gates), hangingGates: sorted(facts.hangingGates), channels: [...facts.channels].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), centers: [...facts.centers].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), definitionIslands: facts.definitionIslands.map(i => sorted(i)).sort((a, b) => a.join(",") < b.join(",") ? -1 : a.join(",") > b.join(",") ? 1 : 0) };
}
export function createParticipantSnapshot(input: ParticipantInput, options: Options = {}): ParticipantSnapshotV1 {
    check(options);
    const row = record(input);
    if (row.origin !== "application-calculated")
        fail("UNVALIDATED_IMPORT", "Unvalidated/manual imported facts are reference-only; explicitly recalculate and validate with the application first.");
    const personId = identity(row.personId), chartVersionId = identity(row.chartVersionId);
    const birth = record(row.birth) as BirthRecordV1;
    if (!["exact", "approximate"].includes(birth.confidence) || birth.timeWindow !== undefined)
        fail("UNSUPPORTED_BIRTH_TIME", "CM-01a accepts exact or provisional approximate points only; range/unknown worlds require CM-03.");
    try {
        validateBirth(birth);
    }
    catch {
        fail("INVALID_INPUT", "Birth input is invalid; no definitive pair facts were produced.");
    }
    if (birth.source !== "user-entered" || birth.id !== personId || chartVersionId !== `${personId}:${birth.updatedAt}`)
        fail("INVALID_IDENTITY", "Participant and pinned native chart version do not match the birth revision.");
    const facts = record(row.facts) as HumanDesignFactsV1;
    if (facts.schema !== "HumanDesignFactsV1" || facts.birthId !== personId || facts.birthUpdatedAt !== birth.updatedAt)
        fail("INVALID_IDENTITY", "Natal facts belong to a different person or birth revision.");
    if (facts.timeWindowAnalysis !== undefined)
        fail("UNSUPPORTED_BIRTH_TIME", "A representative window chart cannot become a definitive pair input.");
    if (!Array.isArray(facts.activations) || facts.activations.length !== 26)
        fail("INVALID_ACTIVATION", "A natal snapshot requires exactly 13 planets on each of its two natal sides.");
    const expected = new Map(Object.entries(PLANETS).flatMap(([key, planet]) => ["personality", "design"].map(side => [`activation:${side}:${key}`, { side, planet }] as const)));
    const seen = new Set<string>();
    for (const raw of facts.activations) {
        check(options);
        const a = record(raw), spec = expected.get(a.id);
        if (!spec || seen.has(a.id) || a.side !== spec.side || a.planet !== spec.planet)
            fail("INVALID_ACTIVATION", "Activation identity, side or planet inventory is missing, duplicated or incompatible.");
        seen.add(a.id);
        if (!Number.isFinite(a.longitude) || a.longitude < 0 || a.longitude >= 360 || !Number.isInteger(a.gate) || !gates.has(a.gate) || !Number.isInteger(a.line) || a.line < 1 || a.line > 6 || typeof a.boundaryRisk !== "boolean")
            fail("INVALID_ACTIVATION", "Activation longitude, Gate, Line or boundary flag is invalid.");
        const mapped = mapLongitude(a.longitude);
        if (a.gate !== mapped.gate || a.line !== mapped.line || a.boundaryRisk !== mapped.boundaryRisk || a.center !== centerId(gates.get(a.gate)!.center))
            fail("INVALID_ACTIVATION", "Activation differs from the pinned wheel mapping or canonical Center membership.");
    }
    if (!Array.isArray(facts.gates) || facts.gates.length > 64 || new Set(facts.gates).size !== facts.gates.length || !Array.isArray(facts.channels) || facts.channels.length > 36 || !Array.isArray(facts.centers) || facts.centers.length !== 9 || !Array.isArray(facts.definitionIslands) || facts.definitionIslands.length > 4 || facts.definitionIslands.some(i => !Array.isArray(i)) || !Array.isArray(facts.hangingGates) || !Array.isArray(facts.uncertainty) || facts.uncertainty.length > 100 || facts.uncertainty.some(n => typeof n !== "string" || n.length > 2000))
        fail("INCONSISTENT_FACTS", "Natal aggregate structure or uncertainty inventory is malformed.");
    let normalized: HumanDesignFactsV1, calculated: HumanDesignFactsV1;
    try {
        const utc = resolveBirthUtc(birth);
        if (facts.personalityUtc !== utc || (birth.conversion && (birth.conversion.utc !== utc || birth.conversion.timezone !== birth.timezone || birth.conversion.runtime !== "Intl.DateTimeFormat" || birth.conversion.offsetMinutes !== (Date.parse(`${birth.date}T${birth.localTime}:00Z`) - Date.parse(utc)) / 60000)))
            fail("INCONSISTENT_FACTS", "Pinned UTC conversion differs from the declared birth input; the original is not rewritten.");
        normalized = normalizeFacts(facts);
        calculated = normalizeFacts(calculateChart(birth));
        if (!equal(facts.engine, calculated.engine))
            fail("INCOMPATIBLE_PIN", "Natal engine/astronomy/adapter/convention pins are incompatible.");
        if (!equal(normalized, calculated))
            fail("INCONSISTENT_FACTS", "Supplied natal facts differ from the application-calculated pinned snapshot; manual Channel/Center overrides are refused.");
    }
    catch (error) {
        if (error instanceof CompositeInputError)
            throw error;
        fail("INCONSISTENT_FACTS", "Natal snapshot cannot be independently rechecked against the current application calculation.");
    }
    check(options);
    // Display names/place labels do not determine mechanical identities.
    const { name: _name, place: _place, resolution, ...birthIdentity } = birth;
    if (resolution) {
        const { originalPlace: _originalPlace, resolvedPlace: _resolvedPlace, ...resolutionIdentity } = resolution;
        Object.assign(birthIdentity, { resolution: resolutionIdentity });
    }
    const birthInputHash = contentHash(birthIdentity), factsHash = contentHash(normalized);
    const eligibility = birth.confidence === "approximate" ? "provisional-point" : "exact-point";
    const snapshotHash = contentHash({ personId, chartVersionId, birthInputHash, factsHash, pins, eligibility });
    const snapshot: ParticipantSnapshotV1 = { schema: "ParticipantSnapshotV1", personId, chartVersionId, birth: clone(birth), facts: clone(normalized), birthInputHash, factsHash, snapshotHash, pins: clone(pins), eligibility, validation: { origin: "application-calculated", structure: "validated", mapping: "validated", calculation: "recomputed-current-pinned-engine", independentAstronomy: "not-established-by-structural-validation" } };
    freeze(snapshot);
    issuedSnapshots.add(snapshot);
    return snapshot;
}
export function validateParticipantSnapshot(input: unknown, options: Options = {}): ParticipantSnapshotV1 {
    check(options);
    const row = record(input);
    if (issuedSnapshots.has(row))
        return input as ParticipantSnapshotV1;
    if (row.schema !== "ParticipantSnapshotV1")
        fail("INVALID_INPUT", "Unsupported participant snapshot schema.");
    const rebuilt = createParticipantSnapshot({ origin: row.validation?.origin, personId: row.personId, chartVersionId: row.chartVersionId, birth: row.birth, facts: row.facts }, options);
    if (!equal(sorted(Object.keys(row)), sorted(Object.keys(rebuilt))))
        fail("INVALID_INPUT", "Participant snapshot has missing or unsupported fields.");
    for (const key of ["birthInputHash", "factsHash", "snapshotHash", "pins", "eligibility", "validation"] as const)
        if (!equal(row[key], rebuilt[key]))
            fail("STALE_INPUT", "Participant snapshot identity, validation or version pins do not match its immutable content.");
    return rebuilt;
}
export function snapshotFromPerson(person: Person, requestedVersionId?: string, options: Options = {}): ParticipantSnapshotV1 {
    const row = record(person);
    record(row.birth);
    const chartVersionId = identity(requestedVersionId !== undefined ? requestedVersionId : person.activeChartVersionId !== undefined ? person.activeChartVersionId : `${person.birth.id}:${person.birth.updatedAt}`);
    if (person.versions !== undefined) {
        if (!Array.isArray(person.versions) || person.versions.length === 0)
            fail("INVALID_IDENTITY", "Natal version history is empty or malformed.");
        const ids = person.versions.map(v => identity(record(v).id));
        if (new Set(ids).size !== ids.length)
            fail("INVALID_IDENTITY", "Natal version history contains duplicate version identities.");
    }
    const version = person.versions?.find(v => v.id === chartVersionId);
    if (person.versions && !version)
        fail("INVALID_IDENTITY", "Requested natal version is not in this person's pinned version history.");
    if (!person.versions && chartVersionId !== `${person.birth.id}:${person.birth.updatedAt}`)
        fail("INVALID_IDENTITY", "Requested natal version is unavailable.");
    return createParticipantSnapshot({ origin: "application-calculated", personId: person.birth.id, chartVersionId, birth: version?.birth || person.birth, facts: version?.facts || person.facts }, options);
}
export function relationshipIdentity(personA: string, personB: string) {
    const ids = sorted([identity(personA), identity(personB)]);
    if (ids[0] === ids[1])
        fail("INVALID_IDENTITY", "A two-person relationship requires distinct immutable person IDs.");
    return { pairKey: canonicalJson(ids), relationshipId: `relationship:${contentHash(ids)}` };
}
// Formal endpoint seam for independent truth-table tests. It is not a natal input adapter.
export function classifyChannelEndpoints(a: EndpointState, b: EndpointState): ChannelClassification | null {
    if (![a, b].every(n => Number.isInteger(n) && n >= 0 && n <= 3))
        fail("INVALID_INPUT", "Endpoint states must be the four declared presence states.");
    if ((a | b) !== 3)
        return null;
    if (a === 3 && b === 3)
        return "companionship";
    if (a === 3 || b === 3)
        return a === 0 || b === 0 ? "dominance" : "compromise";
    return "electromagnetic";
}
export function classifyChannelOwnership(a: EndpointState, b: EndpointState) {
    const classification = classifyChannelEndpoints(a, b);
    return { classification, roles: [role(a, classification), role(b, classification)] as [
            ChannelRole,
            ChannelRole
        ], fullOwnerIndexes: ([a, b].map((state, index) => state === 3 ? index : null).filter(n => n !== null)) as number[], combinedOnly: classification !== null && a !== 3 && b !== 3 };
}
type EndpointParticipant = {
    personId: string;
    gates: number[];
    chartVersionId?: string;
    snapshotHash?: string;
};
function activeGates(input: number[]): number[] {
    if (!Array.isArray(input) || input.length > 64 || input.some(g => !Number.isInteger(g) || !gates.has(g)))
        fail("INVALID_INPUT", "Structural endpoint fixtures require known integer Gates.");
    return sorted(unique(input));
}
function graph(inputs: EndpointParticipant[]): StructureGraphV1 {
    const ordered = [...inputs].sort((a, b) => a.personId < b.personId ? -1 : 1);
    const scope: StructureGraphV1["scope"] = { kind: inputs.length === 1 ? "participant" : "pair", personIds: ordered.map(p => p.personId), inputRefs: ordered.map(p => ({ personId: p.personId, chartVersionId: p.chartVersionId || null, snapshotHash: p.snapshotHash || null })) };
    const presence = sorted(unique(ordered.flatMap(p => p.gates))), structure = deriveStructure(presence);
    const edges = structure.channels.map(c => ({ channelId: c.id, gates: [...c.gates] as [
            number,
            number
        ], centers: [...c.centers] as [
            CenterId,
            CenterId
        ] })).sort((a, b) => a.channelId < b.channelId ? -1 : 1);
    const id = `graph:${contentHash({ scope, presence, catalogSHA256: pins.catalogSHA256 })}`;
    const components = structure.definitionIslands.map(i => sorted(i)).sort((a, b) => a.join(",") < b.join(",") ? -1 : 1).map(centerIds => ({ id: `component:${contentHash({ scope, centerIds })}`, centerIds }));
    return { schema: "StructureGraphV1", id, scope, gates: presence, definedCenters: sorted(structure.centers.filter(c => c.defined).map(c => c.id)), edges, components, componentCount: components.length, definition: structure.definition };
}
function route(g: StructureGraphV1, start: CenterId, end: CenterId, sufficientFor: PathWitnessV1["sufficientFor"], options: Options): PathWitnessV1 | null {
    if (!g.definedCenters.includes(start) || !g.definedCenters.includes(end))
        return null;
    const visited = new Set<CenterId>([start]), queue = [start], previous = new Map<CenterId, {
        from: CenterId;
        edge: StructureGraphV1["edges"][number];
    }>();
    while (queue.length) {
        check(options);
        const current = queue.shift()!;
        if (current === end)
            break;
        for (const edge of g.edges.filter(e => e.centers.includes(current))) {
            const next = edge.centers.find(c => c !== current)!;
            if (!visited.has(next)) {
                visited.add(next);
                previous.set(next, { from: current, edge });
                queue.push(next);
            }
        }
    }
    if (!visited.has(end))
        return null;
    const edges: PathWitnessV1["edges"] = [], path = [end];
    let current = end;
    while (current !== start) {
        const step = previous.get(current)!;
        edges.unshift({ channelId: step.edge.channelId, from: step.from, to: current, endpoints: step.edge.gates.map(gate => ({ gate, contributionIds: [] })) });
        current = step.from;
        path.unshift(current);
    }
    return { schema: "PathWitnessV1", id: `witness:${contentHash({ graphId: g.id, path, channelIds: edges.map(e => e.channelId), sufficientFor })}`, graphId: g.id, scope: g.scope, centers: path, edges, sufficientFor, completeness: "one-sufficient-route", necessity: "not-asserted" };
}
// Sparse synthetic endpoint graphs exercise math only; calculateComposite requires
// validated full ParticipantSnapshotV1 inputs, never these fixture records.
export function analyzePairEndpoints(a: EndpointParticipant, b: EndpointParticipant, options: Options = {}): PairTopologyV1 {
    check(options);
    relationshipIdentity(a.personId, b.personId);
    const inputs = [{ ...a, gates: activeGates(a.gates) }, { ...b, gates: activeGates(b.gates) }].sort((x, y) => x.personId < y.personId ? -1 : 1);
    const natalGraphs = inputs.map(p => graph([p])), combinedGraph = graph(inputs);
    const matrix = centers.map(centerId => ({ centerId, definedByIds: natalGraphs.filter(g => g.definedCenters.includes(centerId)).flatMap(g => g.scope.personIds), combinedDefined: combinedGraph.definedCenters.includes(centerId), combinedOnly: combinedGraph.definedCenters.includes(centerId) && !natalGraphs.some(g => g.definedCenters.includes(centerId)), activeGateHolderIds: inputs.filter(p => p.gates.some(n => centerId === centerIdForGate(n))).map(p => p.personId) }));
    const actualJoins: PairTopologyV1["actualJoins"] = [], islandEffects: PairTopologyV1["islandEffects"] = [];
    for (const natal of natalGraphs) {
        const personId = natal.scope.personIds[0];
        const mappings = natal.components.map(c => ({ natalIslandId: c.id, combinedComponentId: combinedGraph.components.find(n => n.centerIds.includes(c.centerIds[0]))!.id }));
        for (let i = 0; i < mappings.length; i++)
            for (let j = i + 1; j < mappings.length; j++)
                if (mappings[i].combinedComponentId === mappings[j].combinedComponentId) {
                    // Fixed representatives retain complete baseline segments as well as partner edges.
                    const start = natal.components[i].centerIds[natal.components[i].centerIds.length - 1], end = natal.components[j].centerIds[0];
                    const targetNatalIslandIds = [mappings[i].natalIslandId, mappings[j].natalIslandId];
                    const witness = route(combinedGraph, start, end, { kind: "natal-island-join", personId, targetNatalIslandIds }, options);
                    if (!witness)
                        fail("INCONSISTENT_FACTS", "A claimed island join lacks a complete path witness.");
                    actualJoins.push({ personId, targetNatalIslandIds, witness });
                }
        const groupCount = new Set(mappings.map(m => m.combinedComponentId)).size;
        const status = natal.componentCount < 2 ? "no-natal-split" : groupCount === natal.componentCount ? "no-join" : groupCount === 1 ? "all-joined" : "some-joined";
        islandEffects.push({ personId, natalIslandCount: natal.componentCount, status, mappings, additionalCombinedComponentIds: combinedGraph.components.filter(c => !c.centerIds.some(n => natal.definedCenters.includes(n))).map(c => c.id) });
    }
    const motorRoutes: PairTopologyV1["motorRoutes"] = [];
    for (const g of [...natalGraphs, combinedGraph])
        for (const motor of ["Ego", "SolarPlexus", "Sacral", "Root"] as CenterId[]) {
            const witness = route(g, motor, "Throat", { kind: "motor-to-throat", motor }, options);
            motorRoutes.push({ graphId: g.id, motor, connected: !!witness, witness });
        }
    return { natalGraphs, combinedGraph, centers: matrix, deltas: { combinedOnlyChannelIds: combinedGraph.edges.filter(e => !natalGraphs.some(g => g.edges.some(n => n.channelId === e.channelId))).map(e => e.channelId), combinedOnlyCenterIds: matrix.filter(c => c.combinedOnly).map(c => c.centerId), perPerson: natalGraphs.map(g => ({ personId: g.scope.personIds[0], addedChannelIds: combinedGraph.edges.filter(e => !g.edges.some(n => n.channelId === e.channelId)).map(e => e.channelId), addedCenterIds: combinedGraph.definedCenters.filter(c => !g.definedCenters.includes(c)) })) }, islandEffects, actualJoins, motorRoutes };
}
const centerIdForGate = (n: number) => centerId(gates.get(n)!.center);
function endpointState(p: ParticipantSnapshotV1, c: typeof channels[number]): EndpointState { return ((p.facts.gates.includes(c.gates[0]) ? 1 : 0) | (p.facts.gates.includes(c.gates[1]) ? 2 : 0)) as EndpointState; }
function role(state: EndpointState, classification: ChannelClassification | null): ChannelRole { return state === 3 ? "full-holder" : state === 0 ? "non-contributor" : classification === "electromagnetic" ? "joint-contributor" : "partial-holder"; }
export function calculateComposite(inputA: ParticipantSnapshotV1, inputB: ParticipantSnapshotV1, options: Options & {
    computedAt?: string;
    expectedInputs?: {
        personId: string;
        chartVersionId: string;
        snapshotHash: string;
    }[];
} = {}): CompositeCalculationV1 {
    check(options);
    const a = validateParticipantSnapshot(inputA, options), b = validateParticipantSnapshot(inputB, options), rel = relationshipIdentity(a.personId, b.personId);
    const inputs = [a, b].sort((x, y) => x.personId < y.personId ? -1 : 1);
    const refs = inputs.map(p => ({ personId: p.personId, chartVersionId: p.chartVersionId, snapshotHash: p.snapshotHash }));
    if (options.expectedInputs && !equal([...options.expectedInputs].sort((x, y) => x.personId < y.personId ? -1 : 1), refs))
        fail("STALE_INPUT", "The selected participant revisions changed; old input results are withheld.");
    const computedAt = options.computedAt || new Date().toISOString();
    if (!Number.isFinite(Date.parse(computedAt)))
        fail("INVALID_INPUT", "Calculation timestamp is invalid.");
    const calculationId = `calculation:${contentHash({ pins, refs })}`;
    const contributions: CompositeContributionV1[] = inputs.flatMap(p => p.facts.activations.map(act => ({ id: `contribution:${contentHash([p.personId, p.chartVersionId, act.id])}`, personId: p.personId, chartVersionId: p.chartVersionId, snapshotHash: p.snapshotHash, activationId: act.id, side: act.side, planetKey: act.id.split(":")[2], planet: act.planet, longitude: act.longitude, gate: act.gate, line: act.line, center: act.center, boundaryRisk: act.boundaryRisk, uncertaintyRef: { eligibility: p.eligibility, birthInputHash: p.birthInputHash } })));
    const channelRelations: ChannelRelationV1[] = channels.map(c => {
        const states = inputs.map(p => ({ personId: p.personId, state: endpointState(p, c) })), ownership = classifyChannelOwnership(states[0].state, states[1].state), classification = ownership.classification;
        return { channelId: c.id, gates: [...c.gates] as [
                number,
                number
            ], centers: c.centers.map(centerId) as [
                CenterId,
                CenterId
            ], circuit: c.circuit, formed: classification !== null, classification, endpointStates: states.map((s, index) => ({ ...s, role: ownership.roles[index] })), fullOwnerIds: ownership.fullOwnerIndexes.map(i => states[i].personId), combinedOnly: ownership.combinedOnly, endpoints: c.gates.map(gate => ({ gate, contributionIds: contributions.filter(n => n.gate === gate).map(n => n.id), personIds: sorted(unique(contributions.filter(n => n.gate === gate).map(n => n.personId))) })) };
    });
    const topology = analyzePairEndpoints({ ...a, gates: a.facts.gates }, { ...b, gates: b.facts.gates }, options);
    for (const witness of [...topology.actualJoins.map(j => j.witness), ...topology.motorRoutes.flatMap(m => m.witness ? [m.witness] : [])])
        for (const edge of witness.edges)
            for (const end of edge.endpoints) {
                end.contributionIds = contributions.filter(c => c.gate === end.gate && witness.scope.personIds.includes(c.personId)).map(c => c.id);
                if (!end.contributionIds.length)
                    fail("INCONSISTENT_FACTS", "Witness endpoint has no actual contributing activation.");
            }
    const eligibility = inputs.some(p => p.eligibility === "provisional-point") ? "provisional-point" : "exact-point";
    const mechanicsFacts: MechanicsFactV1[] = [], contributionFacts = new Map<string, string>(), channelFacts = new Map<string, string>(), natalChannelFacts = new Map<string, string>(), componentFacts = new Map<string, string>();
    function fact(predicate: MechanicsFactV1["predicate"], key: unknown, value: unknown, subjects: string[], supports: string[], dependencies: string[], sourceRecords: string[]) {
        const id = `fact:${contentHash([calculationId, predicate, key])}`;
        const item: MechanicsFactV1 = { schema: "MechanicsFactV1", id, calculationId, predicate, subjectPersonIds: sorted(unique(subjects)), value, supportingContributionIds: sorted(unique(supports)), dependencyFactIds: sorted(unique(dependencies)), sourceRecordIds: sorted(unique(sourceRecords)), inputRefs: refs, status: eligibility, ruleVersion: pins.algorithm, nonclaims: [...nonclaims] };
        for (const source of item.sourceRecordIds)
            if (!byId.has(source))
                fail("INCONSISTENT_FACTS", "Mechanical trace refers to a missing canonical identity.");
        mechanicsFacts.push(item);
        return id;
    }
    for (const c of contributions)
        contributionFacts.set(c.id, fact("activation-contribution", c.id, c, [c.personId], [c.id], [], [`gate-${String(c.gate).padStart(2, "0")}-line-${c.line}`]));
    for (const c of channelRelations) {
        const supports = c.endpoints.flatMap(e => e.contributionIds);
        channelFacts.set(c.channelId, fact("channel-relation", c.channelId, c, inputs.map(p => p.personId), supports, supports.map(id => contributionFacts.get(id)!), [c.channelId]));
    }
    for (const g of topology.natalGraphs)
        for (const edge of g.edges) {
            const supports = contributions.filter(c => g.scope.personIds.includes(c.personId) && edge.gates.includes(c.gate)).map(c => c.id);
            natalChannelFacts.set(canonicalJson([g.id, edge.channelId]), fact("completed-natal-channel", [g.id, edge.channelId], { graphId: g.id, ...edge, fullOwnerIds: g.scope.personIds }, g.scope.personIds, supports, supports.map(id => contributionFacts.get(id)!), [edge.channelId]));
        }
    const channelDependency = (g: StructureGraphV1, channelId: string) => g.scope.kind === "participant" ? natalChannelFacts.get(canonicalJson([g.id, channelId]))! : channelFacts.get(channelId)!;
    for (const c of topology.centers) {
        const edges = topology.combinedGraph.edges.filter(e => e.centers.includes(c.centerId));
        const supports = unique(edges.flatMap(e => channelRelations.find(n => n.channelId === e.channelId)!.endpoints.flatMap(n => n.contributionIds)));
        fact("center-definition", c.centerId, c, inputs.map(p => p.personId), supports, edges.map(e => channelFacts.get(e.channelId)!), unique(edges.flatMap(e => e.gates.map(g => `gate-${String(g).padStart(2, "0")}`))));
    }
    for (const g of [...topology.natalGraphs, topology.combinedGraph])
        for (const comp of g.components) {
            const edges = g.edges.filter(e => e.centers.every(n => comp.centerIds.includes(n)));
            const supports = contributions.filter(c => g.scope.personIds.includes(c.personId) && edges.some(e => e.gates.includes(c.gate))).map(c => c.id);
            componentFacts.set(comp.id, fact("definition-component", comp.id, { graphId: g.id, ...comp }, g.scope.personIds, supports, edges.map(e => channelDependency(g, e.channelId)), edges.map(e => e.channelId)));
        }
    const joinFacts = new Map<string, string[]>();
    for (const join of topology.actualJoins) {
        const supports = join.witness.edges.flatMap(e => e.endpoints.flatMap(n => n.contributionIds));
        const id = fact("actual-island-join", [join.personId, join.targetNatalIslandIds], join, [join.personId], supports, [...join.targetNatalIslandIds.map(id => componentFacts.get(id)!), ...join.witness.edges.map(e => channelFacts.get(e.channelId)!)], join.witness.edges.map(e => e.channelId));
        joinFacts.set(join.personId, [...(joinFacts.get(join.personId) || []), id]);
    }
    for (const m of topology.motorRoutes) {
        const g = [...topology.natalGraphs, topology.combinedGraph].find(n => n.id === m.graphId)!;
        const supports = m.witness?.edges.flatMap(e => e.endpoints.flatMap(n => n.contributionIds)) || [];
        fact("motor-to-throat", [m.graphId, m.motor], m, g.scope.personIds, supports, m.witness?.edges.map(e => channelDependency(g, e.channelId)) || [], m.witness?.edges.map(e => e.channelId) || []);
    }
    for (const effect of topology.islandEffects)
        fact("island-effect", effect.personId, effect, [effect.personId], [], [...(joinFacts.get(effect.personId) || []), ...effect.mappings.flatMap(m => [componentFacts.get(m.natalIslandId)!, componentFacts.get(m.combinedComponentId)!])], []);
    const facts: CompositeFactsV1 = { schema: "CompositeFactsV1", participantIds: inputs.map(p => p.personId), contributions, channelRelations, topology, eligibility, uncertainty: inputs.map(p => ({ personId: p.personId, chartVersionId: p.chartVersionId, eligibility: p.eligibility, boundaryActivationIds: p.facts.activations.filter(n => n.boundaryRisk).map(n => n.id), notes: [...p.facts.uncertainty] })), sourceContext: { ...pins, claimScope: "deterministic-structure-only", interpretation: "not-implemented", rights: "existing-rights-and-authenticity-gates-remain-open" }, mechanicsFacts };
    check(options);
    const result: CompositeCalculationV1 = { schema: "CompositeCalculationV1", calculationId, ...rel, displayParticipantIds: [a.personId, b.personId], computedAt, pins: clone(pins), inputs, facts, factsHash: contentHash(facts), status: eligibility === "exact-point" ? "complete-exact-point" : "complete-provisional-point" };
    freeze(result);
    issuedCalculations.add(result);
    return result;
}
export function contributionGroups(facts: CompositeFactsV1, kind: "repeated-gate" | "repeated-gate-line" | "same-planet-across-sides" | "shared-gate" | "shared-gate-line") {
    if (!["repeated-gate", "repeated-gate-line", "same-planet-across-sides", "shared-gate", "shared-gate-line"].includes(kind))
        fail("INVALID_INPUT", "Unknown exact contribution grouping.");
    const groups = new Map<string, CompositeContributionV1[]>();
    for (const c of facts.contributions) {
        const key = canonicalJson(kind === "repeated-gate" ? [c.personId, c.gate] : kind === "repeated-gate-line" ? [c.personId, c.gate, c.line] : kind === "same-planet-across-sides" ? [c.personId, c.planetKey] : kind === "shared-gate" ? [c.gate] : [c.gate, c.line]);
        groups.set(key, [...(groups.get(key) || []), c]);
    }
    return [...groups].filter(([, records]) => records.length > 1 && (!kind.startsWith("shared-") || new Set(records.map(c => c.personId)).size === 2)).sort(([a], [b]) => a < b ? -1 : 1).map(([key, records]) => ({ kind, key, contributionIds: records.map(c => c.id), personIds: sorted(unique(records.map(c => c.personId))), boundary: "Multiplicity is not stronger definition, probability or relationship intensity." }));
}
export function mechanicsTraceFor(calculation: CompositeCalculationV1, factId: string, scope: {
    calculationId?: string;
    personId?: string;
} = {}) {
    if (!issuedCalculations.has(calculation))
        fail("INVALID_TRACE", "Unvalidated calculation cannot supply a Mechanics Trace; rebuild it from validated natal snapshots.");
    if (scope.calculationId !== undefined && scope.calculationId !== calculation.calculationId)
        fail("INVALID_TRACE", "Mechanics Trace belongs to another calculation revision.");
    const facts = new Map(calculation.facts.mechanicsFacts.map(f => [f.id, f])), selected = facts.get(factId);
    if (!selected || (scope.personId !== undefined && !selected.subjectPersonIds.includes(scope.personId)))
        fail("INVALID_TRACE", "Requested fact or participant scope does not belong to this trace.");
    const closure = new Map<string, MechanicsFactV1>();
    const visit = (id: string) => {
        if (closure.has(id))
            return;
        const f = facts.get(id);
        if (!f)
            fail("INVALID_TRACE", "Mechanics dependency is missing.");
        closure.set(id, f);
        f.dependencyFactIds.forEach(visit);
    };
    visit(factId);
    const dependencies = [...closure.values()].filter(f => f.id !== factId), supportIds = new Set([...closure.values()].flatMap(f => f.supportingContributionIds));
    return freeze({ fact: selected, dependencies, contributions: calculation.facts.contributions.filter(c => supportIds.has(c.id)), inputRefs: selected.inputRefs, sourceRecordIds: sorted(unique([...closure.values()].flatMap(f => f.sourceRecordIds))), sourceContext: calculation.facts.sourceContext, perspectivePersonId: scope.personId || null });
}
