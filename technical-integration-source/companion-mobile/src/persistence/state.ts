import { calculateChart } from "../domain/calculator";
import {
  DEFAULT_PROFILE,
  type AppStateV1,
  type Person,
  type BirthRecordV1,
  type HumanDesignFactsV1,
} from "../domain/contracts";
import { validateProfile } from "../intelligence/context";
import { prepareBirthRecord } from "../domain/birth";
import { restoreWindowFacts } from "../domain/birth-time-analysis";

export const emptyState = (): AppStateV1 => ({
  schema: "AppStateV1",
  people: [],
  activeId: null,
  profile: { ...DEFAULT_PROFILE },
});
export function replacePerson<S extends Omit<AppStateV1, "schema"> & { schema: string }>(
  state: S,
  birth: BirthRecordV1,
  windowFacts?: HumanDesignFactsV1,
): S {
  let facts: HumanDesignFactsV1;
  if (birth.confidence === "range") {
    if (!windowFacts) throw Error("Calculate the birth-time window before saving.");
    birth = { ...birth, conversion: undefined };
    facts = restoreWindowFacts(birth, windowFacts);
  } else {
    if (windowFacts) throw Error("Window results cannot be attached to a single-time birth record.");
    birth = prepareBirthRecord({ ...birth, timeWindow: undefined });
    facts = calculateChart(birth);
  }
  const old = state.people.find((p) => p.birth.id === birth.id);
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const versionId = `${birth.id}:${birth.updatedAt}`;
  const priorVersions = old?.versions || (old ? [{ id: `${old.birth.id}:${old.birth.updatedAt}`, birth: copy(old.birth), facts: copy(old.facts) }] : []);
  if (priorVersions.some((v) => v.id === versionId)) throw Error("Birth record revision already exists; retry with a new revision timestamp");
  const person: Person = {
    birth,
    facts,
    observations: old?.observations || [],
    history: old?.history || [],
    activeChartVersionId: versionId,
    versions: [...priorVersions, { id: versionId, birth: copy(birth), facts: copy(facts) }],
  };
  return {
    ...state,
    activeId: birth.id,
    people: [...state.people.filter((p) => p.birth.id !== birth.id), person],
  } as S;
}
export function restoreState(serialized: string | null): AppStateV1 {
  if (!serialized) return emptyState();
  const s = JSON.parse(serialized) as AppStateV1;
  if (
    !s ||
    s.schema !== "AppStateV1" ||
    !Array.isArray(s.people) ||
    s.people.length > 30
  )
    throw Error(
      "Saved data format is not supported. Existing storage was left untouched.",
    );
  validateProfile(s.profile);
  const ids = new Set<string>();
  const people = s.people.map((p) => {
    if (
      !p ||
      !p.birth ||
      ids.has(p.birth.id) ||
      !Array.isArray(p.history) ||
      p.history.length > 100 ||
      !Array.isArray(p.observations) ||
      p.observations.length > 20
    )
      throw Error(
        "Saved people are invalid. Existing storage was left untouched.",
      );
    ids.add(p.birth.id);
    for (const o of p.observations)
      if (
        !o ||
        o.kind !== "USER_SUPPLIED" ||
        typeof o.text !== "string" ||
        o.text.length > 600
      )
        throw Error("Invalid saved observation");
    for (const h of p.history)
      if (
        !h ||
        !h.context ||
        h.context.schema !== "AIContextV1" ||
        h.context.subject.id !== p.birth.id ||
        typeof h.context.question !== "string" ||
        !Array.isArray(h.context.evidence) ||
        !Array.isArray(h.context.facts) ||
        !Array.isArray(h.context.uncertainty) ||
        !h.context.dataset ||
        !h.context.engine
      )
        throw Error("Invalid saved history");
    if (p.versions && (!Array.isArray(p.versions) || !p.versions.length || new Set(p.versions.map((v) => v.id)).size !== p.versions.length ||
      p.versions.some((v) => !v.birth || !v.facts || v.birth.id !== p.birth.id || v.facts.birthId !== p.birth.id) ||
      !p.versions.some((v) => v.id === p.activeChartVersionId && v.birth.updatedAt === p.birth.updatedAt)))
      throw Error("Invalid saved chart versions. Existing storage was left untouched.");
    return { ...p, facts: p.birth.confidence === "range" ? restoreWindowFacts(p.birth, p.facts) : calculateChart(p.birth) };
  });
  if (s.activeId !== null && !ids.has(s.activeId))
    throw Error("Saved active person is missing");
  return { ...s, people };
}

export function removePerson<S extends Omit<AppStateV1, "schema"> & { schema: string }>(state: S, id: string): S {
  const people = state.people.filter((p) => p.birth.id !== id);
  return { ...state, people, activeId: state.activeId === id ? people[0]?.birth.id || null : state.activeId } as S;
}
