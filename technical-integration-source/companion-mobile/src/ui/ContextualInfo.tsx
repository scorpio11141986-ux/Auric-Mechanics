import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, findNodeHandle, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { CompositeCalculationV1 } from "../domain/composite-contracts";
import { resolveContextInfo, type ContextInfo, type ContextInfoTarget } from "../intelligence/contextual-reader-info";
import { theme } from "./theme";

export type { ContextInfoTarget } from "../intelligence/contextual-reader-info";
let activeDismiss: (() => void) | null = null;

export function ContextInfoButton({ calculation, names, target, label }: {
  calculation: CompositeCalculationV1; names: Record<string, string>; target: ContextInfoTarget; label?: string;
}) {
  const [open, setOpen] = useState(false), trigger = useRef<any>(null), opener = useRef<HTMLElement | null>(null);
  const dismiss = useCallback(() => setOpen(false), []);
  const info = useMemo(() => {
    try { return resolveContextInfo(calculation, target, names); }
    catch { return null; } // Unissued or stale targets have no explanatory authority.
  }, [calculation, target.kind, target.id, target.graphId, names]);
  const key = `${calculation.calculationId}:${target.graphId||"combined"}:${target.kind}:${target.id}`;
  useEffect(() => { setOpen(false); }, [key]);
  useEffect(() => () => { if (activeDismiss === dismiss) activeDismiss = null; }, [dismiss]);
  const visibleLabel = label ?? (target.kind === "channel" ? info?.title : undefined);
  const name = `Explain ${info?.title || "unavailable chart context"}${label ? ` - ${label}` : ""}`;
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={name} disabled={!info}
      accessibilityState={{ disabled: !info, expanded: open }} onPress={() => {
        activeDismiss?.(); activeDismiss = dismiss;
        opener.current = trigger.current;
        setOpen(true);
      }} style={({ focused }: any) => [s.info, !!visibleLabel && s.labeledInfo, focused && { borderColor: theme.accent }, !info && { opacity: .5 }]}>
      {!!visibleLabel && <Text style={[s.text, { flexShrink: 1 }]}>{visibleLabel}</Text>}
      <Text aria-hidden style={s.glyph}>{"\u24d8"}</Text>
    </Pressable>
    {open && info && <ContextInfoSheet key={key} info={info} onClose={dismiss} opener={opener} />}
  </>;
}

