import { birthUtcCandidates, validateBirth } from "./birth";
import { calculateChartAtUtc } from "./calculator";
import type { BirthRecordV1, BirthTimeAnalysisV1, HumanDesignFactsV1 } from "./contracts";

export function windowUtcSamples(birth: BirthRecordV1) {
  validateBirth(birth);
  if (birth.confidence !== "range" || !birth.timeWindow)
    throw Error("Enter an earliest and latest possible birth time.");
  const { earliestLocal, latestLocal } = birth.timeWindow;
  const parse = (local: string) => {
    if (typeof local !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
      throw Error("Enter both window dates and times (YYYY-MM-DD and HH:MM).");
    validateBirth({ ...birth, confidence: "exact", date: local.slice(0, 10), localTime: local.slice(11) });
    return Date.parse(`${local}:00Z`);
  };
  const first = parse(earliestLocal), last = parse(latestLocal);
  if (last <= first || last - first > 24 * 60 * 60000)
    throw Error("The latest time must be after the earliest, within a window of up to 24 hours.");
  if (birth.date < earliestLocal.slice(0, 10) || birth.date > latestLocal.slice(0, 10))
    throw Error("The birth date must fall within the entered time window.");
  const instants = new Set<number>();
  let skippedLocalMinutes = 0, repeatedLocalMinutes = 0;
  for (let wall = first; wall <= last; wall += 60000) {
    const local = new Date(wall).toISOString();
    const matches = birthUtcCandidates({ ...birth, confidence: "exact", date: local.slice(0, 10), localTime: local.slice(11, 16) });
    if (!matches.length) skippedLocalMinutes++;
    if (matches.length > 1) repeatedLocalMinutes++;
    for (const instant of matches) instants.add(instant);
  }
  if (!instants.size) throw Error("No possible times in this window exist in the selected timezone (clock-change gap). Adjust the window.");
  return { instants: [...instants].sort((a, b) => a - b), skippedLocalMinutes, repeatedLocalMinutes };
}

function summarize(birth: BirthRecordV1, samples: ReturnType<typeof windowUtcSamples>, charts: HumanDesignFactsV1[]) {
  const middle = charts[Math.floor(charts.length / 2)];
  const unique = (values: string[]) => [...new Set(values)];
  const membership = <T extends string | number>(sets: T[][]) => {
    const all = [...new Set(sets.flat())];
    return { stable: all.filter((value) => sets.every((set) => set.includes(value))), variable: all.filter((value) => !sets.every((set) => set.includes(value))) };
  };
  const report: BirthTimeAnalysisV1 = {
    schema: "BirthTimeAnalysisV1", algorithm: "minute-sweep-v1",
    window: { ...birth.timeWindow! }, timezone: birth.timezone,
    sampleCount: charts.length, skippedLocalMinutes: samples.skippedLocalMinutes,
    repeatedLocalMinutes: samples.repeatedLocalMinutes, representativeUtc: middle.personalityUtc,
    summaries: [
      ...(["type", "strategy", "authority", "profile", "definition"] as const).map((key) => ({ label: key, values: unique(charts.map((chart) => chart[key])) })),
      { label: "incarnation cross gates", values: unique(charts.map((chart) => chart.incarnationCross.gates.join(" / "))) },
    ],
    activations: middle.activations.map((activation) => ({
      id: activation.id, side: activation.side, planet: activation.planet,
      values: unique(charts.map((chart) => {
        const value = chart.activations.find((a) => a.id === activation.id)!;
        return `${value.gate}.${value.line}`;
      })),
    })),
    gates: membership(charts.map((chart) => chart.gates)),
    channels: membership(charts.map((chart) => chart.channels.map((channel) => channel.id))),
    centers: middle.centers.map((center) => ({ id: center.id, values: unique(charts.map((chart) => chart.centers.find((c) => c.id === center.id)!.defined ? "defined" : "undefined")) })),
  };
  return withAnalysis(middle, report);
}

function withAnalysis(facts: HumanDesignFactsV1, report: BirthTimeAnalysisV1): HumanDesignFactsV1 {
  return { ...facts, timeWindowAnalysis: report, uncertainty: [
    `Birth-time window: ${report.window.earliestLocal} to ${report.window.latestLocal} (${report.timezone}).`,
    `The BodyGraph is one illustrative sample, not a certain natal chart. ${report.sampleCount} possible UTC instants were evaluated on a one-minute local-time grid, including both clock-fold occurrences.`,
    "Unchanged means unchanged at sampled minutes, not proof of continuous stability, an exact birth time, or a confidence probability. Sub-minute transitions can be missed.",
    ...facts.uncertainty,
  ] };
}

export async function analyzeBirthTimeWindow(
  birth: BirthRecordV1,
  options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
) {
  const samples = windowUtcSamples(birth), charts: HumanDesignFactsV1[] = [];
  for (const instant of samples.instants) {
    if (options.signal?.aborted) throw Error("Birth-time analysis cancelled. No chart was saved.");
    charts.push(calculateChartAtUtc(birth, new Date(instant).toISOString()));
    if (charts.length % 20 === 0) {
      options.onProgress?.(charts.length, samples.instants.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  if (options.signal?.aborted) throw Error("Birth-time analysis cancelled. No chart was saved.");
  options.onProgress?.(charts.length, samples.instants.length);
  if (options.signal?.aborted) throw Error("Birth-time analysis cancelled. No chart was saved.");
  return summarize(birth, samples, charts);
}

export function restoreWindowFacts(birth: BirthRecordV1, stored: HumanDesignFactsV1): HumanDesignFactsV1 {
  const report = stored?.timeWindowAnalysis;
  const samples = windowUtcSamples(birth);
  if (!report || report.schema !== "BirthTimeAnalysisV1" || report.algorithm !== "minute-sweep-v1" ||
    stored.birthId !== birth.id || stored.birthUpdatedAt !== birth.updatedAt ||
    report.window?.earliestLocal !== birth.timeWindow?.earliestLocal || report.window?.latestLocal !== birth.timeWindow?.latestLocal || report.timezone !== birth.timezone ||
    report.sampleCount !== samples.instants.length || report.skippedLocalMinutes !== samples.skippedLocalMinutes || report.repeatedLocalMinutes !== samples.repeatedLocalMinutes ||
    report.representativeUtc !== new Date(samples.instants[Math.floor(samples.instants.length / 2)]).toISOString() ||
    !Array.isArray(report.summaries) || report.summaries.length !== 6 ||
    !report.summaries.every((row) => typeof row.label === "string" && Array.isArray(row.values) && row.values.length > 0 && row.values.length <= report.sampleCount && row.values.every((v) => typeof v === "string" && v.length <= 160)) ||
    !Array.isArray(report.activations) || report.activations.length !== 26 ||
    !report.activations.every((a) => typeof a.id === "string" && ["personality", "design"].includes(a.side) && typeof a.planet === "string" && Array.isArray(a.values) && a.values.length > 0 && a.values.length <= report.sampleCount && a.values.every((v) => /^(?:[1-9]|[1-5]\d|6[0-4])\.[1-6]$/.test(v))) ||
    !report.gates || !report.channels || !Array.isArray(report.centers) || report.centers.length !== 9)
    throw Error("Saved birth-time analysis is invalid or outdated. Existing data was left untouched.");
  for (const key of ["stable", "variable"] as const) {
    if (!Array.isArray(report.gates[key]) || !report.gates[key].every((g) => Number.isInteger(g) && g >= 1 && g <= 64) ||
      !Array.isArray(report.channels[key]) || !report.channels[key].every((id) => /^channel-\d+-\d+$/.test(id)))
      throw Error("Invalid saved birth-time mechanics.");
  }
  const facts = calculateChartAtUtc(birth, report.representativeUtc);
  const expectedSummaries: Record<string, string> = {
    type: facts.type, strategy: facts.strategy, authority: facts.authority,
    profile: facts.profile, definition: facts.definition,
    "incarnation cross gates": facts.incarnationCross.gates.join(" / "),
  };
  if (JSON.stringify(stored.engine) !== JSON.stringify(facts.engine) ||
    new Set(report.summaries.map((row) => row.label)).size !== 6 ||
    report.summaries.some((row) => !(row.label in expectedSummaries) || !row.values.includes(expectedSummaries[row.label])) ||
    new Set(report.activations.map((a) => a.id)).size !== 26 ||
    report.activations.some((a) => !facts.activations.some((value) => value.id === a.id && value.planet === a.planet && value.side === a.side && a.values.includes(`${value.gate}.${value.line}`))) ||
    new Set(report.centers.map((c) => c.id)).size !== 9 ||
    report.gates.stable.some((g) => !facts.gates.includes(g) || report.gates.variable.includes(g)) ||
    facts.gates.some((g) => !report.gates.stable.includes(g) && !report.gates.variable.includes(g)) ||
    report.channels.stable.some((id) => !facts.channels.some((c) => c.id === id) || report.channels.variable.includes(id)) ||
    facts.channels.some((c) => !report.channels.stable.includes(c.id) && !report.channels.variable.includes(c.id)))
    throw Error("Saved birth-time analysis does not match its chart sample or calculation version.");
  if (report.centers.some((c) => !facts.centers.some((value) => value.id === c.id) || !Array.isArray(c.values) || !c.values.length || c.values.some((v) => !["defined", "undefined"].includes(v))))
    throw Error("Invalid saved birth-time center states.");
  return withAnalysis(facts, report);
}
