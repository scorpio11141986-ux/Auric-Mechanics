import type { Activation, BirthRecordV1, CenterId, HumanDesignFactsV1 } from "./contracts";
export type CompositePinsV1 = {
    algorithm: "CM01a-1.0.0";
    schema: "CompositeCalculationV1";
    catalogVersion: string;
    catalogSHA256: string;
    canonicalSHA256: string;
    sourceAuthentication: string;
};
export type ParticipantSnapshotV1 = {
    schema: "ParticipantSnapshotV1";
    personId: string;
    chartVersionId: string;
    birth: BirthRecordV1;
    facts: HumanDesignFactsV1;
    birthInputHash: string;
    factsHash: string;
    snapshotHash: string;
    pins: CompositePinsV1;
    eligibility: "exact-point" | "provisional-point";
    validation: {
        origin: "application-calculated";
        structure: "validated";
        mapping: "validated";
        calculation: "recomputed-current-pinned-engine";
        independentAstronomy: "not-established-by-structural-validation";
    };
};
export type CompositeContributionV1 = {
    id: string;
    personId: string;
    chartVersionId: string;
    snapshotHash: string;
    activationId: string;
    side: Activation["side"];
    planetKey: string;
    planet: string;
    longitude: number;
    gate: number;
    line: number;
    center: CenterId;
    boundaryRisk: boolean;
    uncertaintyRef: {
        eligibility: ParticipantSnapshotV1["eligibility"];
        birthInputHash: string;
    };
};
export type EndpointState = 0 | 1 | 2 | 3;
export type ChannelClassification = "electromagnetic" | "companionship" | "dominance" | "compromise";
export type ChannelRole = "full-holder" | "partial-holder" | "joint-contributor" | "non-contributor";
export type ChannelRelationV1 = {
    channelId: string;
    gates: [
        number,
        number
    ];
    centers: [
        CenterId,
        CenterId
    ];
    circuit: string;
    formed: boolean;
    classification: ChannelClassification | null;
    endpointStates: {
        personId: string;
        state: EndpointState;
        role: ChannelRole;
    }[];
    fullOwnerIds: string[];
    combinedOnly: boolean;
    endpoints: {
        gate: number;
        contributionIds: string[];
        personIds: string[];
    }[];
};
export type StructureGraphV1 = {
    schema: "StructureGraphV1";
    id: string;
    scope: {
        kind: "participant" | "pair";
        personIds: string[];
        inputRefs: {
            personId: string;
            chartVersionId: string | null;
            snapshotHash: string | null;
        }[];
    };
    gates: number[];
    definedCenters: CenterId[];
    edges: {
        channelId: string;
        gates: [
            number,
            number
        ];
        centers: [
            CenterId,
            CenterId
        ];
    }[];
    components: {
        id: string;
        centerIds: CenterId[];
    }[];
    componentCount: number;
    definition: string;
};
export type PathWitnessV1 = {
    schema: "PathWitnessV1";
    id: string;
    graphId: string;
    scope: StructureGraphV1["scope"];
    centers: CenterId[];
    edges: {
        channelId: string;
        from: CenterId;
        to: CenterId;
        endpoints: {
            gate: number;
            contributionIds: string[];
        }[];
    }[];
    sufficientFor: {
        kind: "natal-island-join" | "motor-to-throat";
        personId?: string;
        targetNatalIslandIds?: string[];
        motor?: CenterId;
    };
    completeness: "one-sufficient-route";
    necessity: "not-asserted";
};
export type PairTopologyV1 = {
    natalGraphs: StructureGraphV1[];
    combinedGraph: StructureGraphV1;
    centers: {
        centerId: CenterId;
        definedByIds: string[];
        combinedDefined: boolean;
        combinedOnly: boolean;
        activeGateHolderIds: string[];
    }[];
    deltas: {
        combinedOnlyChannelIds: string[];
        combinedOnlyCenterIds: CenterId[];
        perPerson: {
            personId: string;
            addedChannelIds: string[];
            addedCenterIds: CenterId[];
        }[];
    };
    islandEffects: {
        personId: string;
        natalIslandCount: number;
        status: "no-natal-split" | "no-join" | "some-joined" | "all-joined";
        mappings: {
            natalIslandId: string;
            combinedComponentId: string;
        }[];
        additionalCombinedComponentIds: string[];
    }[];
    actualJoins: {
        personId: string;
        targetNatalIslandIds: string[];
        witness: PathWitnessV1;
    }[];
    motorRoutes: {
        graphId: string;
        motor: CenterId;
        connected: boolean;
        witness: PathWitnessV1 | null;
    }[];
};
export type MechanicsFactV1 = {
    schema: "MechanicsFactV1";
    id: string;
    calculationId: string;
    predicate: "activation-contribution" | "completed-natal-channel" | "channel-relation" | "center-definition" | "definition-component" | "actual-island-join" | "motor-to-throat" | "island-effect";
    subjectPersonIds: string[];
    value: unknown;
    supportingContributionIds: string[];
    dependencyFactIds: string[];
    sourceRecordIds: string[];
    inputRefs: {
        personId: string;
        chartVersionId: string;
        snapshotHash: string;
    }[];
    status: "exact-point" | "provisional-point";
    ruleVersion: "CM01a-1.0.0";
    nonclaims: string[];
};
export type CompositeFactsV1 = {
    schema: "CompositeFactsV1";
    participantIds: string[];
    contributions: CompositeContributionV1[];
    channelRelations: ChannelRelationV1[];
    topology: PairTopologyV1;
    eligibility: "exact-point" | "provisional-point";
    uncertainty: {
        personId: string;
        chartVersionId: string;
        eligibility: ParticipantSnapshotV1["eligibility"];
        boundaryActivationIds: string[];
        notes: string[];
    }[];
    sourceContext: CompositePinsV1 & {
        claimScope: "deterministic-structure-only";
        interpretation: "not-implemented";
        rights: "existing-rights-and-authenticity-gates-remain-open";
    };
    mechanicsFacts: MechanicsFactV1[];
};
export type CompositeCalculationV1 = {
    schema: "CompositeCalculationV1";
    calculationId: string;
    relationshipId: string;
    pairKey: string;
    displayParticipantIds: [
        string,
        string
    ];
    computedAt: string;
    pins: CompositePinsV1;
    inputs: ParticipantSnapshotV1[];
    facts: CompositeFactsV1;
    factsHash: string;
    status: "complete-exact-point" | "complete-provisional-point";
};
