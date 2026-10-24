import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { SavedQuestion } from "../domain/contracts";
import { traceFor } from "../intelligence/trace";
import { theme } from "./theme";
import { CALCULATION_LABEL } from "./brand";
import { EvidenceBadge } from "./EvidenceBadge";

function Expand({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        style={s.head}
        onPress={() => setOpen(!open)}
      >
        <Text style={s.title}>{title}</Text>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          color={theme.muted}
          size={18}
        />
      </Pressable>
      {open && children}
    </View>
  );
}
export function MechanicsTrace({
  question,
  claimIndex,
  onRecord,
  onShowChart,
  allowChart = true,
}: {
  question: SavedQuestion;
  claimIndex: number | null;
  onRecord: (id: string) => void;
  onShowChart: (id: string) => void;
  allowChart?: boolean;
}) {
  const { claim, evidence, facts } = traceFor(question, claimIndex);
  return (
    <View style={{ gap: 16 }}>
      <EvidenceBadge kind={claim ? "ai" : "canonical"} />
      <Text style={s.h1}>{claim?.text || question.context.question}</Text>
      {!!claim && <Text style={s.small}>{claim.validation || "Legacy claim / not validated by current policy"}</Text>}
      {!allowChart && <Text style={s.small}>Historical reading: retained facts and sources are shown. Highlighting the current chart is disabled because the input revision differs.</Text>}
      <Text style={s.body}>
        {evidence.length
          ? `Based on ${evidence.map((e) => e.title).join("; ")}.`
          : "No supporting natal records were selected for this claim or lookup."}
      </Text>
      <Text style={s.small}>
        Evidence is selected before interpretation. A citation links to
        supporting material; it does not prove that a personal interpretation is
        true.
      </Text>
      {evidence.map((e) => (
        <View key={e.id} style={s.section}>
          <Text style={s.title}>{e.title}</Text>
          <EvidenceBadge kind="canonical" />
          <Text selectable style={s.body}>
            {e.mechanic}
          </Text>
          {!!e.boundary && <Text style={s.boundary}>{e.boundary}</Text>}
          <View style={s.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Read full ${e.title}`}
              style={s.button}
              onPress={() => onRecord(e.recordId)}
            >
              <Text style={s.action}>Read full record</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show ${e.title} in my chart`}
              disabled={!allowChart}
              style={s.button}
              onPress={() => onShowChart(e.recordId)}
            >
              <Text style={s.action}>Show me in my chart</Text>
            </Pressable>
          </View>
          {!!e.appInterpretation.length && (
            <Expand title={`Interpretive context: ${e.title}`}>
              <EvidenceBadge kind="exploratory" />
              {e.appInterpretation.map((a) => (
                <Text key={a.blockId} selectable style={s.body}>
                  {a.text}
                </Text>
              ))}
              <Text style={s.small}>{e.appBoundary}</Text>
            </Expand>
          )}
        </View>
      ))}
      <Expand title="Chart facts supporting this reading">
        {facts.map((f) => (
          <View key={f.id} style={{ marginBottom: 12 }}>
            <EvidenceBadge
              kind={f.kind === "CALCULATED" ? "calculated" : "derived"}
            />
            <Text style={s.body}>{f.value}</Text>
          </View>
        ))}
      </Expand>
      <Expand title="Birth-time sensitivity and limits">
        <EvidenceBadge kind="uncertain" />
        {[
          ...question.context.uncertainty,
          ...(question.response?.uncertainty || []),
        ].map((text, i) => (
          <Text key={i} style={s.body}>
            {text}
          </Text>
        ))}
      </Expand>
      {!!(
        question.context.userContext.length || question.context.feedback.length
      ) && (
        <Expand title="Your context and feedback">
          <EvidenceBadge kind="user" />
          {question.context.userContext.map((o) => (
            <Text key={o.id} style={s.body}>
              {o.text}
            </Text>
          ))}
          {question.context.feedback.map((f, i) => (
            <Text key={i} style={s.body}>
              {f.feedback}: {f.answer}
            </Text>
          ))}
        </Expand>
      )}
      <Expand title="Versions, provenance and evidence limits">
        <Text style={s.body}>
          Reconciled reference candidate. Propagation is verified; original
          frozen source bytes have not been independently authenticated.
          Commercial content rights remain unresolved; this is private evaluation material.
        </Text>
        <Text style={s.body}>
          Calculation: {CALCULATION_LABEL} {question.context.engine.version}.
          Reference: {question.context.dataset.runtimeVersion}.
        </Text>
        <Text style={s.body}>
          {question.response
            ? `AI synthesis: ${question.response.model.id}. Confidence is interpretive, not established.`
            : "No model was called for this evidence lookup."}
        </Text>
        <Expand title="Technical evidence identifiers">
          <Text selectable style={s.mono}>
            {JSON.stringify(
              {
                dataset: question.context.dataset,
                engine: {
                  version: question.context.engine.version,
                  adapter: question.context.engine.adapter,
                  astronomy: question.context.engine.astronomy,
                  node: question.context.engine.node,
                  zodiac: question.context.engine.zodiac,
                  designArc: question.context.engine.designArc,
                },
                evidence: evidence.map((e) => ({
                  id: e.id,
                  recordId: e.recordId,
                  supportingFactIds: e.supportingFactIds,
                })),
              },
              null,
              2,
            )}
          </Text>
        </Expand>
      </Expand>
    </View>
  );
}
const s = StyleSheet.create({
  h1: { color: theme.text, fontSize: 24, lineHeight: 33, fontWeight: "500" },
  title: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
    flex: 1,
  },
  body: { color: theme.text, fontSize: 15, lineHeight: 24, marginVertical: 8 },
  small: { color: theme.muted, fontSize: 13, lineHeight: 21 },
  boundary: {
    color: theme.muted,
    fontSize: 14,
    lineHeight: 23,
    paddingLeft: 12,
    borderLeftColor: theme.accentMuted,
    borderLeftWidth: 2,
    marginVertical: 12,
  },
  section: {
    borderTopWidth: 1,
    borderColor: theme.border,
    paddingTop: 16,
    gap: 8,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingBottom: 12,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    minHeight: 44,
    padding: 12,
    borderRadius: 5,
    backgroundColor: theme.surfaceRaised,
    justifyContent: "center",
  },
  action: { color: theme.accent, fontSize: 13, fontWeight: "500" },
  mono: {
    color: theme.muted,
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 20,
  },
});
