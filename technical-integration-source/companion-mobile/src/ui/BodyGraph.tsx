import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Modal, ScrollView, PanResponder, Platform, Pressable, View, Text, StyleSheet } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import Svg, { G, Path, Circle, Defs, ClipPath, Text as SvgText } from "react-native-svg";
import { CENTER_NAMES, type CenterId, type HumanDesignFactsV1 } from "../domain/contracts";
import { byId, centerId, gateId, gates, runtime } from "../content/records";
import { highlightFor, relevantActivations, type Selection } from "./workspace-model";
import {
  GRAPH_WIDTH, GRAPH_HEIGHT, centerShapes, gatePorts, gatePaths,
  channelGeometry, integrationChannels, integrationPaths,
  activationInk, channelInk, gateInkPartition, gateInkAxis, halfPlane, integrationAxis,
  type ActivationInk, type Point,
} from "./bodygraph-geometry";
import { theme } from "./theme";
import { HoverPortal } from "./HoverPortal";
import type { ChartView } from "./ui01-state";
import { gateRef, channelRef } from "../intelligence/mechanics-references";

const labels: Record<CenterId, { text: string; x?: number; y?: number }> = {
  Head: { text: "HEAD" }, Ajna: { text: "THIRD EYE" },
  Throat: { text: "THROAT" }, G: { text: "IDENTITY" },
  Ego: { text: "EGO", x: 599, y: 823 },
  Spleen: { text: "SPLEEN", x: 57, y: 979 },
  SolarPlexus: { text: "EMOTION", x: 790, y: 979 },
  Sacral: { text: "SACRAL" }, Root: { text: "ROOT" },
};
const colors: Record<CenterId, string> = {
  Head: "#d6c47a", Ajna: "#81a595", Throat: "#bb947d", G: "#d6c47a",
  Ego: "#c77c80", Spleen: "#bb947d", SolarPlexus: "#bb947d",
  Sacral: "#c77c80", Root: "#bb947d",
};
const hoverAccent = "#efc66b";
type Layer = "Centers" | "Channels" | "Gates";
const GraphGesture = createContext({ cancelled: false });

function InkPath({ id, path, ink, direction, pivot, opacity = 1 }: {
  id: string; path: string; ink: ActivationInk; direction: Point; pivot?: Point; opacity?: number;
}) {
  if (ink === "none") return null;
  const color = ink === "design" ? channelInk.design : channelInk.personality;
  const gate = Number(id.split("-").at(-1));
  const partition = pivot ? { pivot, direction } : gateInkPartition(gate);
  return <G id={`bodygraph-ink-group-${id}`} pointerEvents="none" opacity={opacity}>
    <Path id={`bodygraph-ink-${id}`} d={path} fill={color} stroke="none" />
    {ink === "both" && <>
      <Defs>
        <ClipPath id={`bodygraph-design-half-${id}`}>
          <Path d={halfPlane(partition.pivot, partition.direction, -1)} />
        </ClipPath>
      </Defs>
      {/* The opaque base prevents background bleed at the shared antialiased boundary. */}
      <Path id={`bodygraph-dual-${id}`} d={path} fill={channelInk.design}
        clipPath={`url(#bodygraph-design-half-${id})`} stroke="none" />
    </>}
  </G>;
}

export function bodyGraphFocusY(selection: Selection, chart: HumanDesignFactsV1) {
  if (selection.kind === "gate") return gatePorts[selection.gate].y / GRAPH_HEIGHT;
  const centers = highlightFor(selection, chart).centers;
  return centers.length
    ? centers.reduce((sum, center) => sum + centerShapes[center].y, 0) / centers.length / GRAPH_HEIGHT
    : 0.5;
}

