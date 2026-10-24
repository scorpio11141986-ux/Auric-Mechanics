import type {
  AIContextV1,
  Evidence,
  HumanDesignFactsV1,
  Observation,
  SavedQuestion,
  UserInterpretationProfileV1,
} from "../domain/contracts";
import {
  byId,
  datasetPin,
  gateId,
  recordFor,
  type GateRecord,
  type LineRecord,
  type ChannelRecord,
} from "../content/records";
import { exactLookup, query } from "../content/retrieval";
import { inferenceDisposition } from "../content/inference-policy";
import { contentHash } from "../domain/composite-hash";
import { exactLineEligible, resolveAskSelection } from "./ask-selection";
import { CENTER_NAMES } from "../domain/contracts";
import type { Selection } from "../ui/workspace-model";

export function validateProfile(p: UserInterpretationProfileV1) {
  if (
    !p ||
    p.schema !== "UserInterpretationProfileV1" ||
    !["new", "basics", "advanced"].includes(p.familiarity) ||
    !["concise", "standard", "deep"].includes(p.depth) ||
    !["modern", "traditional", "both"].includes(p.terminology) ||
    !["practical", "technical", "integrated"].includes(p.style) ||
    !Array.isArray(p.interests) ||
    p.interests.length > 8 ||
    p.interests.some((x) => typeof x !== "string" || x.length > 80)
  )
    throw Error("Invalid interpretation profile");
}

