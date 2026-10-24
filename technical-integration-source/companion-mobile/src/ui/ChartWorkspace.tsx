import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { CENTER_NAMES, type Activation, type Person } from "../domain/contracts";
import { BodyGraph, bodyGraphFocusY } from "./BodyGraph";
import { channelInk, GRAPH_HEIGHT, GRAPH_WIDTH } from "./bodygraph-geometry";
import { planetSymbols } from "./planet-symbols";
import { MechanicsInspector } from "./MechanicsInspector";
import { relevantActivations, selectionFromRecord, selectionKey, selectionTitle, type Selection } from "./workspace-model";
import { currentReader, readerKey, readingSelection, type ChartView, type UI01Action, type UI01State } from "./ui01-state";
import { theme } from "./theme";

export function ChartWorkspace({ person, navigation, railWidth, externalRecord, onEdit, onAsk, onKnowledge, onTrace, onOpenLocalReading, active, state, dispatch }: {
  person: Person; navigation: React.ReactNode; railWidth: number; externalRecord: string | null;
  onEdit: () => void; onAsk: () => void; onKnowledge: () => void; onTrace?: () => void; onOpenLocalReading?:()=>void;
  active: boolean; state: UI01State; dispatch: React.Dispatch<UI01Action>;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const desktop = width >= 1151, sideBySide = width >= 840, rail = width >= 1024;
  const [contentHeight, setContentHeight] = useState(0);
  const [planetsOpen,setPlanetsOpen]=useState(false);
  const pageFlow = height < 600 || fontScale >= 1.5 || (contentHeight > 0 && contentHeight < (state.readingLevel === "expanded" ? 440 : 400));
  const full = state.readingLevel === "full";
  const selection = state.committedSelection, reading = readingSelection(state);
  const highlightedSelection = state.preview?.target || selection;
  const reader = currentReader(state), key = readerKey(state);
  const [canvasHeight, setCanvasHeight] = useState(0), [graphWidth, setGraphWidth] = useState(0);
  const canvasScroll = useRef<ScrollView>(null), pageScroll = useRef<ScrollView>(null);
  const opener = useRef<View>(null), compactOpener = useRef<View>(null);
  const browserSteps = useRef(0), suppressPop = useRef(false);
  const previousRoute = useRef({ full: false, depth: 0 });
  const live = useRef(state); live.current = state;
  const activeRef = useRef(active); activeRef.current = active;
  const changeView = useCallback((patch: Partial<ChartView>) => dispatch({ type: "chart", patch }), [dispatch]);
  const graphHover = useCallback((target: Selection | null) => dispatch({ type: "preview", target, origin: "graph" }), [dispatch]);
  const referenceHover = useCallback((target: Selection | null) => dispatch({ type: "preview", target, origin: "reference" }), [dispatch]);
  const select = useCallback((value: Selection) => dispatch({ type: "commit", selection: value }), [dispatch]);
  useEffect(() => {
    const next = externalRecord ? selectionFromRecord(externalRecord) : null;
    if (next) select(next);
  }, [externalRecord, select]);
  useEffect(() => { if (!active) dispatch({ type: "clear-preview" }); }, [active, dispatch]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const previous = previousRoute.current;
    if (full && (!previous.full || state.fullHistory.length > previous.depth)) {
      window.history.pushState({ auricReading: true, scope: state.scopeKey, depth: state.fullHistory.length }, ""); browserSteps.current++;
    }
    if (!full && previous.full && browserSteps.current) {
      suppressPop.current = true; window.history.go(-browserSteps.current); browserSteps.current = 0;
    }
    previousRoute.current = { full, depth: state.fullHistory.length };
  }, [full, state.fullHistory.length, state.scopeKey]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const back = (event: PopStateEvent) => {
      if (suppressPop.current) { suppressPop.current = false; return; }
      if (!activeRef.current) return;
      if (event.state?.auricReading && event.state.scope === live.current.scopeKey && event.state.depth === live.current.fullHistory.length) return;
      if (live.current.readingLevel === "full") { browserSteps.current = Math.max(0, browserSteps.current - 1); dispatch({ type: "back" }); }
    };
    const clear = (event: KeyboardEvent) => { if (event.key === "Escape") dispatch({ type: "clear-preview" }); };
    const clearAll = () => dispatch({ type: "clear-preview" });
    const touch = (event: PointerEvent) => { if (event.pointerType !== "mouse") clearAll(); };
    window.addEventListener("popstate", back); window.addEventListener("keydown", clear);
    window.addEventListener("blur", clearAll); window.addEventListener("pointerdown", touch, true);
    return () => {
      window.removeEventListener("popstate", back); window.removeEventListener("keydown", clear); window.removeEventListener("blur", clearAll); window.removeEventListener("pointerdown", touch, true);
      if (browserSteps.current) { window.history.go(-browserSteps.current); browserSteps.current = 0; }
    };
  }, [dispatch]);
  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (active && full) { dispatch({ type: "back" }); return true; } return false;
    }); return () => handler.remove();
  }, [active, full, dispatch]);
  useEffect(() => {
    if (full || !active) return;
    const frame = requestAnimationFrame(() => {
      canvasScroll.current?.scrollTo({ y: state.chartView.canvasScrollY, animated: false });
      pageScroll.current?.scrollTo({ y: state.chartView.pageScrollY, animated: false });
      if (state.restoreRevision) {
        const node = state.readingLevel === "compact" ? compactOpener.current : opener.current;
        if (Platform.OS === "web") (node as unknown as HTMLElement | null)?.focus?.();
      }
    }); return () => cancelAnimationFrame(frame);
  }, [full, active, state.restoreRevision, state.readingLevel, canvasHeight, graphWidth, pageFlow]);
  const selectedActivationIds = new Set(relevantActivations(highlightedSelection, person.facts).map(a => a.id));
  const activation = (a: Activation): Selection => ({ kind: "gate", gate: a.gate, line: a.line, activationId: a.id });
  function activationColumn(side: Activation["side"]) {
    const compact = width < 1220, color = channelInk[side];
    return <View testID={`activation-column-${side}`} style={[s.activationColumn, compact && { width: 52 }]}>
      <Text style={[s.sideTitle, { color }, compact && { fontSize: 9 }]}>{side === "design" ? "Design" : "Personality"}</Text>
      {person.facts.activations.filter(a => a.side === side).map(a => <Pressable key={a.id} accessibilityRole="button"
        accessibilityLabel={`Select ${side} ${a.planet} ${a.gate}.${a.line}`}
        {...{ title: `${side} ${a.planet}: Gate ${a.gate}.${a.line} (${CENTER_NAMES[a.center]} Center)${a.boundaryRisk ? " (near Line boundary)" : ""}` }}
        accessibilityState={{ selected: highlightedSelection.kind !== "chart" && selectedActivationIds.has(a.id) }}
        onPress={() => select(activation(a))} onHoverIn={() => referenceHover(activation(a))} onHoverOut={() => referenceHover(null)}
        onFocus={() => referenceHover(activation(a))} onBlur={() => referenceHover(null)}
        style={[s.activation, highlightedSelection.kind !== "chart" && selectedActivationIds.has(a.id) && s.activationSelected]}>
        <Text style={[s.planet, { color }]}>{planetSymbols[a.planet] || a.planet}</Text>
        <Text style={[s.number, { color }]}>{a.gate}.{a.line}{(person.facts.timeWindowAnalysis?.activations.find(v => v.id === a.id)?.values.length || 0) > 1 ? "?" : a.boundaryRisk ? "*" : ""}</Text>
      </Pressable>)}
    </View>;
  }
  const available = width - (rail ? railWidth : 0);
  const panelWidth = state.readingLevel === "compact" ? desktop ? Math.min(360, Math.max(300, available * .24)) : 280
    : desktop ? Math.min(520, Math.max(380, available * .4)) : Math.min(400, Math.max(320, available * .4));
  const usableHeight = contentHeight || height - 200;
  const readingHeight = state.readingLevel === "compact" ? Math.min(220, Math.max(160, usableHeight * .4)) : Math.min(usableHeight - 240, usableHeight * .55);
  const graphHeight = state.chartView.fitWhole ? Math.max(120, Math.min(820, (canvasHeight || height - 380) - 230)) : Math.max(260, graphWidth * GRAPH_HEIGHT / GRAPH_WIDTH);
  const inspector = <MechanicsInspector key={`${key}/${state.restoreRevision}`} person={person} selection={reading}
    onSelect={select} onHover={referenceHover} view={reader.view}
    onView={view => dispatch({ type: "reader", key, patch: { view, scrollY: 0 } })}
    readingLevel={state.readingLevel} readerState={reader} pageFlow={pageFlow && !full}
    onReaderState={patch => dispatch({ type: "reader", key, patch })} />;
  const action = (label: string, onPress: () => void, ref?: React.RefObject<View | null>) => <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.action}><Text style={s.actionText}>{label}</Text></Pressable>;
  const readingPanel = <View testID={sideBySide ? "desktop-inspector" : "mobile-inspector"}
    style={[s.inspector, sideBySide && !pageFlow ? { width: panelWidth, borderLeftWidth: 1 } : pageFlow ? { minHeight: 280 } : { height: readingHeight, maxHeight: state.readingLevel === "compact" ? 240 : undefined }]}>
    <View style={s.actions}>
      {onOpenLocalReading&&action("Personal reading",onOpenLocalReading)}
      {state.readingLevel === "compact" ? action("Expand reading", () => dispatch({ type: "level", level: "expanded" })) : action("Compact overview", () => dispatch({ type: "level", level: "compact" }))}
      {action("Full Reading", () => dispatch({ type: "full", opener: state.readingLevel }), state.readingLevel === "compact" ? compactOpener : opener)}
    </View>
    {pageFlow && action("Back to chart", () => pageScroll.current?.scrollTo({ y: 0, animated: false }))}
    {inspector}
  </View>;
  const chartContent = <View style={[s.content, sideBySide && !pageFlow && { flexDirection: "row" }, pageFlow && { flex: undefined }]}>
    <View testID="visualization-zone" style={[s.visualization, pageFlow && { height: 560, minHeight: 280, flex: undefined }]}
      onLayout={e => { if (!full && active && e.nativeEvent.layout.height > 0) setCanvasHeight(e.nativeEvent.layout.height); }}>
      <View style={s.canvasBar}><Text style={s.canvasTitle}>BODYGRAPH</Text>
        {!sideBySide&&action(planetsOpen?"Hide planets":"Planetary activations",()=>setPlanetsOpen(v=>!v))}
        <Pressable accessibilityRole="button" accessibilityLabel={state.chartView.fitWhole ? "Enlarge chart" : "Fit whole chart"}
          onPress={() => changeView({ fitWhole: !state.chartView.fitWhole, zoom: 1, center: { x: .5, y: .5 }, canvasScrollY: 0 })} style={s.action}>
          <Text style={s.actionText}>{state.chartView.fitWhole ? "Enlarge" : "Fit whole"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Locate selection on chart" onPress={() => changeView({ zoom: Math.max(1.5, state.chartView.zoom), center: { x: .5, y: Math.max(.2, Math.min(.8, bodyGraphFocusY(selection, person.facts))) }, focusOrigin: selectionKey(selection) })} style={s.action}><Text style={s.actionText}>Locate</Text></Pressable>
      </View>
      <ScrollView ref={canvasScroll} onScroll={e => changeView({ canvasScrollY: e.nativeEvent.contentOffset.y })} scrollEventThrottle={64} contentContainerStyle={s.canvasScroll}>
        <View style={s.graphRow}>{(sideBySide||planetsOpen)&&activationColumn("design")}
          <BodyGraph chart={person.facts} selection={highlightedSelection} focus={selection} previewing={!!state.preview}
            onSelect={select} onHover={graphHover} fitWhole={state.chartView.fitWhole} onCanvasWidth={w => { if (w > 0 && !full) setGraphWidth(w); }}
            height={graphHeight} chartView={state.chartView} onChartView={changeView} />
          {(sideBySide||planetsOpen)&&activationColumn("personality")}</View>
        <Text style={s.chartLegend}>Design: green / Personality: blue / Both: split ribbon</Text>
        {person.facts.timeWindowAnalysis && <Text style={s.warning}>? Gate/Line changes within the sampled birth-time window. All plotted mechanics belong to one illustrative sample.</Text>}
      </ScrollView>
    </View>{!full && readingPanel}
  </View>;
  return <View testID="chart-workspace" style={[s.workspace, !active && { display: "none" }]}
    {...(Platform.OS === "web" ? { dataSet: { readingLevel: state.readingLevel, selection: selectionKey(reading), chartView: JSON.stringify(state.chartView) } } : {})}>
    {active && rail && navigation}<View style={s.main}>
      <View style={s.context}><View style={{ flex: 1, minWidth: 0 }}><Text style={s.name}>{person.birth.name}</Text>
        <Text style={s.contextText}>{person.facts.profile} {person.facts.type} · {person.facts.authority} Authority · {person.facts.definition}</Text>
        {person.facts.timeWindowAnalysis ? action("Birth-time stability", () => { select({ kind: "chart" }); dispatch({ type: "level", level: "expanded" }); dispatch({ type: "reader", key: `${state.scopeKey}/expanded/{\"kind\":\"chart\"}`, patch: { view: "Overview" } }); }) : person.birth.confidence !== "exact" && <Text style={s.warning}>Provisional / approximate birth time</Text>}
      </View><Pressable accessibilityRole="button" accessibilityLabel="Ask your chart" onPress={onAsk} style={s.icon}><Feather name="message-circle" size={18} color={theme.muted} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit birth record" onPress={onEdit} style={s.icon}><Feather name="edit-2" size={18} color={theme.muted} /></Pressable></View>
      <View style={[s.content, full && { display: "none" }]} onLayout={e => { if (!full && active && e.nativeEvent.layout.height > 0) setContentHeight(e.nativeEvent.layout.height); }} pointerEvents={full ? "none" : "auto"} accessibilityElementsHidden={full} importantForAccessibility={full ? "no-hide-descendants" : "auto"}>
        <ScrollView ref={pageScroll} scrollEnabled={pageFlow} contentContainerStyle={pageFlow ? undefined : { flex: 1 }} onScroll={e => { if (pageFlow) changeView({ pageScrollY: e.nativeEvent.contentOffset.y }); }} scrollEventThrottle={64}>{chartContent}</ScrollView>
      </View>
      {full && <View testID="full-reading-screen" style={s.full}><View style={s.actions}>
        {action("Return to chart", () => dispatch({ type: "return" }))}
        {state.fullHistory.length > 0 && action("Back in reading", () => { if (Platform.OS === "web") window.history.back(); else dispatch({ type: "back" }); })}
        {action("Ask about this reading", onAsk)}{action("Knowledge for this reading", onKnowledge)}{onTrace && action("Mechanics Trace", onTrace)}
      </View><Text style={s.scope}>{person.birth.name} / {selectionTitle(reading, person.facts).subtitle}</Text>{inspector}</View>}
    </View>
  </View>;
}
const s = StyleSheet.create({
  workspace: { flex: 1, flexDirection: "row", minHeight: 0 }, main: { flex: 1, minWidth: 0 },
  context: { paddingHorizontal: 14, paddingVertical: 8, minHeight: 70, borderBottomWidth: 1, borderColor: theme.border, flexDirection: "row", gap: 6, alignItems: "center" },
  name: { color: theme.text, fontSize: 18, fontWeight: "600", lineHeight: 25 }, contextText: { color: theme.muted, fontSize: 12, lineHeight: 20 },
  warning: { color: theme.uncertain, fontSize: 16, lineHeight: 23 }, icon: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, minHeight: 0 }, visualization: { flex: 1, minWidth: 0, minHeight: 240 },
  canvasBar: { paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  canvasTitle: { color: theme.text, fontSize: 11, fontWeight: "600" }, canvasScroll: { paddingHorizontal: 8, paddingBottom: 12, flexGrow: 1 },
  chartLegend: { color: theme.muted, fontSize: 11, lineHeight: 18, textAlign: "center", paddingTop: 6 }, graphRow: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  inspector: { borderColor: theme.border, borderTopWidth: 1, minHeight: 0, backgroundColor: theme.surface },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: theme.border },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 6, justifyContent: "center" }, actionText: { color: theme.accent, fontSize: 16, lineHeight: 23 },
  activationColumn: { width: 76, paddingTop: 48, gap: 2, flexShrink: 0 }, sideTitle: { fontSize: 11, lineHeight: 16, textAlign: "center" },
  activation: { minHeight: 44, minWidth: 44, borderLeftWidth: 2, borderColor: "transparent", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 3, paddingHorizontal: 2 },
  activationSelected: { borderColor: theme.calculated, backgroundColor: theme.surface }, planet: { fontSize: 17, width: 17, textAlign: "center" }, number: { fontSize: 11, fontWeight: "500", fontVariant: ["tabular-nums"], flexShrink: 1 },
  full: { flex: 1, width: "100%", maxWidth: 760, alignSelf: "center", minHeight: 0 }, scope: { fontSize: 16, lineHeight: 23, color: theme.muted, paddingHorizontal: 16, paddingVertical: 8 },
});