// The partial sheet keeps an unzoomed topology reference, independent of main-canvas pan.
export function BodyGraphOverview({ chart, selection }: { chart: HumanDesignFactsV1; selection: Selection }) {
  const highlighted = highlightFor(selection, chart);
  return <View testID="bodygraph-overview" accessibilityLabel="Whole chart overview with selected structure" style={{ width: 68, height: 104 }}>
    <Svg viewBox={`-40 -40 ${GRAPH_WIDTH + 80} ${GRAPH_HEIGHT + 80}`} width="100%" height="100%">
      {channelGeometry.map(({ channel, path }) => <Path key={channel.id} id={`overview-channel-${channel.id}`}
        d={path} fill="none" stroke={highlighted.channels.includes(channel.id) ? theme.text : channelInk.inactive} strokeWidth={12} />)}
      {chart.centers.map((center) => <Path key={center.id} id={`overview-center-${center.id}`}
        d={centerShapes[center.id].path} fill={center.defined ? colors[center.id] : "#e9eeea"}
        stroke={highlighted.centers.includes(center.id) ? theme.text : channelInk.edge} strokeWidth={12} />)}
      {highlighted.gates.map((gate) => <Circle key={gate} id={`overview-gate-${gate}`} cx={gatePorts[gate].x} cy={gatePorts[gate].y} r={22} fill={theme.text} />)}
    </Svg>
  </View>;
}

function Interactive({ label, selected, onSelect, onHover, children, passive = false, hoverable = false, onPassiveSelect }: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  onHover: (value: boolean, event?: React.MouseEvent) => void;
  children: React.ReactNode;
  passive?: boolean;
  hoverable?: boolean;
  onPassiveSelect?: () => void;
}) {
  const canvasGesture = useContext(GraphGesture);
  const gesture = useRef({ x: 0, y: 0, cancelled: false });
  const pointerHandlers = {
    onPointerDown: (event: React.PointerEvent) => {
      gesture.current = { x: event.clientX, y: event.clientY, cancelled: false };
      if (event.pointerType !== "mouse") onHover(false);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (event.buttons && Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 10) gesture.current.cancelled = true;
    },
    onPointerCancel: () => { gesture.current.cancelled = true; onHover(false); },
  };
  const commit = () => { if (!gesture.current.cancelled && !canvasGesture.cancelled) onSelect(); };
  if (passive) return Platform.OS === "web"
    ? React.createElement("g", {
      role: "img", "aria-label": label, "data-highlighted": selected,
      onMouseMove: hoverable ? (event: React.MouseEvent) => { if (!event.buttons && !(event.nativeEvent as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } }).sourceCapabilities?.firesTouchEvents) onHover(true, event); } : undefined,
      onMouseLeave: hoverable ? () => onHover(false) : undefined,
      ...pointerHandlers,
      onClick: hoverable ? () => { if (!gesture.current.cancelled && !canvasGesture.cancelled) onPassiveSelect?.(); } : undefined,
      style: { pointerEvents: hoverable ? "auto" : "none" },
    }, children)
    : <G pointerEvents="none" accessibilityLabel={label}>{children}</G>;
  // RN-web maps role=button to HTML; SVG requires a real focusable group.
  if (Platform.OS === "web") return React.createElement("g", {
    role: "button", tabIndex: 0, "aria-label": label, "aria-pressed": selected,
    ...pointerHandlers,
    onClick: commit, onMouseMove: (event: React.MouseEvent) => { if (!event.buttons && !(event.nativeEvent as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } }).sourceCapabilities?.firesTouchEvents) onHover(true, event); }, onMouseLeave: () => onHover(false),
    onFocus: () => onHover(true), onBlur: () => onHover(false),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        gesture.current.cancelled = false; canvasGesture.cancelled = false; onSelect();
      }
    },
    style: { cursor: "pointer" },
  }, React.createElement("title", null, label), children);
  return <G onPress={commit} accessibilityLabel={label + (selected ? ", selected" : "")}>{children}</G>;
}