export function contextFor(
  question: string,
  chart: HumanDesignFactsV1,
  profile: UserInterpretationProfileV1,
  observations: Observation[] = [],
  history: SavedQuestion[] = [],
  options: { selection?: Selection } = {},
): AIContextV1 {
  if (chart.timeWindowAnalysis)
    throw Error("A birth-time window has multiple possible charts. Personal evidence/AI readings are withheld; inspect Birth-time stability instead.");
  validateProfile(profile);
  if (
    typeof question !== "string" ||
    !question.trim() ||
    question.length > 1200
  )
    throw Error("Ask a question of 1 to 1,200 characters.");
  const available = new Set([
    ...chart.gates.map(gateId),
    ...chart.channels.map((c) => c.id),
    ...chart.activations.filter(a => exactLineEligible(chart, a)).map((a) => `${gateId(a.gate)}-line-${a.line}`),
  ]);
  const resolved = resolveAskSelection(question, chart, options.selection);
  const exact = exactLookup(question);
  let selected: string[], selection: AIContextV1["selection"];
  if (resolved) {
    selected = resolved.recordIds;
    selection = resolved.selection;
  } else if (exact !== null) {
    selected = exact.map((d) => d.id).filter((id) => available.has(id));
    selection = selected.length ? "exact" : "not-in-chart";
  } else {
    selected = query(question, {}, 50)
      .results.filter((d) => available.has(d.id))
      .map((d) => d.id);
    selection = selected.length ? "lexical" : "overview";
    if (!selected.length) {
      const sun = chart.activations.find(
        (a) => a.side === "personality" && a.planet === "Sun",
      )!;
      selected = [
        exactLineEligible(chart, sun) ? `${gateId(sun.gate)}-line-${sun.line}` : gateId(sun.gate),
        ...chart.channels.map((c) => c.id),
      ];
    }
  }
  const exclusions: { recordId: string; reason: string }[] = [];
  for (const doc of exact || []) {
    if (doc.type === "line" && chart.activations.some(a => a.gate === doc.gate_number && a.line === doc.line_number) && !available.has(doc.id))
      exclusions.push({ recordId: doc.id, reason: "Exact Line uncertain (withheld); the point calculation does not establish exact-Line eligibility." });
  }
  selected = selected.filter((recordId) => {
    const disposition = inferenceDisposition(recordId);
    if (!disposition.allowed) exclusions.push({ recordId, reason: disposition.reason });
    return disposition.allowed;
  }).slice(
    0,
    profile.depth === "deep" ? 6 : profile.depth === "standard" ? 4 : 3,
  );
  const facts: AIContextV1["facts"] = [
    {
      id: "f:summary",
      kind: "DERIVED",
      value: `${chart.type}; ${chart.authority} Authority; Profile ${chart.profile}; ${chart.definition}.`,
    },
  ];
  for (const key of ["type", "strategy", "authority", "profile", "definition"] as const)
    facts.push({ id: `f:${key}`, kind: "DERIVED", value: `${key}: ${chart[key]}` });
  for (const center of chart.centers)
    facts.push({ id: `f:center:${center.id}`, kind: "DERIVED", value: `${center.id}: ${center.defined ? "defined" : "undefined"}` });
  const evidence: Evidence[] = selected.map((id) => {
    const doc = byId.get(id)!;
    const record = recordFor(id)!;
    const supporting = chart.activations.filter((a) =>
      (!resolved || resolved.activationIds.includes(a.id)) && (doc.type === "line"
        ? a.gate === doc.gate_number && a.line === doc.line_number && exactLineEligible(chart, a)
        : doc.type === "gate"
          ? a.gate === doc.gate_number
          : (doc.gate_numbers || []).includes(a.gate)),
    );
    const supportingFactIds = supporting.map((a) => `f:${a.id}`);
    for (const a of supporting)
      if (!facts.some((f) => f.id === `f:${a.id}`))
        facts.push({
          id: `f:${a.id}`,
          kind: "CALCULATED",
          value: `${a.side} ${a.planet}: Gate ${a.gate} (${CENTER_NAMES[a.center]} Center); ${exactLineEligible(chart, a) ? `Line ${a.line}; ${a.longitude.toFixed(6)} degrees tropical.` : "exact Line uncertain (withheld)."}`,
        });
    if (doc.type === "channel") {
      const channel = chart.channels.find((c) => c.id === id)!;
      facts.push({
        id: `f:${id}`,
        kind: "DERIVED",
        value: `Natal Channel ${channel.gates.join("-")}; both Gates activated; defines ${channel.centers.join(" and ")}.`,
      });
      supportingFactIds.push(`f:${id}`);
    }
    const app =
      doc.type === "line"
        ? []
        : (record as GateRecord | ChannelRecord).app_content.sections
            .concise_description || [];
    return {
      id: `e:${id}`,
      recordId: id,
      recordHash: contentHash(record),
      activationIds: supporting.map(a => a.id),
      title: doc.title,
      kind: "CANONICAL",
      supportingFactIds,
      inferenceStatus: "internal-evaluation-only",
      sourceAuthentication: "recovered-not-original-authenticated",
      mechanic: doc.fields.mechanical_kernel || "",
      coherent: doc.fields.coherent_expression || "",
      distorted: doc.fields.distorted_expression || "",
      boundary: doc.fields.boundary_nonclaim || "",
      appInterpretation: app.slice(0, 1).map((b) => ({
        blockId: b.block_id,
        text: b.text,
        kind: "APP_INTERPRETATION" as const,
      })),
      appBoundary:
        doc.type === "line"
          ? ""
          : (record as GateRecord | ChannelRecord).app_content
              .interpretive_boundary,
    };
  });
  return {
    schema: "AIContextV1",
    question: question.trim(),
    subject: { id: chart.birthId, mode: "HD" },
    chartRevision: chart.birthUpdatedAt,
    birthConfidence: chart.uncertainty.some((v) => v.startsWith("Approximate birth time")) ? "approximate" : "exact",
    exclusions,
    profile: {schema:"UserInterpretationProfileV1",familiarity:profile.familiarity,depth:profile.depth,terminology:profile.terminology,style:profile.style,interests:[...profile.interests]},
    facts,
    evidence,
    userContext: observations.slice(-3).map((o) => ({
      id: o.id,
      text: String(o.text).slice(0, 600),
      createdAt: o.createdAt,
      kind: "USER_SUPPLIED",
    })),
    feedback: history
      .filter((h) => h.feedback && h.context.subject.id === chart.birthId && h.context.chartRevision === chart.birthUpdatedAt)
      .slice(-2)
      .map((h) => ({
        answer: (h.response?.answer || h.context.question).slice(0, 600),
        feedback: h.feedback!,
      })),
    uncertainty: [
      ...chart.uncertainty,
      ...(resolved?.activationIds.some(id => chart.activations.some(a => a.id === id && !exactLineEligible(chart, a)))
        ? ["Exact Lines are uncertain and withheld. Available Gate-level evidence does not establish an exact-Line interpretation."] : []),
      ...(resolved ? ["Planet and natal side identify calculated occurrences. Fixing planets in source text are not placement-specific planetary teachings; no new planet-role synthesis is supplied."] : []),
      ...exclusions.map((e) => `Quarantined ${e.recordId}: ${e.reason}`),
      ...(selection === "overview"
        ? [
            "No direct lexical match; these are chart-overview records, not proof of the premise in the question.",
          ]
        : []),
      ...(selection === "not-in-chart"
        ? [
            "Requested mechanic is not active in this natal chart. No personalized evidence was selected.",
          ]
        : []),
      "Human Design interpretations are symbolic possibilities, not established clinical facts, guarantees or decision instructions.",
    ],
    selection,
    dataset: {
      runtimeVersion: datasetPin.runtimeVersion,
      canonicalSha256: datasetPin.canonical.sha256,
      app1Sha256: datasetPin.files["app1_runtime.min.json"].sha256,
      app2Sha256: datasetPin.files["app2_documents.json"].sha256,
      releaseStatus: datasetPin.releaseStatus,
      sourceAuthentication: datasetPin.sourceAuthentication,
    },
    engine: chart.engine,
    activationBindings: (resolved ? chart.activations.filter(a => resolved.activationIds.includes(a.id)) : chart.activations.filter(a => evidence.some(e => e.activationIds?.includes(a.id)))).map(a => ({
      activationId: a.id, side: a.side, planet: a.planet, gate: a.gate,
      line: exactLineEligible(chart, a) ? a.line : null, center: a.center,
      lineStatus: exactLineEligible(chart, a) ? "exact-point" : "uncertain-withheld",
      sourceRecordId: evidence.find(e => e.activationIds?.includes(a.id) && e.recordId === `${gateId(a.gate)}-line-${a.line}`)?.recordId
        || evidence.find(e => e.activationIds?.includes(a.id) && e.recordId === gateId(a.gate))?.recordId || null,
    })),
  };
}

