import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import {
  byId,
  centerId,
  datasetPin,
  gates,
  runtime,
} from "../content/records";
import { query } from "../content/retrieval";
import { inferenceDisposition } from "../content/inference-policy";
import { inspectorReading } from "./inspector-reading";
import { CENTER_NAMES, type Person } from "../domain/contracts";
import { detailsFor } from "../intelligence/context";
import { CALCULATION_LABEL } from "./brand";
import { theme, evidenceLabels, type EvidenceKind } from "./theme";
import { BirthTimeStability } from "./BirthTimeStability";
import { gateRef, channelRef } from "../intelligence/mechanics-references";
import {
  channelState,
  chartSelection,
  highlightFor,
  relevantActivations,
  selectionFromRecord,
  selectionKey,
  selectionRecord,
  selectionTitle,
  structureReason,
  type Selection,
} from "./workspace-model";

export type InspectorView =
  | "Overview"
  | "Mechanics"
  | "Sources"
  | "Interpretation";
export type InspectorReaderState = {
  scrollY: number;
  disclosures: Record<string, boolean>;
  view: InspectorView;
};
const DisclosureState = createContext<{
  disclosures: Record<string, boolean>;
  toggle: (title: string) => void;
}>({ disclosures: {}, toggle: () => undefined });

// This is an excerpt of the pinned text, not a generated summary. Preserve a
// complete first sentence; if the source has no sentence boundary, keep its
// complete first paragraph instead of truncating it to a character count.
function completePreview(text: string) {
  const paragraph = text.trim().split(/\n\s*\n/)[0]?.trim() || "";
  return paragraph.match(/^.*?[.!?](?:[\u201d\u2019"')\]]*)?(?=\s|$)/s)?.[0] || paragraph;
}
function EvidenceBadge({ kind }: { kind: EvidenceKind }) {
  return <Text style={s.evidence}>{evidenceLabels[kind]}</Text>;
}
function Copy({ label, text }: { label: string; text?: string }) {
  return text ? (
    <View style={s.copy}>
      <Text style={s.label}>{label}</Text>
      <Text selectable style={s.body}>
        {text}
      </Text>
    </View>
  ) : null;
}
function Disclosure({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const state = useContext(DisclosureState);
  const open = !!state.disclosures[title];
  return (
    <View style={s.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => state.toggle(title)}
        style={s.row}
      >
        <Text style={s.rowTitle}>{title}</Text>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.muted}
        />
      </Pressable>
      {open && children}
    </View>
  );
}
export function MechanicsInspector({
  person,
  selection,
  onSelect,
  onHover,
  view,
  onView,
  readingLevel,
  readerState,
  onReaderState,
  pageFlow = false,
}: {
  person: Person;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection | null) => void;
  view: InspectorView;
  onView: (view: InspectorView) => void;
  readingLevel: "compact" | "expanded" | "full";
  readerState: InspectorReaderState;
  onReaderState: (patch: Partial<InspectorReaderState>) => void;
  pageFlow?: boolean;
}) {
  const chart = person.facts,
    title = selectionTitle(selection, chart),
    recordId = selectionRecord(selection);
  const doc = recordId ? byId.get(recordId) : null,
    details = recordId ? detailsFor(recordId) : null;
  const [search, setSearch] = useState("");
  const scroll = useRef<ScrollView>(null);
  const key = selectionKey(selection);
  const readerStateRef = useRef(readerState);
  readerStateRef.current = readerState;
  const restoringScroll = useRef(false);
  useEffect(() => {
    restoringScroll.current = true;
    const frame = requestAnimationFrame(() => {
      scroll.current?.scrollTo({ y: readerStateRef.current.scrollY, animated: false });
      restoringScroll.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [key, readingLevel, view, pageFlow]);
  const reading = inspectorReading(selection, chart);
  const disposition = recordId ? inferenceDisposition(recordId) : null;
  const canonical = !!(doc && details && disposition?.allowed);
  const selectedActivation = selection.kind === "gate" && selection.activationId
    ? chart.activations.find(a => a.id === selection.activationId)
    : undefined;
  function row(
    label: string,
    value: string,
    target: Selection,
    accessibilityLabel?: string,
  ) {
    return (
      <Pressable
        key={accessibilityLabel || label}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || `Inspect ${label}`}
        onPress={() => onSelect(target)}
        onHoverIn={() => onHover(target)}
        onHoverOut={() => onHover(null)}
        onFocus={() => onHover(target)}
        onBlur={() => onHover(null)}
        style={s.row}
      >
        <Text style={s.propertyLabel}>{label}</Text>
        <Text style={s.propertyValue}>{value}</Text>
        <Feather name="chevron-right" color={theme.muted} size={12} />
      </Pressable>
    );
  }
  const channelRows = (ids: string[]) =>
    ids.map((id) => {
      const state = channelState(id, chart);
      return row(
        channelRef(state.channel.id),
        `${state.channel.name} / ${state.completed ? "Completed" : state.active.length ? `Hanging / missing ${state.missing.join(", ")}` : "Not active"}`,
        { kind: "channel", id },
        `Inspect ${channelRef(state.channel.id)}`,
      );
    });
  const gateRows = (numbers: number[]) =>
    numbers.map((g) =>
      row(
        gateRef(g),
        `${gates.get(g)!.display_short_name} / ${chart.gates.includes(g) ? "Activated" : "Not activated / reference"}`,
        { kind: "gate", gate: g },
      ),
    );
  const activationRows = () =>
    relevantActivations(selection, chart).map((a) =>
      row(
        `${a.side} ${a.planet}`,
        `${gateRef(a.gate,a.boundaryRisk?undefined:a.line)}${a.boundaryRisk ? " / Near Line boundary" : ""}`,
        { kind: "gate", gate: a.gate, line: a.line, activationId: a.id },
        `Inspect ${a.side} ${a.planet} ${a.gate}.${a.line}`,
      ),
    );
  function overview() {
    if (selection.kind === "chart")
      return (
        <>
          <EvidenceBadge kind="derived" />
          {chart.timeWindowAnalysis && <BirthTimeStability report={chart.timeWindowAnalysis} />}
          {row("Type", chart.type, { kind: "chart", focus: "type" })}
          {row("Strategy", chart.strategy, { kind: "chart", focus: "type" })}
          {row("Authority", chart.authority, {
            kind: "chart",
            focus: "authority",
          })}
          {row("Profile", chart.profile, { kind: "chart", focus: "profile" })}
          {row("Definition", chart.definition, { kind: "definition" })}
          {row(
            "Defined Centers",
            `${chart.centers.filter((c) => c.defined).length} of 9`,
            { kind: "chart", focus: "centers" },
          )}
          {row("Defined Channels", `${chart.channels.length} completed`, {
            kind: "chart",
            focus: "channels",
          })}
          {row(
            "Planetary activations",
            `${chart.activations.length} Personality + Design`,
            { kind: "chart", focus: "activations" },
          )}
          {selection.focus === "type" && (
            <Copy
              label="CHART STRUCTURE"
              text={`${chart.type}. Strategy: ${chart.strategy}. Sacral: ${chart.centers.find((c) => c.id === "Sacral")?.defined ? "defined" : "undefined"}. The completed Channels and islands below are the structure used by the existing Type resolver.`}
            />
          )}
          {selection.focus === "authority" && (
            <Copy
              label="CURRENT AUTHORITY"
              text={`${chart.authority}. Defined Centers: ${
                chart.centers
                  .filter((c) => c.defined)
                  .map((c) => CENTER_NAMES[c.id])
                  .join(", ") || "none"
              }. Authority is an engine-derived chart property, not a medical or decision-making guarantee.`}
            />
          )}
          {selection.focus === "profile" && (
            <>
              <Copy
                label="PROFILE SOURCE"
                text="Profile uses the Personality Sun Line followed by the Design Sun Line."
              />
              {activationRows()}
            </>
          )}
          {selection.focus === "centers" &&
            chart.centers
              .filter((c) => c.defined)
              .map((c) =>
                row(CENTER_NAMES[c.id], "Defined", {
                  kind: "center",
                  id: c.id,
                }),
              )}
          {selection.focus === "channels" &&
            channelRows(chart.channels.map((c) => c.id))}
          {selection.focus === "activations" && activationRows()}
        </>
      );
    if (selection.kind === "center") {
      const defined = chart.centers.find((c) => c.id === selection.id)!.defined;
      return (
        <>
          <EvidenceBadge kind="derived" />
          <Copy
            label="CENTER STATE"
            text={
              defined
                ? "Defined by completed natal Channels shown below."
                : "No completed natal Channel defines this Center. A hanging Gate alone does not define it."
            }
          />
          {channelRows(
            chart.channels
              .filter((c) => c.centers.includes(selection.id))
              .map((c) => c.id),
          )}
          <Text style={s.label}>ACTIVATED GATES IN THIS CENTER</Text>
          {gateRows(
            runtime.gates
              .filter((g) => centerId(g.center) === selection.id && chart.gates.includes(g.gate_number))
              .map((g) => g.gate_number),
          )}
          {!chart.activations.some((a) => a.center === selection.id) && <Text style={s.small}>No activated Gates in this Center.</Text>}
          <Disclosure key={selection.id} title="Inactive Gates in this Center / reference">
            <Text style={s.small}>These Gates belong to the Center's topology, not your natal activations.</Text>
            {gateRows(runtime.gates.filter((g) => centerId(g.center) === selection.id && !chart.gates.includes(g.gate_number)).map((g) => g.gate_number))}
          </Disclosure>
        </>
      );
    }
    if (selection.kind === "definition")
      return (
        <>
          <EvidenceBadge kind="derived" />
          <Copy
            label="CONNECTED STRUCTURE"
            text={`${chart.definitionIslands.length} connected component(s) of completed natal Channels. Undefined Centers and hanging Gates do not join these islands.`}
          />
          {chart.definitionIslands.map((island, index) => (
            <View key={index}>
              {row(
                `Island ${index + 1}`,
                island.map((c) => CENTER_NAMES[c]).join(", "),
                { kind: "definition", island: index },
              )}
              {(selection.island === undefined || selection.island === index) &&
                channelRows(
                  chart.channels
                    .filter((c) =>
                      c.centers.every((center) => island.includes(center)),
                    )
                    .map((c) => c.id),
                )}
            </View>
          ))}
          <Copy
            label="BRIDGING LIMIT"
            text="Bridge-path analysis has not been migrated into this app. No speculative bridge recommendations are calculated here."
          />
        </>
      );
    if (selection.kind === "channel") {
      const state = channelState(selection.id, chart);
      return (
        <>
          <EvidenceBadge kind="derived" />
          <Copy
            label={
              state.completed
                ? "COMPLETED IN THIS NATAL CHART"
                : "REFERENCE / NOT COMPLETED"
            }
            text={`${state.channel.name}. ${state.channel.centers.join(" / ")}. ${state.channel.circuit}. ${state.completed ? "Both Gates are activated, defining both endpoints." : `Missing natal Gate(s): ${state.missing.join(", ")}.`}`}
          />
          {gateRows(state.channel.gates)}
        </>
      );
    }
    const active = relevantActivations(selection, chart);
    return (
      <>
        <EvidenceBadge kind={active.length ? "calculated" : "canonical"} />
        <Copy
          label={active.length ? "NATAL ACTIVATION" : "REFERENCE GATE"}
          text={`${selection.activationId ? "Selected activation" : selection.line ? `Exact Line ${selection.line}` : `Gate ${selection.gate}`} ${active.length ? `has ${active.length} planetary contribution(s) in this chart.` : "has no matching activation in this natal chart."} Center: ${gates.get(selection.gate)!.center}.`}
        />
        {row(
          "Center",
          CENTER_NAMES[centerId(gates.get(selection.gate)!.center)],
          { kind: "center", id: centerId(gates.get(selection.gate)!.center) },
        )}
        {channelRows(
          runtime.channels
            .filter((c) => c.gates.includes(selection.gate))
            .map((c) => c.id),
        )}
        <Text style={s.label}>PLANETARY CONTRIBUTIONS</Text>
        {activationRows()}
        {!selection.line && (
          <Disclosure title="Exact Lines">
            {gates.get(selection.gate)!.lines.map((line) =>
              row(`Line ${line.line_number}`, line.traditional_title, {
                kind: "gate",
                gate: selection.gate,
                line: line.line_number,
              }),
            )}
          </Disclosure>
        )}
      </>
    );
  }
  function mechanics() {
    const highlighted = highlightFor(selection, chart);
    return (
      <>
        <EvidenceBadge kind="derived" />
        {selection.kind === "chart" && (
          <Copy
            label="CHART-SPECIFIC CAUSALITY"
            text={structureReason(chart, selection.focus)}
          />
        )}
        <Copy
          label="ACTIVATION -> GATE / LINE -> CENTER -> CHANNEL"
          text="Planetary contributions below come from this natal chart. Two activated harmonic Gates complete a Channel. Completed Channels define their Centers; connected defined Centers form Definition islands."
        />
        {selection.kind === "chart" && selection.focus === "profile" ? (
          <Copy
            label="PROFILE CAUSALITY"
            text={`Personality Sun Line / Design Sun Line = ${chart.profile}.`}
          />
        ) : null}
        {selection.kind === "definition" && overview()}
        {selection.kind !== "definition" &&
          channelRows(
            selection.kind === "chart"
              ? chart.channels.map((c) => c.id)
              : highlighted.channels,
          )}
        <Text style={s.label}>CALCULATED PLANETARY CONTRIBUTIONS</Text>
        {activationRows()}
        {!relevantActivations(selection, chart).length && (
          <Copy
            label="NO CONTRIBUTING ACTIVATION"
            text="This selection has no corresponding natal planetary activation. Reference content is not an active chart fact."
          />
        )}
        <Disclosure title="Calculation provenance and limitations">
          <Copy
            label="UTC INSTANTS"
            text={`Personality: ${chart.personalityUtc}\nDesign: ${chart.designUtc}`}
          />
          <Copy
            label="CALCULATION"
            text={`${CALCULATION_LABEL} ${chart.engine.version}; Astronomy Engine ${chart.engine.astronomy}; tropical zodiac; true osculating nodes; 88-degree solar arc. Cross geometry: ${chart.incarnationCross.gates.join("/")}; no conventional title asserted.`}
          />
          {chart.uncertainty.map((text) => (
            <Text key={text} style={s.small}>
              {text}
            </Text>
          ))}
        </Disclosure>
      </>
    );
  }
  function sources() {
    return (
      <>
        <EvidenceBadge kind="calculated" />
        <Copy
          label="CALCULATED / DERIVED, NOT A CITED TEACHING"
          text={`${CALCULATION_LABEL} ${chart.engine.version}; Astronomy Engine ${chart.engine.astronomy}. Center definition, completed Channels and islands are derived from the calculated Gate activations.`}
        />
        {details && (
          <>
            <EvidenceBadge kind="canonical" />
            <Copy label="SOURCE AGREEMENT" text={details.agreement} />
            <Copy label="COMPARISON" text={details.comparison} />
            <Copy label="SOURCE RELATIONSHIP" text={details.relationship} />
            <Copy
              label="PUBLISHED FIXING METADATA / NOT CALCULATED"
              text={details.labels}
            />
            <Copy label="ANOMALY" text={details.anomaly || undefined} />
            <Disclosure title="Provenance and evidence limits">
              <Text selectable style={s.mono}>
                {JSON.stringify(details.provenance, null, 2)}
              </Text>
            </Disclosure>
          </>
        )}
        {!details && (
          <Copy
            label="CORPUS SCOPE"
            text="The pinned corpus supplies Gates, exact Lines and Channels. This Center/Definition/whole-chart selection has no separate canonical teaching record; inspect a contributing Gate or Channel for its actual source metadata."
          />
        )}
        <Copy
          label="SOURCE AUTHENTICATION LIMIT"
          text={datasetPin.sourceAuthentication}
        />
        <Disclosure title="Dataset version and hashes">
          <Text selectable style={s.mono}>
            {datasetPin.runtimeVersion}
            {"\n"}APP1 SHA-256:{" "}
            {datasetPin.files["app1_runtime.min.json"].sha256}
          </Text>
        </Disclosure>
      </>
    );
  }
  function compactReading() {
    const meaning = canonical
      ? doc!.fields.mechanical_kernel || details!.rich
      : "";
    return <View testID="inspector-compact-reading" style={s.compactReading}>
      <Text style={s.label}>{meaning ? "PINNED MEANING PREVIEW / INTERPRETIVE POSSIBILITY" : "CALCULATED STRUCTURE"}</Text>
      <Text selectable style={s.readingLead}>{completePreview(meaning || reading.summary)}</Text>
      {meaning
        ? <Text selectable style={s.small}>{doc!.fields.boundary_nonclaim || reading.limitation}</Text>
        : <Text selectable style={s.small}>{reading.limitation}</Text>}
      {recordId && !disposition?.allowed && <Text style={s.small}>Source meaning withheld: {disposition?.reason || "No validated source record"}.</Text>}
      {selection.kind === "chart" && <>
        {row("Type", chart.type, { kind: "chart", focus: "type" })}
        {row("Authority", chart.authority, { kind: "chart", focus: "authority" })}
        {row("Profile", chart.profile, { kind: "chart", focus: "profile" })}
        {row("Definition", chart.definition, { kind: "definition" })}
        {row("Defined Centers", `${chart.centers.filter(c => c.defined).length} of 9`, { kind: "chart", focus: "centers" })}
        {row("Defined Channels", `${chart.channels.length} completed`, { kind: "chart", focus: "channels" })}
        {row("Planetary activations", `${chart.activations.length} exact contributions`, { kind: "chart", focus: "activations" })}
      </>}
    </View>;
  }
  function interpretation() {
    return <>
      {recordId && !disposition?.allowed && <Copy label="SOURCE MEANING WITHHELD" text={disposition?.reason || "No validated source record"} />}
      {canonical ? <>
        <Text style={s.label}>{reading.personal && !chart.timeWindowAnalysis ? "PINNED SOURCE MEANING / INTERPRETIVE POSSIBILITY" : "PINNED REFERENCE MEANING / NOT A VERIFIED PERSONAL READING"}</Text>
        {canonicalInterpretation()}
      </> : null}
      <View testID="inspector-reading" style={s.reading}>
        <Text style={s.label}>{reading.personal ? "IN THIS CHART" : "REFERENCE / NOT A PERSONAL READING"}</Text>
        <Text selectable style={s.readingLead}>{reading.summary}</Text>
        {reading.paragraphs.map(paragraph => <Text key={paragraph} selectable style={s.body}>{paragraph}</Text>)}
        <Text selectable style={s.small}>{reading.limitation}</Text>
      </View>
      {selection.kind === "chart" && <>
        {row("Type", chart.type, { kind: "chart", focus: "type" })}
        {row("Authority", chart.authority, { kind: "chart", focus: "authority" })}
        {row("Profile", chart.profile, { kind: "chart", focus: "profile" })}
        {row("Definition", chart.definition, { kind: "definition" })}
        {row("Defined Centers", `${chart.centers.filter(c => c.defined).length} of 9`, { kind: "chart", focus: "centers" })}
        {row("Defined Channels", `${chart.channels.length} completed`, { kind: "chart", focus: "channels" })}
        {selection.focus === "channels" && channelRows(chart.channels.map(c => c.id))}
        {selection.focus === "centers" && chart.centers.filter(c => c.defined).map(c => row(CENTER_NAMES[c.id], "Defined", { kind: "center", id: c.id }))}
        {selection.focus === "profile" && activationRows()}
      </>}
      {selection.kind === "definition" && chart.definitionIslands.map((island, index) => row(`Island ${index + 1}`, island.map(id => CENTER_NAMES[id]).join(" + "), { kind: "definition", island: index }))}
      {selection.kind !== "chart" && selection.kind !== "definition" && relevantActivations(selection, chart).length > 0 && <>
        <Text style={s.label}>EXACT PLANETARY CONTRIBUTIONS</Text>
        {activationRows()}
      </>}
      <Disclosure title="Contributing mechanics">{overview()}</Disclosure>
      <Disclosure title="Additional mechanics and calculation">{mechanics()}</Disclosure>
      <Disclosure title="Sources and evidence limits">{sources()}</Disclosure>
      {selection.kind === "chart" && !chart.timeWindowAnalysis && person.history.filter(h => h.response && h.context.chartRevision === chart.birthUpdatedAt && h.response.validationVersion === "ClaimValidationV1").slice(-1).map(h => <Disclosure key={h.id} title="Saved AI synthesis / not calculated">
        <EvidenceBadge kind="ai" />
        <Copy label="SAVED AI SYNTHESIS / NOT A CALCULATED FACT" text={h.response!.answer} />
        <Copy label="QUESTION" text={h.context.question} />
      </Disclosure>)}
      <Copy label="EVIDENCE BOUNDARY" text="Structure is calculated. Source meaning is symbolic, privately evaluated context, not independently established psychology or a guarantee. Approximate and time-window charts remain provisional." />
    </>;
  }
  function canonicalInterpretation() {
    if (doc && details)
      return (
        <>
          <EvidenceBadge kind="canonical" />
          <Copy label="RECORD" text={doc.title} />
          <Copy label="MECHANIC" text={doc.fields.mechanical_kernel} />
          <Copy
            label="COHERENT POSSIBILITY"
            text={doc.fields.coherent_expression}
          />
          <Copy
            label="DISTORTED POSSIBILITY"
            text={doc.fields.distorted_expression}
          />
          <Copy
            label="IMPORTANT BOUNDARY"
            text={doc.fields.boundary_nonclaim}
          />
          <Disclosure title="Rich explanation and deeper mechanics">
            <Copy label="CANONICAL SYNTHESIS" text={details.rich} />
            {details.app && (
              <>
                <EvidenceBadge kind="exploratory" />
                {Object.entries(details.app.sections)
                  .filter(([key]) => key !== "interaction_context")
                  .map(([key, blocks]) => (
                    <Copy
                      key={key}
                      label={`APP INTERPRETATION / ${key.replaceAll("_", " ")}`}
                      text={blocks.map((b) => b.text).join("\n\n")}
                    />
                  ))}
                <Copy
                  label="APP INTERPRETATION BOUNDARY"
                  text={details.app.interpretive_boundary}
                />
              </>
            )}
          </Disclosure>
          {!!details.additional.length && (
            <Disclosure title="Additional canonical mechanics">
              {details.additional.map((note) => (
                <Copy key={note.label} label={note.label} text={note.text} />
              ))}
            </Disclosure>
          )}
          <Copy label="CHANNEL INTERACTION" text={details.interaction} />
          {details.app?.sections.interaction_context?.map((block) => (
            <Copy
              key={block.block_id}
              label="APP INTERPRETATION / interaction context"
              text={block.text}
            />
          ))}
        </>
      );
    return null;
  }
  const readingContent = <>
    {selection.kind === "gate" && !relevantActivations(selection, chart).length && <View testID="inactive-gate-notice" style={s.notice}>
      <Text style={s.label}>NOT ACTIVATED IN THIS CHART</Text>
      <Text style={s.small}>Viewing reference information for {gateRef(selection.gate,selection.line)}, not a natal activation.</Text>
    </View>}
    {selection.kind === "channel" && !channelState(selection.id, chart).completed && <View testID="inactive-channel-notice" style={s.notice}>
      <Text style={s.label}>REFERENCE / CHANNEL NOT COMPLETED</Text>
      <Text style={s.small}>This source description is reference context, not a completed natal Channel.</Text>
    </View>}
    {chart.timeWindowAnalysis
      ? <Text style={[s.small, s.uncertainty]}>Illustrative time-window sample, not a certain natal chart. Overview shows which sampled results change.</Text>
      : person.birth.confidence !== "exact" && <Text style={[s.small, s.uncertainty]}>Birth time {person.birth.confidence}: this chart and its reading remain provisional.</Text>}
    {selection.kind === "gate" && relevantActivations(selection, chart).some(a => a.boundaryRisk) && <Text style={[s.small, s.uncertainty]}>Selected contribution is near a Line boundary; exact Line interpretation is sensitive to birth time.</Text>}
    {readingLevel === "compact"
      ? compactReading()
      : readingLevel === "expanded"
        ? interpretation()
        : view === "Overview"
          ? overview()
          : view === "Mechanics"
            ? mechanics()
            : view === "Sources"
              ? sources()
              : interpretation()}
    {readingLevel !== "compact" && <Disclosure title="Pinned reference">
      <TextInput
        accessibilityLabel="Find Gate, exact Line, Channel or theme"
        value={search}
        onChangeText={setSearch}
        placeholder="Gate 14, 14.2, 2-14..."
        placeholderTextColor={theme.muted}
        style={s.input}
      />
      {search.trim() && query(search).results.map(record => row(record.title, "Pinned reference", selectionFromRecord(record.id)!, `Inspect reference ${record.id}`))}
      {search.trim() && !query(search).total_matches && <Text style={s.small}>No matching record. Exact identities and filters are not relaxed.</Text>}
    </Disclosure>}
  </>;
  return (
    <DisclosureState.Provider value={{
      disclosures: readerState.disclosures,
      toggle: disclosureTitle => onReaderState({ disclosures: { ...readerStateRef.current.disclosures, [disclosureTitle]: !readerStateRef.current.disclosures[disclosureTitle] } }),
    }}>
    <View
      testID="mechanics-inspector"
      accessibilityLabel="Mechanics Inspector"
      style={[s.root, pageFlow && s.flowRoot]}
    >
      <View style={s.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.heading}>{doc?.title || (selection.kind === "center" ? CENTER_NAMES[selection.id] : title.title)}</Text>
          <Text style={s.small}>{title.subtitle}{selectedActivation ? ` / ${selectedActivation.side === "design" ? "Design" : "Personality"} ${selectedActivation.planet}` : ""}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chart overview"
          {...{ title: "Chart overview" }}
          onPress={() => {
            onSelect(chartSelection);
            onView("Interpretation");
          }}
          style={s.icon}
        >
          <Feather name="corner-up-left" size={18} color={theme.muted} />
        </Pressable>
      </View>
      {readingLevel === "full" && <View style={s.tabs}>
        {(
          [
            "Interpretation",
            "Overview",
            "Mechanics",
            "Sources",
          ] as InspectorView[]
        ).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={`Inspector ${value === "Interpretation" ? "Reading" : value}`}
            accessibilityState={{ selected: view === value }}
            aria-selected={view === value}
            onPress={() => onView(value)}
            style={[s.tab, value === view && { borderColor: theme.text }]}
          >
            <Text style={[s.tabText, value === view && { color: theme.text }]}>
              {value === "Interpretation" ? "Reading" : value}
            </Text>
          </Pressable>
        ))}
      </View>}
      {pageFlow ? <View style={s.content}>{readingContent}</View> : <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
        scrollEventThrottle={64}
        onScroll={event => {
          if (!restoringScroll.current) onReaderState({ scrollY: event.nativeEvent.contentOffset.y });
        }}
      >
        {readingContent}
      </ScrollView>}
    </View>
    </DisclosureState.Provider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: theme.surface },
  flowRoot: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heading: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600",
  },
  small: { color: theme.muted, fontSize: 16, lineHeight: 23 },
  icon: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderColor: "transparent",
  },
  tabText: { fontSize: 16, color: theme.muted },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 0 },
  notice: { paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.border },
  uncertainty: { color: theme.uncertain, marginVertical: 8 },
  evidence: {
    color: theme.muted, fontSize: 10, lineHeight: 16,
    paddingVertical: 8, borderBottomWidth: 1, borderColor: "#303a36",
  },
  row: {
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "#303a36",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  propertyLabel: { width: "32%", maxWidth: 126, color: theme.muted, fontSize: 16, lineHeight: 23 },
  propertyValue: { flex: 1, minWidth: 0, color: theme.text, fontSize: 16, lineHeight: 23, fontWeight: "500" },
  rowTitle: { color: theme.text, fontSize: 16, lineHeight: 23, flexShrink: 1 },
  label: {
    color: theme.muted,
    fontSize: 10,
    lineHeight: 17,
    fontWeight: "600",
  },
  body: { fontSize: 16, lineHeight: 25, color: theme.text },
  reading: { gap: 12, paddingVertical: 16 },
  compactReading: { gap: 8, paddingVertical: 8 },
  readingLead: { fontSize: 16, lineHeight: 25, color: theme.text, fontWeight: "500" },
  copy: { gap: 4, paddingVertical: 12 },
  section: { borderTopWidth: 1, borderColor: "#303a36" },
  mono: {
    color: theme.muted,
    fontFamily: "monospace",
    fontSize: 16,
    lineHeight: 24,
  },
  input: {
    padding: 12,
    minHeight: 44,
    fontSize: 16,
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 4,
  },
});