export function BodyGraph({ chart, selection, focus, previewing = false, onSelect, onHover, height = 620, fitWhole = false, onCanvasWidth, chartView, onChartView, showControls = true }: {
  chart: HumanDesignFactsV1;
  selection: Selection;
  focus: Selection;
  previewing?: boolean;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection | null) => void;
  height?: number;
  fitWhole?: boolean;
  onCanvasWidth?: (width: number) => void;
  chartView: ChartView;
  onChartView: (patch: Partial<ChartView>) => void;
  showControls?: boolean;
}) {
  const layer = chartView.layer;
  const setLayer = (layer: Layer) => onChartView({ layer });
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [picker, setPicker] = useState<"Gates" | "Channels" | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(GRAPH_WIDTH);
  const zoom = chartView.zoom;
  const pan = { x: chartView.center.x * GRAPH_WIDTH, y: chartView.center.y * GRAPH_HEIGHT };
  const setPan = (point: Point) => onChartView({ center: { x: point.x / GRAPH_WIDTH, y: point.y / GRAPH_HEIGHT } });
  const setZoom = (value: number) => onChartView({ zoom: value, center: {
    x: Math.max(1 / (2 * value), Math.min(1 - 1 / (2 * value), chartView.center.x)),
    y: Math.max(1 / (2 * value), Math.min(1 - 1 / (2 * value), chartView.center.y)),
  } });
  const [hoverGate, setHoverGate] = useState<{ gate: number; x: number; y: number } | null>(null);
  const canvasGesture = useRef({ cancelled: false });
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const points = new Map<number, { x: number; y: number }>();
    const down = (event: PointerEvent) => {
      if (!(event.target as Element)?.closest?.('[data-testid="bodygraph-canvas"]')) return;
      if (!points.size) canvasGesture.current.cancelled = false;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.size > 1) canvasGesture.current.cancelled = true;
    };
    const move = (event: PointerEvent) => {
      const start = points.get(event.pointerId);
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) canvasGesture.current.cancelled = true;
    };
    const end = (event: PointerEvent) => { points.delete(event.pointerId); };
    const cancel = (event: PointerEvent) => { canvasGesture.current.cancelled = true; end(event); };
    window.addEventListener("pointerdown", down, true); window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true); window.addEventListener("pointercancel", cancel, true);
    return () => { window.removeEventListener("pointerdown", down, true); window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", end, true); window.removeEventListener("pointercancel", cancel, true); };
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const clear = () => { setHoverGate(null); onHover(null); };
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    window.addEventListener("blur", clear);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") clear(); };
    const touch = (event: PointerEvent) => { if (event.pointerType !== "mouse") clear(); };
    window.addEventListener("keydown", escape); window.addEventListener("pointerdown", touch, true);
    return () => { window.removeEventListener("scroll", clear, true); window.removeEventListener("resize", clear); window.removeEventListener("blur", clear); window.removeEventListener("keydown", escape); window.removeEventListener("pointerdown", touch, true); };
  }, [onHover]);
  const clamp = (x: number, y: number) => ({
    x: Math.max(GRAPH_WIDTH / (2 * zoom), Math.min(GRAPH_WIDTH - GRAPH_WIDTH / (2 * zoom), x)),
    y: Math.max(GRAPH_HEIGHT / (2 * zoom), Math.min(GRAPH_HEIGHT - GRAPH_HEIGHT / (2 * zoom), y)),
  });
  const drag = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => zoom > 1 && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 12,
    onPanResponderRelease: (_, gesture) => {
      canvasGesture.current.cancelled = true;
      const scale = Math.min(canvasWidth / GRAPH_WIDTH, height / GRAPH_HEIGHT) * zoom;
      setPan(clamp(pan.x - gesture.dx / scale, pan.y - gesture.dy / scale));
    },
  });
  useEffect(() => {
    setIntegrationOpen(false);
    setHoverGate(null);
  }, [focus]);
  const highlighted = highlightFor(selection, chart);
  const gateInk = (gate: number) => activationInk([gate], chart.activations);
  const contextualFocus = selection.kind !== "chart" || !!selection.focus;
  const focusColor = previewing ? hoverAccent : theme.text;
  const pickerLayer = picker ?? (layer === "Gates" ? "Gates" : "Channels");
  const [upper, lower] = integrationAxis;
  const trunkDirection = { x: lower.x - upper.x, y: lower.y - upper.y };
  const trunkMid = { x: (upper.x + lower.x) / 2, y: (upper.y + lower.y) / 2 };
  const trunkDivider = { x: trunkDirection.y, y: -trunkDirection.x };
  const activeIntegration = integrationChannels.filter((c) => highlighted.channels.includes(c.id));
  const connectorFocus = {
    GateConnect10: activeIntegration.some((c) => c.gates.includes(10)),
    GateConnect34: activeIntegration.some((c) => c.gates.includes(34)),
    GateSpan: activeIntegration.some((c) => c.gates.some((g) => g === 10 || g === 20) && c.gates.some((g) => g === 34 || g === 57)),
  };
  const focusedBranches = new Set(channelGeometry.filter(({ channel }) => highlighted.channels.includes(channel.id)).flatMap(({ channel }) => channel.gates));
  const gateOpacity = (gate: number) => !contextualFocus || focusedBranches.has(gate) || highlighted.gates.includes(gate) ? 1 : 0.45;
  const trunkFocused = connectorFocus.GateSpan || [10, 20, 34, 57].some(gate => highlighted.gates.includes(gate));
  return (
    <GraphGesture.Provider value={canvasGesture.current}><View style={s.root}>
      {showControls&&<View style={s.layers}>
        {(["Centers", "Channels", "Gates"] as Layer[]).map((value) => (
          <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Chart layer: ${value}`}
            accessibilityState={{ checked: layer === value }}
            onPress={() => { setLayer(value); setIntegrationOpen(false); }}
            style={[s.layer, layer === value && s.selected]}>
            <Text style={[s.caption, layer === value && { color: theme.text }]}>{value}</Text>
          </Pressable>
        ))}
      </View>}
      {showControls&&layer !== "Centers" && <Pressable accessibilityRole="button"
        accessibilityLabel={layer === "Gates" ? "Choose Gate" : "Choose Channel"}
        onPress={() => setPicker(layer)} style={s.choose}>
        <Feather name="list" size={16} color={theme.text} />
        <Text style={s.caption}>{layer === "Gates" ? "Choose Gate" : "Choose Channel"}</Text>
      </Pressable>}
      <View testID="bodygraph-canvas" style={{ width: "100%", height }}
        onTouchStart={event => { if (Platform.OS !== "web") canvasGesture.current.cancelled = event.nativeEvent.touches.length > 1; }}
        onTouchCancel={() => { canvasGesture.current.cancelled = true; }}
        onLayout={(event) => { setCanvasWidth(event.nativeEvent.layout.width); onCanvasWidth?.(event.nativeEvent.layout.width); }}
        accessibilityLabel="Interactive BodyGraph" {...drag.panHandlers}>
        <Svg viewBox={`${pan.x - GRAPH_WIDTH / (2 * zoom)} ${pan.y - GRAPH_HEIGHT / (2 * zoom)} ${GRAPH_WIDTH / zoom} ${GRAPH_HEIGHT / zoom}`} width="100%" height="100%">
          {runtime.gates.map((gate) => {
            const n = gate.gate_number;
            return <Path key={n} id={`bodygraph-half-${n}`} d={gatePaths[n]}
              fill={channelInk.inactive} stroke={channelInk.edge} strokeWidth={2} />;
          })}

          {(Object.keys(integrationPaths) as (keyof typeof integrationPaths)[]).map((id) => (
            <Path key={id} id={`bodygraph-${id}`} d={integrationPaths[id]}
              fill={channelInk.inactive} stroke={channelInk.edge} strokeWidth={2} />
          ))}
          {runtime.gates.map(({ gate_number: n }) => (
            <InkPath key={n} id={`gate-${n}`} path={gatePaths[n]} ink={gateInk(n)}
              direction={gateInkAxis(n)} opacity={gateOpacity(n)} />
          ))}
          {[10, 34].map((n) => <InkPath key={n} id={`connector-${n}`}
            path={integrationPaths[n === 10 ? "GateConnect10" : "GateConnect34"]} ink={gateInk(n)}
            direction={gateInkAxis(n)} opacity={gateOpacity(n)} />)}
          <Defs>
            <ClipPath id="bodygraph-trunk-upper"><Path d={halfPlane(trunkMid, trunkDivider, -1)} /></ClipPath>
            <ClipPath id="bodygraph-trunk-lower"><Path d={halfPlane(trunkMid, trunkDivider)} /></ClipPath>
          </Defs>
          <G clipPath="url(#bodygraph-trunk-upper)" opacity={!contextualFocus || trunkFocused ? 1 : 0.45}>
            <InkPath id="trunk-upper" path={integrationPaths.GateSpan} ink={activationInk([10, 20], chart.activations)} direction={trunkDirection} pivot={trunkMid} />
          </G>
          <G clipPath="url(#bodygraph-trunk-lower)" opacity={!contextualFocus || trunkFocused ? 1 : 0.45}>
            <InkPath id="trunk-lower" path={integrationPaths.GateSpan} ink={activationInk([34, 57], chart.activations)} direction={trunkDirection} pivot={trunkMid} />
          </G>
          {/* Casing separates this non-junction crossing without adding a selection perimeter. */}
          {[2, 14].filter(n => gateInk(n) !== "none").map(n => <G key={`crossing-${n}`} pointerEvents="none">
            <Path id={`bodygraph-crossing-casing-${n}`} d={gatePaths[n]} fill={channelInk.inactive} stroke={theme.background} strokeWidth={6} />
            <InkPath id={`crossing-${n}`} path={gatePaths[n]} ink={gateInk(n)} direction={gateInkAxis(n)} opacity={gateOpacity(n)} />
          </G>)}
          {channelGeometry.map(({ channel, path, integration }) => (
            <Interactive key={channel.id} passive={layer !== "Channels" || integration}
              label={`Chart ${channelRef(channel.id)}`}
              selected={highlighted.channels.includes(channel.id)}
              onSelect={() => onSelect({ kind: "channel", id: channel.id })}
              onHover={(value) => onHover(value ? { kind: "channel", id: channel.id } : null)}>
              <Path id={`bodygraph-route-${channel.id}`} d={path} fill="none" stroke="transparent" strokeWidth={26} />
            </Interactive>
          ))}
          {layer === "Channels" && (
            <Interactive label="Chart Integration channels" selected={integrationOpen}
              onSelect={() => setIntegrationOpen((value) => !value)} onHover={() => {}}>
              {[10, 20, 34, 57].map((n) => <Path key={n} d={gatePaths[n]} fill="transparent" stroke="transparent" strokeWidth={8} />)}
              <Path d={integrationPaths.GateSpan} fill="transparent" stroke="transparent" strokeWidth={8} />
            </Interactive>
          )}
          {chart.centers.map((c) => {
            const shape = centerShapes[c.id], label = labels[c.id];
            const focused = highlighted.centers.includes(c.id);
            const emphasized = contextualFocus && focused && selection.kind !== "gate" && selection.kind !== "channel";
            const pick: Selection = { kind: "center", id: c.id };
            return (
              <Interactive key={c.id}
                label={`Chart center: ${CENTER_NAMES[c.id]}, ${c.defined ? "defined" : "undefined"}`}
                selected={focused} onSelect={() => onSelect(pick)} onHover={(value) => onHover(value ? pick : null)}>
                <Path id={`bodygraph-center-${c.id}`} d={shape.path}
                  fill={c.defined ? colors[c.id] : "#e9eeea"}
                  stroke={emphasized ? focusColor : c.defined ? colors[c.id] : theme.muted}
                  strokeWidth={emphasized ? 4 : 3} />
                <SvgText fontFamily="sans-serif" x={label.x ?? shape.x} y={label.y ?? shape.y + 5}
                  textAnchor="middle" fontSize={c.id === "Spleen" || c.id === "SolarPlexus" ? 13 : 16}
                  fontWeight="700" fill={theme.background}>{label.text}</SvgText>
              </Interactive>
            );
          })}
          {runtime.gates.map((gate) => {
            const n = gate.gate_number, { x, y } = gatePorts[n];
            const focused = highlighted.gates.includes(n), active = chart.gates.includes(n);
            const emphasized = contextualFocus && focused && (selection.kind === "gate" || selection.kind === "channel" || (selection.kind === "chart" && selection.focus === "profile"));
            const pick: Selection = { kind: "gate", gate: n };
            return (
              <Interactive key={gate.id} passive={layer !== "Gates"} hoverable
                label={`Chart Gate ${n}, ${active ? "active" : "inactive"} · ${gateRef(n)}`} selected={focused}
                onPassiveSelect={() => onSelect({ kind: "center", id: centerId(gate.center) })}
                onSelect={() => { setHoverGate(null); onSelect(pick); }} onHover={(value, event) => {
                  onHover(value ? pick : null);
                  setHoverGate(value && event ? { gate: n, x: event.clientX, y: event.clientY } : null);
                }}>
                {layer === "Gates" && <Circle cx={x} cy={y} r={17} fill="transparent" />}
                <Circle id={`bodygraph-gate-${n}`} cx={x} cy={y} r={12.3}
                  fill={active ? theme.background : "transparent"}
                  stroke={emphasized ? focusColor : active ? "#e9eeea" : "transparent"}
                  strokeWidth={emphasized ? 3 : 2} />
                <SvgText fontFamily="sans-serif" x={x} y={y + 6} textAnchor="middle" fontSize={18}
                  fontWeight={active ? "700" : "500"}
                  fill={active ? theme.text : theme.background}>
                  {n}
                </SvgText>
              </Interactive>
            );
          })}
          {previewing && <G pointerEvents="none" id="bodygraph-preview-decoration">
            {highlighted.channels.map(id => {
              const route = channelGeometry.find(value => value.channel.id === id);
              return route ? <Path key={id} id={`bodygraph-preview-route-${id}`} d={route.path} fill="none" stroke={hoverAccent} strokeWidth={3} strokeDasharray="9 7" /> : null;
            })}
            {highlighted.centers.map(id => <Path key={id} id={`bodygraph-preview-center-${id}`} d={centerShapes[id].path} fill="none" stroke={hoverAccent} strokeWidth={4} strokeDasharray="9 7" />)}
            {highlighted.gates.map(gate => <Circle key={gate} id={`bodygraph-preview-gate-${gate}`} cx={gatePorts[gate].x} cy={gatePorts[gate].y} r={20} fill="none" stroke={hoverAccent} strokeWidth={4} />)}
          </G>}
        </Svg>
      </View>
      {integrationOpen && layer === "Channels" && (
        <View style={s.integrationChoices}>
          {integrationChannels.map((channel) => (
            <Pressable key={channel.id} accessibilityRole="button" accessibilityLabel={`Inspect Integration ${channelRef(channel.id)}`}
              onPress={() => onSelect({ kind: "channel", id: channel.id })}
              style={[s.integrationChoice, highlighted.channels.includes(channel.id) && s.selected]}>
              <Text style={s.caption}>{channel.pair}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {showControls&&<View style={s.zoomControls}>
        {([
          ["Zoom out", "minus", () => setZoom(Math.max(1, zoom - 0.5))],
          ["Reset chart view", "maximize", () => onChartView({ zoom: 1, center: { x: .5, y: .5 } })],
          ["Zoom in", "plus", () => setZoom(Math.min(3, zoom + 0.5))],
          ...(zoom > 1 ? [
            ["Pan left", "arrow-left", () => setPan(clamp(pan.x - 85, pan.y))],
            ["Pan right", "arrow-right", () => setPan(clamp(pan.x + 85, pan.y))],
            ["Pan up", "arrow-up", () => setPan(clamp(pan.x, pan.y - 100))],
            ["Pan down", "arrow-down", () => setPan(clamp(pan.x, pan.y + 100))],
          ] : []),
        ] as [string, React.ComponentProps<typeof Feather>["name"], () => void][]).map(([label, icon, action]) => (
          <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} {...{ title: label }} onPress={action} style={s.zoomButton}>
            <Feather name={icon} size={16} color={theme.muted} />
          </Pressable>
        ))}
      </View>}
      <Modal visible={picker !== null} onRequestClose={() => setPicker(null)} animationType="slide">
        <View style={s.picker} accessibilityViewIsModal>
          <View style={s.pickerHeader}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18 }}>{pickerLayer}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close chart selector" {...{ title: "Close chart selector" }} onPress={() => setPicker(null)} style={s.zoomButton}>
              <Feather name="x" size={20} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.pickerItems}>
            {pickerLayer === "Gates" ? [...runtime.gates].sort((a, b) => a.gate_number - b.gate_number).map((gate) => (
              <Pressable key={gate.id} accessibilityRole="button" accessibilityLabel={`Choose ${gateRef(gate.gate_number)}`}
                accessibilityState={{ selected: selection.kind === "gate" && selection.gate === gate.gate_number }}
                onPress={() => { setPicker(null); onSelect({ kind: "gate", gate: gate.gate_number }); }}
                style={[s.gateChoice, selection.kind === "gate" && selection.gate === gate.gate_number && s.selected]}>
                <Text style={{ color: chart.gates.includes(gate.gate_number) ? theme.text : theme.muted, fontSize: 14 }}>{gate.gate_number}</Text>
              </Pressable>
            )) : runtime.channels.map((channel) => (
              <Pressable key={channel.id} accessibilityRole="button" accessibilityLabel={`Choose ${channelRef(channel.id)}`}
                accessibilityState={{ selected: selection.kind === "channel" && selection.id === channel.id }}
                onPress={() => { setPicker(null); onSelect({ kind: "channel", id: channel.id }); }}
                style={[s.channelChoice, selection.kind === "channel" && selection.id === channel.id && s.selected]}>
                <Text style={{ color: theme.text, fontSize: 14 }}>{channel.pair}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
      {Platform.OS === "web" && hoverGate && (() => {
        const gate = gates.get(hoverGate.gate)!;
        const contributions = relevantActivations({ kind: "gate", gate: hoverGate.gate }, chart);
        const completed = chart.channels.filter(channel => channel.gates.includes(hoverGate.gate));
        const cardWidth = Math.min(290, window.innerWidth - 16);
        return <HoverPortal>{React.createElement("div", { role: "tooltip", ref: (element: HTMLDivElement | null) => {
          if (element) element.style.top = `${Math.max(8, Math.min(window.innerHeight - element.offsetHeight - 8, hoverGate.y + 16))}px`;
        }, style: {
          position: "fixed", zIndex: 100, pointerEvents: "none", boxSizing: "border-box",
          left: Math.max(8, Math.min(window.innerWidth - cardWidth - 8, hoverGate.x + 16)),
          top: Math.max(8, Math.min(window.innerHeight - 228, hoverGate.y + 16)),
          width: cardWidth, padding: 12,
          border: `1px solid ${hoverAccent}`, borderRadius: 4, background: theme.surface,
          color: theme.text, fontFamily: "sans-serif", fontSize: 12, lineHeight: "18px",
        } },
        React.createElement("strong", null, `${gateRef(hoverGate.gate)} / ${gate.display_short_name}`),
        React.createElement("div", null, CENTER_NAMES[centerId(gate.center)]),
        React.createElement("div", { style: { color: contributions.length ? theme.calculated : theme.uncertain, marginTop: 6 } }, contributions.length ? "Activated in this chart" : "Not activated in this chart / reference"),
        contributions.length ? React.createElement("div", null, completed.length ? `Completed Channels: ${completed.map(channel => channelRef(channel.id)).join(" / ")}` : "Hanging Gate / no completed Channel at this Gate") : null,
        React.createElement("div", null, contributions.slice(0, 3).map(a => `${a.side === "design" ? "Design" : "Personality"} ${a.planet} ${gateRef(a.gate,a.boundaryRisk?undefined:a.line)}`).join(" / ")),
        contributions.length > 3 ? React.createElement("div", null, `${contributions.length - 3} more contributions in the Inspector`) : null,
        React.createElement("div", { style: { marginTop: 6 } }, byId.get(gateId(hoverGate.gate))?.fields.mechanical_kernel || ""))}
        </HoverPortal>;
      })()}
    </View></GraphGesture.Provider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, minWidth: 0, gap: 4 },
  zoomControls: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  zoomButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  layers: { flexDirection: "row", alignSelf: "center", width: "100%", maxWidth: 280 },
  layer: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderColor: "transparent" },
  selected: { borderColor: theme.text },
  caption: { color: theme.muted, fontSize: 11 },
  integrationChoices: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  integrationChoice: { minWidth: 64, minHeight: 44, justifyContent: "center", alignItems: "center", borderBottomWidth: 2, borderColor: "transparent" },
  choose: { minHeight: 44, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  picker: { flex: 1, backgroundColor: theme.background, padding: 16 },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginBottom: 12 },
  pickerItems: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 24 },
  gateChoice: { width: 60, height: 52, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 4 },
  channelChoice: { minWidth: 80, height: 52, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border, borderRadius: 4 },
});