export function detailsFor(id: string) {
  const record = recordFor(id);
  if (!record) throw Error("Record not found");
  const doc = byId.get(id)!;
  if (doc.type === "line") {
    const line = record as LineRecord;
    return {
      rich: line.deep_mechanics,
      structure: `Gate ${line.gate_number}, exact Line ${line.line_number}`,
      additional: [] as { label: string; text: string }[],
      agreement: "",
      interaction: line.harmonic_channel_interaction,
      comparison: line.source_comparison_reasoning,
      relationship: line.source_relationship_note,
      provenance: line.provenance,
      app: null,
      anomaly: line.source2_anomaly_note,
      labels: line.humdes_fixing_labels,
    };
  }
  const gate = record as GateRecord,
    channel = record as ChannelRecord;
  return {
    structure:
      doc.type === "gate"
        ? gate.center
        : `${channel.centers.join(" / ")}\n${channel.circuit} / ${channel.mechanical_category}\n${channel.substream}`,
    additional:
      doc.type === "gate"
        ? [
            { label: "CENTER LOGIC", text: gate.source6.center_logic },
            { label: "PROCESS ARC", text: gate.source6.process_arc },
            {
              label: "CHANNEL EXPRESSION",
              text: gate.source6.channel_expression,
            },
            {
              label: "RECOGNITION POSSIBILITIES",
              text: gate.source6.recognition_signals.join("\n\n"),
            },
          ]
        : [
            { label: "ENERGY MOVEMENT", text: channel.energy_movement },
            { label: "DEFINED EXPRESSION", text: channel.defined_expression },
            {
              label: `HANGING GATE ${channel.gates[0]}`,
              text: channel.hanging_gate_a,
            },
            {
              label: `HANGING GATE ${channel.gates[1]}`,
              text: channel.hanging_gate_b,
            },
            {
              label: "CONDITIONING AND DECONDITIONING",
              text: channel.conditioning_deconditioning,
            },
            {
              label: "RELATIONSHIP REFERENCE / NOT A CALCULATED COMPOSITE",
              text: channel.composite_mechanics,
            },
          ],
    agreement: doc.type === "channel" ? channel.source_agreement : "",
    rich:
      doc.type === "gate"
        ? gate.source6.gate_synthesis
        : channel.mechanical_kernel,
    interaction: "",
    comparison:
      doc.type === "gate"
        ? gate.source6.source_resolution
        : channel.source_disagreement,
    relationship:
      doc.type === "channel"
        ? channel.source_relationship_note
        : "Gate provider comparison is separate from exact-Line evidence.",
    provenance:
      doc.type === "channel"
        ? { source_urls: channel.source_urls.join("\n") }
        : {
            ...gate.app_content.lineage,
            source5_evidence_completeness: gate.source5_evidence_completeness,
          },
    app: gate.app_content,
    anomaly: null,
    labels: "",
  };
}
