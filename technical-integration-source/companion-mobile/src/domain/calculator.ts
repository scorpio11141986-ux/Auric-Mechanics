import { runtime, gates, centerId } from "../content/records";
import { resolveBirthUtc } from "./birth";
import {
  CENTER_NAMES,
  type CenterId,
  type Activation,
  type BirthRecordV1,
  type HumanDesignFactsV1,
} from "./contracts";
import { designDate, longitude, mapLongitude } from "./astronomy";
export const PLANETS: Record<string, string> = {
  sun: "Sun",
  earth: "Earth",
  moon: "Moon",
  northNode: "North Node",
  southNode: "South Node",
  mercury: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
  uranus: "Uranus",
  neptune: "Neptune",
  pluto: "Pluto",
};

// Port of the legacy topology rules, now driven by pinned canonical endpoints.
export function deriveStructure(activeGates: number[]) {
  const set = new Set(activeGates);
  if ([...set].some((n) => !gates.has(n)))
    throw Error("Unknown gate in calculation output");
  const channels = runtime.channels
    .filter((c) => c.gates.every((g) => set.has(g)))
    .map((c) => ({
      id: c.id,
      gates: c.gates,
      centers: c.centers.map(centerId),
      circuit: c.circuit,
    }));
  const defined = new Set(channels.flatMap((c) => c.centers));
  const islands: CenterId[][] = [];
  const visited = new Set<CenterId>();
  for (const center of defined) {
    if (visited.has(center)) continue;
    const island: CenterId[] = [],
      queue = [center];
    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      island.push(current);
      for (const c of channels)
        if (c.centers.includes(current))
          queue.push(...c.centers.filter((n) => !visited.has(n)));
    }
    islands.push(island.sort());
  }
  const connected = (a: CenterId, b: CenterId) =>
    islands.some((i) => i.includes(a) && i.includes(b));
  const motorToThroat = (
    ["Ego", "SolarPlexus", "Sacral", "Root"] as CenterId[]
  ).some((m) => connected(m, "Throat"));
  const type = !defined.size
    ? "Reflector"
    : defined.has("Sacral")
      ? motorToThroat
        ? "Manifesting Generator"
        : "Generator"
      : motorToThroat
        ? "Manifestor"
        : "Projector";
  const authority =
    type === "Reflector"
      ? "Lunar"
      : defined.has("SolarPlexus")
        ? "Emotional"
        : defined.has("Sacral")
          ? "Sacral"
          : defined.has("Spleen")
            ? "Splenic"
            : connected("Ego", "Throat")
              ? "Ego Manifested"
              : connected("Ego", "G")
                ? "Ego Projected"
                : connected("G", "Throat")
                  ? "Self-Projected"
                  : "Environmental / Mental Projected";
  const strategy: Record<string, string> = {
    Reflector: "Wait a lunar cycle",
    Generator: "Respond",
    "Manifesting Generator": "Respond, then inform",
    Manifestor: "Inform",
    Projector: "Wait for invitation",
  };
  const definition = [
    "No Definition",
    "Single Definition",
    "Split Definition",
    "Triple Split Definition",
    "Quadruple Split Definition",
  ][islands.length];
  if (!definition) throw Error("Invalid definition topology");
  return {
    channels,
    definitionIslands: islands,
    type,
    authority,
    strategy: strategy[type],
    definition,
    centers: (Object.keys(CENTER_NAMES) as CenterId[]).map((id) => ({
      id,
      defined: defined.has(id),
    })),
    hangingGates: [...set]
      .filter((g) => !channels.some((c) => c.gates.includes(g)))
      .sort((a, b) => a - b),
  };
}

export function calculateChart(birth: BirthRecordV1): HumanDesignFactsV1 {
  const utc = resolveBirthUtc(birth);
  return calculateChartAtUtc(birth, utc);
}

// Interval analysis supplies validated UTC candidates, without guessing a wall time.
export function calculateChartAtUtc(birth: BirthRecordV1, utc: string): HumanDesignFactsV1 {
  const personality = new Date(utc),
    design = designDate(personality);
  const activations: Activation[] = [];
  for (const side of ["personality", "design"] as const) {
    for (const [key, planet] of Object.entries(PLANETS)) {
      const value = longitude(
        planet,
        side === "personality" ? personality : design,
      );
      const a = mapLongitude(value);
      activations.push({
        id: `activation:${side}:${key}`,
        side,
        planet,
        longitude: value,
        gate: a.gate,
        line: a.line,
        center: centerId(gates.get(a.gate)!.center),
        boundaryRisk: a.boundaryRisk,
      });
    }
  }
  const allGates = [...new Set(activations.map((a) => a.gate))].sort(
    (a, b) => a - b,
  );
  const structure = deriveStructure(allGates);
  const find = (side: Activation["side"], planet: string) =>
    activations.find((a) => a.side === side && a.planet === planet)!;
  const designUtc = design.toISOString();
  return {
    schema: "HumanDesignFactsV1",
    birthId: birth.id,
    birthUpdatedAt: birth.updatedAt,
    personalityUtc: utc,
    designUtc,
    ...structure,
    profile: `${find("personality", "Sun").line}/${find("design", "Sun").line}`,
    gates: allGates,
    activations,
    incarnationCross: {
      gates: [
        find("personality", "Sun").gate,
        find("personality", "Earth").gate,
        find("design", "Sun").gate,
        find("design", "Earth").gate,
      ],
      namingStatus: "geometry-only",
    },
    uncertainty: [
      ...(birth.confidence === "approximate"
        ? [
            "Approximate birth time: this is a provisional single-time chart, not an interval-stable result.",
          ]
        : []),
      ...activations
        .filter((a) => a.boundaryRisk)
        .map(
          (a) =>
            `${a.side} ${a.planet} ${a.gate}.${a.line} is within one arcminute of a Line boundary; affected chart structure may change.`,
        ),
      "Core Gate/Line model only. Color, Tone, Base and Variable interpretations are not supplied.",
      "Android/Hermes device validation is pending; Node/browser results alone do not establish native compatibility.",
    ],
    engine: {
      name: "Infinity Rae Core",
      version: "1.0.0",
      astronomy: "2.1.19",
      adapter: "1.0.0",
      node: "true-osculating",
      zodiac: "tropical",
      designArc: 88,
    },
  };
}