function ContextInfoSheet({ info, onClose, opener }: { info: ContextInfo; onClose: () => void; opener: React.RefObject<HTMLElement | null> }) {
  const { width } = useWindowDimensions(), close = useRef<any>(null), sheet = useRef<any>(null);
  const [advanced, setAdvanced] = useState(false);
  const [chartOpen,setChartOpen]=useState(false),[evidenceOpen,setEvidenceOpen]=useState(false);
  const focusClose = useCallback(() => {
    if (Platform.OS === "web") close.current?.focus({ preventScroll: true });
    else { const handle = findNodeHandle(close.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle); }
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web") return () => {
      if (activeDismiss === onClose) activeDismiss = null;
      const handle = findNodeHandle(opener.current as any);
      if (!activeDismiss && handle) AccessibilityInfo.setAccessibilityFocus(handle);
    };
    const frame = requestAnimationFrame(focusClose);
    const controls = () => [...(sheet.current as HTMLElement)?.querySelectorAll<HTMLElement>('button, [tabindex="0"], a[href], input, select, textarea') || []]
      .filter(n => !n.hasAttribute("disabled") && n.getAttribute("aria-disabled") !== "true" && n.getClientRects().length > 0);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
      if (e.key === "Tab") {
        const nodes = controls(), first = nodes[0], last = nodes.at(-1), current = document.activeElement;
        if (!first) { e.preventDefault(); focusClose(); }
        else if (!sheet.current?.contains(current) || e.shiftKey && current === first || !e.shiftKey && current === last) {
          e.preventDefault(); (e.shiftKey ? last : first)?.focus({ preventScroll: true });
        }
      }
    };
    const retainFocus = (e: FocusEvent) => { if (!sheet.current?.contains(e.target as Node)) focusClose(); };
    document.addEventListener("keydown", key, true); document.addEventListener("focusin", retainFocus, true);
    return () => {
      cancelAnimationFrame(frame); document.removeEventListener("keydown", key, true); document.removeEventListener("focusin", retainFocus, true);
      if (activeDismiss === onClose) activeDismiss = null;
      const target = opener.current;
      requestAnimationFrame(() => { if (!activeDismiss && target?.isConnected) target.focus({ preventScroll: true }); });
    };
  }, [focusClose, onClose, opener]);
  return <Modal transparent animationType="none" onRequestClose={onClose} onShow={focusClose}>
    <View style={[s.overlay, { justifyContent: width < 600 ? "flex-end" : "center" }]}>
      <Pressable accessible={false} importantForAccessibility="no" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View ref={sheet} testID="context-info" accessibilityViewIsModal role="dialog" aria-modal aria-label={info.title}
        style={[s.sheet, { borderRadius: width < 600 ? 8 : 6 }]}>
        <View style={s.row}><Text accessibilityRole="header" style={[s.heading, { flex: 1 }]}>{info.title}</Text>
          <Pressable ref={close} accessibilityRole="button" accessibilityLabel="Close contextual info" onPress={onClose} style={s.button}><Text style={s.text}>Close</Text></Pressable></View>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={s.heading}>Meaning</Text>
          {info.activationKey&&<Text testID="context-meaning-unavailable" style={s.small}>Planet-by-Gate.Line interpretation is not approved yet. Calculated context only, not a synthesized planetary reading.</Text>}
          <Text style={s.text}>{info.meaning}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="In this chart" accessibilityState={{expanded:chartOpen}} onPress={()=>setChartOpen(v=>!v)} style={s.disclosure}><Text style={s.text}>In this chart {chartOpen?"-":"+"}</Text></Pressable>
          {chartOpen&&<Text testID="context-chart-detail" style={s.text}>{info.inThisChart}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel="Evidence" accessibilityState={{expanded:evidenceOpen}} onPress={()=>setEvidenceOpen(v=>!v)} style={s.disclosure}><Text style={s.text}>Evidence {evidenceOpen?"-":"+"}</Text></Pressable>
          {evidenceOpen&&<View testID="context-evidence-detail" style={{gap:8}}>{info.evidence.map((value, i) => <Text key={i} style={s.text}>{value}</Text>)}</View>}
          <Pressable accessibilityRole="button" accessibilityLabel="Technical records and source status" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(v => !v)} style={s.button}>
            <Text style={s.text}>{advanced ? "Hide" : "Show"} technical records and source status</Text>
          </Pressable>
          {advanced && <View testID="context-info-advanced" style={{ gap: 10 }}>
            <Text style={s.small}>Status: {info.advanced.status}</Text>
            {info.advanced.notes.map(t => <Text key={t} style={s.text}>{t}</Text>)}
            <Text accessibilityRole="header" style={s.heading}>Full chart context</Text>
            {info.advanced.context.map((t, i) => <Text key={i} style={s.text}>{t}</Text>)}
            <Text accessibilityRole="header" style={s.heading}>All supporting contributions</Text>
            {info.advanced.evidence.map((t, i) => <Text key={i} style={s.text}>{t}</Text>)}
            <Text style={s.small}>Explainer {info.explainerId}{"\n"}Calculation {info.calculationId}{"\n"}Facts hash {info.advanced.factsHash}</Text>
            {info.advanced.inputRefs.map(r => <Text key={r.personId} style={s.small}>Participant {r.personId}{"\n"}Chart {r.chartVersionId}{"\n"}Snapshot {r.snapshotHash}</Text>)}
            {info.advanced.activationKeys.map(k => <Text key={k.contributionId} style={s.small}>Contribution {k.contributionId}{"\n"}Activation {k.activationId} | {k.personId} | {k.side} | {k.planetKey} | repeated index {k.repeatedIndex} | {k.lineStatus}</Text>)}
            {info.factIds.map(id => <Text key={id} style={s.small}>Fact {id}</Text>)}
            {info.witnessIds.map(id => <Text key={id} style={s.small}>Actual witness {id}</Text>)}
            {info.advanced.sources.map(source => <Text key={source.id} style={s.small}>Canonical record {source.id} | catalog {source.catalogVersion} | {source.available ? "identity present; symbolic publication not cleared" : "unavailable"}</Text>)}
          </View>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", backgroundColor: "rgba(0,0,0,.55)" },
  sheet: { width: "100%", maxWidth: 720, maxHeight: "88%", backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, flexShrink: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 }, content: { gap: 12, padding: 16 },
  heading: { color: theme.text, fontSize: 18, fontWeight: "700", lineHeight: 26, flexShrink: 1 },
  text: { color: theme.text, fontSize: 16, lineHeight: 25, flexShrink: 1 },
  small: { color: theme.muted, fontSize: 13, lineHeight: 21, overflowWrap: "anywhere" } as any,
  button: { minHeight: 44, minWidth: 44, padding: 10, borderWidth: 1, borderColor: theme.border, borderRadius: 4, justifyContent: "center" },
  disclosure:{minHeight:44,justifyContent:"center",borderBottomWidth:1,borderColor:theme.border},
  info: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent", borderRadius: 4, flexShrink: 0 },
  labeledInfo: { width: "auto", height: "auto", minWidth: 44, minHeight: 44, flexDirection: "row", gap: 6, paddingHorizontal: 6, flexShrink: 1, maxWidth: "100%" },
  glyph: { color: theme.muted, fontSize: 20 },
});
