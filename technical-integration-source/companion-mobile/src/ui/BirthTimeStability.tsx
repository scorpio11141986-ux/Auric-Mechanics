import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CENTER_NAMES, type BirthTimeAnalysisV1 } from "../domain/contracts";
import { theme } from "./theme";

export function BirthTimeStability({ report }: { report: BirthTimeAnalysisV1 }) {
  const [showAll, setShowAll] = useState(false);
  const changing = report.activations.filter((a) => a.values.length > 1);
  function row(label: string, values: string[]) {
    return <View key={label} style={s.row}>
      <Text style={s.label}>{label}</Text>
      <View style={s.value}>
        <Text selectable style={s.text}>{values.join(" / ") || "None"}</Text>
        <Text style={[s.status, values.length > 1 && { color: theme.uncertain }]}>{values.length > 1 ? "Changes in window" : "Unchanged at sampled times"}</Text>
      </View>
    </View>;
  }
  return <View testID="birth-time-stability" style={s.section}>
    <Text style={s.heading}>Birth-time stability</Text>
    <Text selectable style={s.text}>{report.window.earliestLocal.replace("T", " ")} to {report.window.latestLocal.replace("T", " ")}</Text>
    <Text style={s.status}>{report.timezone} / {report.sampleCount} possible UTC times / 1-minute grid</Text>
    <Text style={s.warning}>Sampled stability, not an exact birth time or confidence probability. Transitions shorter than one minute can be missed.</Text>
    {(report.skippedLocalMinutes > 0 || report.repeatedLocalMinutes > 0) && <Text style={s.warning}>{report.skippedLocalMinutes} nonexistent local minutes omitted; {report.repeatedLocalMinutes} repeated local minutes evaluated in both occurrences.</Text>}
    {report.summaries.map((summary) => row(summary.label, summary.values))}
    <Text style={s.subheading}>Center states</Text>
    {report.centers.map((center) => row(CENTER_NAMES[center.id], center.values))}
    <Text style={s.subheading}>Gates and channels</Text>
    <Text selectable style={s.text}>Gates present at every sampled time: {report.gates.stable.join(", ") || "None"}</Text>
    <Text selectable style={s.warning}>Gates present at some sampled times: {report.gates.variable.join(", ") || "None"}</Text>
    <Text selectable style={s.text}>Channels present at every sampled time: {report.channels.stable.map((id) => id.replace("channel-", "")).join(", ") || "None"}</Text>
    <Text selectable style={s.warning}>Channels present at some sampled times: {report.channels.variable.map((id) => id.replace("channel-", "")).join(", ") || "None"}</Text>
    <Text style={s.subheading}>Planetary activations</Text>
    <Text style={s.status}>{changing.length} changing / {report.activations.length - changing.length} unchanged at sampled times</Text>
    {(showAll ? report.activations : changing).map((a) => row(`${a.side === "design" ? "Design" : "Personality"} ${a.planet}`, a.values))}
    <Pressable accessibilityRole="button" accessibilityLabel={showAll ? "Show changing activations" : "Show all sampled activations"} aria-expanded={showAll} onPress={() => setShowAll(!showAll)} style={s.toggle}>
      <Text style={{ color: theme.accent }}>{showAll ? "Show changing activations" : "Show all sampled activations"}</Text>
    </Pressable>
    <Text style={s.status}>BodyGraph sample: {report.representativeUtc}. Other possible times can have different mechanics. The stored analysis is preserved on reopen; it is not an independent astronomical validation.</Text>
  </View>;
}

const s = StyleSheet.create({
  section: { marginVertical: 12, gap: 8 },
  heading: { color: theme.text, fontSize: 18, fontWeight: "600" },
  subheading: { color: theme.text, fontSize: 15, fontWeight: "600", marginTop: 16 },
  text: { color: theme.text, fontSize: 13, lineHeight: 20 },
  warning: { color: theme.uncertain, fontSize: 13, lineHeight: 20 },
  status: { color: theme.muted, fontSize: 11, lineHeight: 18 },
  row: { flexDirection: "row", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  label: { flex: 1, color: theme.muted, fontSize: 12, lineHeight: 20, textTransform: "capitalize" },
  value: { flex: 2, minWidth: 0 },
  toggle: { minHeight: 44, justifyContent: "center", paddingVertical: 10 },
});
