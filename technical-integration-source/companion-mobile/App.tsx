import React, { useEffect, useReducer, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Share,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Feather from "@expo/vector-icons/Feather";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChartWorkspace } from "./src/ui/ChartWorkspace";
import { CompositeWorkspace } from "./src/ui/CompositeWorkspace";
import { ReaderPreferences } from "./src/ui/ReaderPreferences";
import { READER_PREFERENCES_KEY, restoreReaderPreferences, saveReaderPreferences, legacyProfile, migrateReaderPreferences, type ReaderPreferencesV1 } from "./src/intelligence/reader-preferences";
import { initialUI01, readingSelection, ui01Reducer, workspaceScope } from "./src/ui/ui01-state";
import { relevantActivations, selectionTitle } from "./src/ui/workspace-model";
import { theme } from "./src/ui/theme";
import { PRODUCT_NAME } from "./src/ui/brand";
import { BirthLocationInput } from "./src/ui/BirthLocationInput";
import { DisplayTimezone } from "./src/ui/DisplayTimezone";
import { deviceTimeZone, validTimeZone } from "./src/domain/timezones";
import { EvidenceBadge } from "./src/ui/EvidenceBadge";
import { Knowledge } from "./src/ui/Knowledge";
import { SuggestedQuestions } from "./src/ui/SuggestedQuestions";
import { LocalReadingPreview, localReadingEnabled, type LocalReaderTarget } from "./src/ui/LocalReadingPreview";
import { MechanicsTrace } from "./src/ui/MechanicsTrace";
import { makeId } from "./src/domain/birth";
import { analyzeBirthTimeWindow } from "./src/domain/birth-time-analysis";
import {
  type BirthRecordV1,
  type Feedback,
  type Person,
  type SavedQuestion,
} from "./src/domain/contracts";
import {
  byId,
  datasetPin,
  gateId,
  gates,
  runtime,
} from "./src/content/records";
import { detailsFor } from "./src/intelligence/context";
import { createChartAsk } from "./src/intelligence/ask-contract";
import { askRelay } from "./src/intelligence/inference";
import { inferenceDisposition } from "./src/content/inference-policy";
import {
  replacePerson,
} from "./src/persistence/state";
import { emptyCompositeState, readCompositeState, writeCompositeState, saveRelationship, saveRelationshipReading, removeRelationship,
  removePersonAndDependents, exportRelationshipReceipt, type CompositeAppStateV2, type RelationshipV1 } from "./src/persistence/composite-state";
import type { CompositeCalculationV1 } from "./src/domain/composite-contracts";
import type { ReportRequestV1 } from "./src/intelligence/relationship";

const DISPLAY_ZONE_STORAGE = "auric-mechanics:display-timezone:v1";
type Tab = "Chart" | "Compare" | "Knowledge" | "Ask" | "People" | "Profile" | "Reading";
const blankBirth = (): BirthRecordV1 => ({
  schema: "BirthRecordV1",
  id: makeId("person"),
  name: "",
  date: "",
  localTime: "",
  timezone: "",
  latitude: 0,
  longitude: 0,
  place: "",
  confidence: "exact",
  source: "user-entered",
  updatedAt: new Date().toISOString(),
  resolution: { status: "unresolved", originalPlace: "", resolvedPlace: "", coordinateSource: "manual", sourceVersion: null, resolvedAt: new Date().toISOString(), timezoneOverride: false },
});
function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Feather>["name"];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled}
      style={[
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      {icon && (
        <Feather
          name={icon}
          size={16}
          color={secondary ? theme.accent : theme.surface}
        />
      )}
      <Text style={[s.buttonText, secondary && { color: theme.accent }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Choices({
  label,
  values,
  value,
  onChange,
  labels = {},
}: {
  label: string;
  values: string[];
  value: string;
  onChange: (v: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={s.wrap}>
        {values.map((v) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={labels[v] || v}
            aria-checked={v === value}
            accessibilityState={{ checked: v === value }}
            key={v}
            onPress={() => onChange(v)}
            style={[s.choice, v === value && s.chosen]}
          >
            <Text
              style={{
                color: v === value ? theme.accent : theme.muted,
                fontWeight: v === value ? "600" : "400",
              }}
            >
              {labels[v] || v}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  secret = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        secureTextEntry={secret}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          s.input,
          multiline && { minHeight: 92, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
function Detail({
  title,
  children,
  initiallyOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={s.detail}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={s.detailHead}
      >
        <Text style={s.detailTitle}>{title}</Text>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.muted}
        />
      </Pressable>
      {open && <View style={{ paddingBottom: 14 }}>{children}</View>}
    </View>
  );
}
function Copy({ label, text }: { label: string; text: string }) {
  return text ? (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.eyebrow}>{label}</Text>
      <Text selectable style={s.body}>
        {text}
      </Text>
    </View>
  ) : null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Companion />
    </SafeAreaProvider>
  );
}
function Companion() {
  const [state, setState] = useState<CompositeAppStateV2>(emptyCompositeState),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("Chart"),
    [edit, setEdit] = useState<BirthRecordV1 | null>(null);
  const [readerPreferences,setReaderPreferences]=useState<ReaderPreferencesV1|null>(null),[preferencesError,setPreferencesError]=useState("");
  const [compareTarget,setCompareTarget]=useState<{id:string;revision:number}|null>(null);
  const preferenceQueue=useRef<Promise<void>>(Promise.resolve());
  function updateReaderPreferences(p:ReaderPreferencesV1):Promise<void>{
    if(!readerPreferences)return Promise.reject(Error("Stored preferences are unavailable; no overwrite attempted."));
    const operation=preferenceQueue.current.catch(()=>{}).then(async()=>{await saveReaderPreferences(AsyncStorage,p);setReaderPreferences(p);});
    preferenceQueue.current=operation;return operation;
  }
  const interpretationProfile=readerPreferences?legacyProfile(readerPreferences):state.profile;
  const [draft, setDraft] = useState(blankBirth),
    [recordId, setRecordId] = useState<string | null>(null);
  const [question, setQuestion] = useState(""),
    [current, setCurrent] = useState<SavedQuestion | null>(null),
    [trace, setTrace] = useState(false);
  const [busy, setBusy] = useState(false),
    [relayUrl, setRelayUrl] = useState("http://127.0.0.1:8787"),
    [relayToken, setRelayToken] = useState(""),
    [observation, setObservation] = useState("");
  const [birthBusy, setBirthBusy] = useState(false);
  const [pendingPersonDeletion,setPendingPersonDeletion] = useState<string|null>(null);
  const [birthProgress, setBirthProgress] = useState("");
  const birthRequest = useRef<AbortController | null>(null);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const [traceClaim, setTraceClaim] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [displayZone, setDisplayZone] = useState(deviceTimeZone);
  const [displayZoneOverride, setDisplayZoneOverride] = useState(false);
  const queue = useRef(Promise.resolve()),
    selectionRevision = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const aiRequest = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const person =
    state.people.find((p) => p.birth.id === state.activeId) || null;
  const scopeKey = workspaceScope(person);
  const [ui01, dispatchUI01] = useReducer(ui01Reducer, scopeKey, initialUI01);
  useEffect(() => {
    dispatchUI01({ type: "scope", scopeKey });
    aiRequest.current?.abort(); selectionRevision.current++;
  }, [scopeKey]);
  const validWorkspace = ui01.scopeKey === scopeKey ? ui01 : initialUI01(scopeKey);
  const selectedReading = readingSelection(validWorkspace);
  const readingContext = person ? `${selectionTitle(selectedReading, person.facts).subtitle}${selectedReading.kind === "gate" && selectedReading.activationId ? ` / ${relevantActivations(selectedReading, person.facts).map(a => `${a.side} ${a.planet} ${a.gate}.${a.line}`).join("; ")}` : ""}` : "";
  const auxiliaryRoute = useRef(false);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const back = () => {
      if (auxiliaryRoute.current) { auxiliaryRoute.current = false; setTab("Chart"); dispatchUI01({ type: "clear-preview" }); }
    };
    window.addEventListener("popstate", back); return () => window.removeEventListener("popstate", back);
  }, []);
  const [localTarget,setLocalTarget]=useState<LocalReaderTarget|null>(null);
  const [localPairTarget,setLocalPairTarget]=useState<LocalReaderTarget|null>(null);
  function openLocalPerson(id:string){const p=state.people.find(p=>p.birth.id===id);if(!p)return;setState(v=>({...v,activeId:id}));setLocalTarget({participants:[{personId:id,chartVersionId:p.activeChartVersionId||`${id}:${p.birth.updatedAt}`}],selection:id===person?.birth.id?selectedReading:{kind:"chart"},origin:"Chart",nonce:Date.now()});setTab("Reading");}
  const [compareVisited,setCompareVisited]=useState(false);
  useEffect(()=>{if(tab==="Compare")setCompareVisited(true);},[tab]);
  function goTab(next: Tab) {
    if(next==="Reading"&&tab==="Compare"&&localPairTarget){setLocalTarget({...localPairTarget,nonce:Date.now()});setTab("Reading");return;}
    if(next==="Reading"&&tab==="Chart"&&person){openLocalPerson(person.birth.id);return;}
    if (Platform.OS === "web" && person) {
      if ((next === "Ask" || next === "Knowledge") && tab === "Chart" && !auxiliaryRoute.current) {
        window.history.pushState({ auricAuxiliary: next, scope: scopeKey }, ""); auxiliaryRoute.current = true;
      } else if (next !== "Ask" && next !== "Knowledge" && auxiliaryRoute.current) {
        auxiliaryRoute.current = false; window.history.back();
      }
    }
    dispatchUI01({ type: "clear-preview" }); setTab(next);
  }
  const [navTip, setNavTip] = useState<Tab | null>(null);
  const workspace = loaded && !edit && !!person && tab === "Chart";
  const rail = workspace && width >= 1024;
  const mobileNav = workspace ? width < 1024 : width <= 760;
  useEffect(() => {
    AsyncStorage.getItem(DISPLAY_ZONE_STORAGE)
      .then((value) => {
        if (validTimeZone(value)) {
          setDisplayZone(value);
          setDisplayZoneOverride(true);
        }
      })
      .catch(() =>
        setError(
          "Display time-zone preference could not be restored. Birth records are unchanged.",
        ),
      );
    readCompositeState(AsyncStorage)
      .then((restored) => {
        stateRef.current = restored;
        setState(restored);
        setLoaded(true);
        void AsyncStorage.getItem(READER_PREFERENCES_KEY).then(raw=>setReaderPreferences(restoreReaderPreferences(raw,restored.profile))).catch(e=>setPreferencesError(e.message));
      })
      .catch((e) =>
        setError(
          `Could not restore local data: ${e.message}. It has not been overwritten.`,
        ),
      );
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const snapshot = state;
    queue.current = queue.current
      .then(() => writeCompositeState(AsyncStorage, snapshot))
      .then(result => { if (!result.cleanupComplete) setError("Saved state is committed, but old local storage cleanup is pending. Reopen before assuming deletion is complete."); })
      .catch(() =>
        setError(
          "Could not save on this device. Your changes remain in this session.",
        ),
      );
  }, [state, loaded]);
  function updatePerson(fn: (p: Person) => Person) {
    const id = person?.birth.id;
    setState((prev) => ({
      ...prev,
      people: prev.people.map((p) => (p.birth.id === id ? fn(p) : p)),
    }));
  }
  function switchPerson(id: string) {
    aiRequest.current?.abort();
    selectionRevision.current++;
    setHighlight(null);
    setState((prev) => ({ ...prev, activeId: id }));
    setCurrent(null);
    setQuestion("");
    setError("");
    setTab("Chart");
  }
  async function saveBirth() {
    if (birthBusy) return;
    const controller = new AbortController();
    birthRequest.current = controller;
    setBirthBusy(true);
    setBirthProgress("");
    setError("");
    try {
      const b = {
        ...draft,
        name: draft.name.trim(),
        timezone: draft.timezone.trim(),
        updatedAt: new Date().toISOString(),
      };
      const windowFacts = b.confidence === "range"
        ? await analyzeBirthTimeWindow(b, {
          signal: controller.signal,
          onProgress: (done, total) => setBirthProgress(`${done} / ${total} possible times calculated`),
        })
        : undefined;
      if (controller.signal.aborted) return;
      if (latestDraft.current !== draft) throw Error("Birth details changed during calculation. Run the analysis again before saving.");
      const next = replacePerson(state, b, windowFacts);
      setState(next);
      setHighlight(null);
      selectionRevision.current++;
      setEdit(null);
      setCurrent(null);
      setQuestion("");
      setError("");
      setTab("Chart");
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      setBirthBusy(false);
      setBirthProgress("");
      if (birthRequest.current === controller) birthRequest.current = null;
    }
  }
  function setWindowPart(bound: "earliestLocal" | "latestLocal", part: "date" | "time", value: string) {
    const window = draft.timeWindow || { earliestLocal: `${draft.date}T${draft.localTime}`, latestLocal: `${draft.date}T${draft.localTime}` };
    const current = window[bound];
    setDraft({ ...draft, timeWindow: { ...window, [bound]: part === "date" ? `${value}T${current.split("T")[1] || ""}` : `${current.split("T")[0]}T${value}` } });
  }
  async function ask(ai: boolean) {
    if (!person || busy) return;
    setError("");
    setBusy(true);
    const revision = selectionRevision.current;
    const controller = new AbortController();
    aiRequest.current = controller;
    try {
      const id = makeId("question");
      const { request, context } = createChartAsk({ requestId: id, person, selection: selectedReading,
        question, profile: interpretationProfile, preferences: readerPreferences });
      let saved: SavedQuestion = {
        id,
        createdAt: new Date().toISOString(),
        context,
      };
      if (ai) {
        const answer = await askRelay(
          relayUrl,
          relayToken,
          request,
          context,
          { id: saved.id, signal: controller.signal },
        );
        saved = { ...saved, ...answer };
      }
      if (controller.signal.aborted || revision !== selectionRevision.current) return;
      updatePerson((p) => ({
        ...p,
        history: [...p.history, saved].slice(-100),
      }));
      setCurrent(saved);
    } catch (e) {
      setError(controller.signal.aborted ? "Request cancelled. No answer was saved; provider usage may still have occurred." : (e as Error).message);
    } finally {
      setBusy(false);
      if (aiRequest.current === controller) aiRequest.current = null;
    }
  }
  function feedback(value: Feedback) {
    if (!current) return;
    const updated = { ...current, feedback: value };
    setCurrent(updated);
    updatePerson((p) => ({
      ...p,
      history: p.history.map((h) => (h.id === current.id ? updated : h)),
    }));
  }
  function openBirth(b?: BirthRecordV1) {
    aiRequest.current?.abort();
    const value = b ? { ...b } : blankBirth();
    setDraft(value);
    setEdit(value);
    setError("");
  }
  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (busy) { aiRequest.current?.abort(); return true; }
      if (edit) { setEdit(null); return true; }
      if (tab !== "Chart") { setTab("Chart"); return true; }
      return false;
    });
    return () => handler.remove();
  }, [busy, edit, tab]);
  async function deletePerson(id: string) {
    aiRequest.current?.abort();
    selectionRevision.current++;
    setBusy(true);
    try {
      const result = await commitComposite(current => removePersonAndDependents(current, id));
      setPendingPersonDeletion(null);
      setCurrent(null);
      setHighlight(null);
      setError(result.cleanupComplete ? "" : "Deletion committed, but old storage cleanup is pending. Reopen before assuming it is complete.");
    } catch {
      setError("Deletion was not confirmed in device storage. The person remains available; retry before assuming their data is gone.");
    } finally { setBusy(false); }
  }
  async function commitComposite(transform: (current:CompositeAppStateV2)=>CompositeAppStateV2) {
    const operation = queue.current.then(async()=>{
      const next=transform(stateRef.current);
      const result=await writeCompositeState(AsyncStorage,next);
      stateRef.current=next;setState(next);
      return {state:next,cleanupComplete:result.cleanupComplete};
    });
    queue.current=operation.then(()=>{},()=>{});
    return operation;
  }
  async function saveComposite(calculation: CompositeCalculationV1, roles: [string,string]) {
    const result = await commitComposite(current=>saveRelationship(current, calculation, roles));
    return { relationship: result.state.relationships.find(r => r.relationshipId === calculation.relationshipId)!, cleanupComplete:result.cleanupComplete };
  }
  async function saveReadingRequest(calculation:CompositeCalculationV1,request:ReportRequestV1) {
    const result=await commitComposite(current=>saveRelationshipReading(current,calculation,request));
    return result.cleanupComplete;
  }
  async function updateRelationship(id: string, patch: {displayParticipantIds?:[string,string];label?:string;selectedCalculationId?:string}) {
    const result=await commitComposite(state=>{
    const current = state.relationships.find(r => r.relationshipId === id);
    if (!current) throw Error("Saved relationship is unavailable.");
    if (patch.selectedCalculationId && !current.revisions.some(r => r.calculationId === patch.selectedCalculationId)) throw Error("Selected revision is unavailable.");
    const revised: RelationshipV1 = { ...current, ...patch, updatedAt: new Date().toISOString() };
    if (patch.displayParticipantIds && [...patch.displayParticipantIds].sort().join("|") !== [...current.personIds].sort().join("|")) throw Error("Display order must contain the saved pair.");
    return { ...state, relationships: state.relationships.map(r => r.relationshipId === id ? revised : r) };
    });return result.cleanupComplete;
  }
  async function deleteRelationship(id: string) { return (await commitComposite(current=>removeRelationship(current,id))).cleanupComplete; }
  async function exportRelationship(relationship: RelationshipV1) {
    await Share.share({ message: exportRelationshipReceipt(relationship), title: "Redacted Composite receipt" });
  }
  const reading = recordId ? byId.get(recordId) : null;
  const expanded = recordId ? detailsFor(recordId) : null;
  const navigation = (
    <View
      testID={rail ? "app-navigation-rail" : "app-navigation"}
      style={[
        s.nav,
        rail && {
          flexDirection: "column",
          width: 64,
          zIndex: 30,
          borderRightWidth: 1,
          paddingTop: 8,
        },
      ]}
    >
      {(["Chart", "Compare", ...(localReadingEnabled()?["Reading"]:[]), "Knowledge", "Ask", "People", "Profile"] as Tab[]).map(
        (t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityLabel={t}
            aria-selected={tab === t}
            aria-describedby={rail && navTip === t ? `menu-tooltip-${t}` : undefined}
            accessibilityState={{ selected: tab === t }}
            onHoverIn={() => { if (rail) setNavTip(t); }}
            onHoverOut={() => setNavTip(null)}
            onFocus={() => { if (rail) setNavTip(t); }}
            onBlur={() => setNavTip(null)}
            onPress={() => {
              birthRequest.current?.abort();
              setNavTip(null);
              goTab(t);
              setError("");
              setEdit(null);
              scrollRef.current?.scrollTo({ y: 0, animated: false });
            }}
            style={[
              s.navItem,
              mobileNav && {
                flex:t==="Knowledge"?1.6:t==="Compare"?1.25:t==="Reading"?1.2:1,
                flexDirection: "column",
                gap: 3,
                paddingVertical: 8,
                paddingHorizontal: 2,
              },
              tab === t && s.navActive,
              rail && {
                flex: 0,
                minHeight: 56,
                paddingHorizontal: 12,
                borderBottomWidth: 0,
                borderLeftWidth: 2,
                borderLeftColor: tab === t ? theme.accent : "transparent",
                justifyContent: "center",
              },
            ]}
          >
            <Feather
              name={
                t === "Chart"
                  ? "hexagon"
                  : t === "Compare"
                    ? "git-merge"
                  : t === "Knowledge"
                    ? "book-open"
                    : t === "Ask"
                      ? "message-circle"
                      : t === "People"
                        ? "users"
                        : "sliders"
              }
              size={19}
              color={tab === t ? theme.accent : theme.muted}
            />
            {rail && navTip === t && <View role="tooltip" nativeID={`menu-tooltip-${t}`} pointerEvents="none" style={s.navTooltip}>
              <Text style={{ color: theme.text, fontSize: 13, lineHeight: 20 }}>{t}</Text>
            </View>}
            {!rail && (
              <Text testID={`nav-label-${t}`} numberOfLines={1}
                style={[
                  s.navText,
                  mobileNav && {fontSize:width<360?10.5:12,lineHeight:16,textAlign:"center",maxWidth:"100%",flexShrink:1},
                  tab === t && { color: theme.accent, fontWeight: "600" },
                ]}
              >
                {t}
              </Text>
            )}
          </Pressable>
        ),
      )}
    </View>
  );
  const birthForm = (
    <View style={s.section}>
      <Text style={s.h1}>
        {edit && person ? "Birth record" : "Your chart, with a trace"}
      </Text>
      <Text style={s.muted}>
        Calculated mechanics. Source-pinned readings. Your own observations.
      </Text>
      <Field
        label="Name"
        value={draft.name}
        onChange={(v) => setDraft({ ...draft, name: v })}
      />
      <View style={s.wrap}>
        <View style={s.flex}>
          <Field
            label="Birth date"
            placeholder="YYYY-MM-DD"
            value={draft.date}
            onChange={(v) =>
              setDraft({ ...draft, date: v, utcDisambiguation: undefined })
            }
          />
        </View>
        {draft.confidence !== "range" && <View style={s.flex}>
          <Field
            label="Local birth time"
            placeholder="HH:MM (24-hour)"
            value={draft.localTime}
            onChange={(v) =>
              setDraft({ ...draft, localTime: v, utcDisambiguation: undefined })
            }
          />
        </View>}
      </View>
      <Choices
        label="Birth-time confidence"
        values={["exact", "approximate", "range", "unknown"]}
        labels={{ exact: "Exact", approximate: "Approximate", range: "Time window", unknown: "Unknown" }}
        value={draft.confidence}
        onChange={(v) => setDraft({ ...draft, confidence: v as BirthRecordV1["confidence"] })}
      />
      {draft.confidence === "range" && <View testID="birth-time-window">
        <View style={s.wrap}>
          <View style={s.flex}><Field label="Earliest possible date" value={(draft.timeWindow?.earliestLocal || `${draft.date}T${draft.localTime}`).split("T")[0]} onChange={(v) => setWindowPart("earliestLocal", "date", v)} placeholder="YYYY-MM-DD" /></View>
          <View style={s.flex}><Field label="Earliest possible time" value={(draft.timeWindow?.earliestLocal || `${draft.date}T${draft.localTime}`).split("T")[1] || ""} onChange={(v) => setWindowPart("earliestLocal", "time", v)} placeholder="HH:MM (24-hour)" /></View>
        </View>
        <View style={s.wrap}>
          <View style={s.flex}><Field label="Latest possible date" value={(draft.timeWindow?.latestLocal || `${draft.date}T${draft.localTime}`).split("T")[0]} onChange={(v) => setWindowPart("latestLocal", "date", v)} placeholder="YYYY-MM-DD" /></View>
          <View style={s.flex}><Field label="Latest possible time" value={(draft.timeWindow?.latestLocal || `${draft.date}T${draft.localTime}`).split("T")[1] || ""} onChange={(v) => setWindowPart("latestLocal", "time", v)} placeholder="HH:MM (24-hour)" /></View>
        </View>
        <Text style={s.small}>Local times at the birth location. Up to 24 hours, including windows crossing midnight. Results compare sampled minutes, not confidence percentages.</Text>
      </View>}
      <BirthLocationInput key={draft.id} birth={draft} onChange={setDraft} />
      <Detail title="Advanced location correction">
        <View style={s.wrap}>
          <View style={s.flex}>
            <Field
              label="Latitude"
              value={String(draft.latitude)}
              onChange={(v) => setDraft({ ...draft, latitude: v.trim() ? Number(v) : Number.NaN, resolution: draft.resolution ? { ...draft.resolution, status: "unresolved" } : undefined })}
            />
          </View>
          <View style={s.flex}>
            <Field
              label="Longitude"
              value={String(draft.longitude)}
              onChange={(v) => setDraft({ ...draft, longitude: v.trim() ? Number(v) : Number.NaN, resolution: draft.resolution ? { ...draft.resolution, status: "unresolved" } : undefined })}
            />
          </View>
        </View>
        <Button title="Confirm manual location" secondary onPress={() => {
          if (!draft.place.trim() || !draft.timezone || !Number.isFinite(draft.latitude) || Math.abs(draft.latitude) > 90 || !Number.isFinite(draft.longitude) || Math.abs(draft.longitude) > 180) {
            setError("Choose a place and time zone, then enter valid coordinates before confirming manual correction.");
            return;
          }
          setDraft({ ...draft, resolution: { status: "manual", originalPlace: draft.resolution?.originalPlace || draft.place, resolvedPlace: draft.place, coordinateSource: "manual", sourceVersion: null, resolvedAt: new Date().toISOString(), timezoneOverride: true } });
          setError("");
        }} />
        <Choices
          label="If this time occurs twice"
          values={["unspecified", "earlier", "later"]}
          value={draft.utcDisambiguation || "unspecified"}
          onChange={(v) =>
            setDraft({
              ...draft,
              utcDisambiguation:
                v === "unspecified" ? undefined : (v as "earlier" | "later"),
            })
          }
        />
      </Detail>
      {birthBusy && <Text accessibilityLiveRegion="polite" style={s.muted}>{birthProgress || "Calculating possible times..."}</Text>}
      <View style={s.wrap}>
        <Button
          title={birthBusy ? "Calculating..." : draft.confidence === "range" ? "Analyze time window" : "Calculate chart"}
          icon="arrow-right"
          onPress={saveBirth}
          disabled={!loaded || birthBusy}
        />
        {birthBusy && <Button title="Cancel calculation" secondary onPress={() => birthRequest.current?.abort()} />}
        {edit && (
          <Button
            title="Cancel"
            secondary
            onPress={() => {
              birthRequest.current?.abort();
              setEdit(null);
              setError("");
            }}
          />
        )}
      </View>
      {!person && (
        <Button
          title="Open example chart"
          secondary
          onPress={() => {
            setDraft({
              ...blankBirth(),
              name: "Example chart",
              date: "2024-01-01",
              localTime: "00:00",
              timezone: "UTC",
              place: "Example, not a real person",
              resolution: { status: "resolved", originalPlace: "Synthetic public example", resolvedPlace: "Example, not a real person", coordinateSource: "synthetic", sourceVersion: "1", resolvedAt: new Date().toISOString(), timezoneOverride: false },
            });
          }}
        />
      )}
      <Text style={s.small}>
        Saved only on this device/browser, without cloud sync. Location search
        sends only place text to the location service. Birth data is sent to
        your configured relay only when you choose Ask AI. Time-window analysis
        stays local. Unknown times require an explicit window; no time is guessed.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light" />
      <View style={[s.header,mobileNav&&tab==="Reading"&&{paddingVertical:8}]}>
        <View style={{flexGrow:1,flexBasis:160,minWidth:0}}>
          <Text style={s.brand}>{PRODUCT_NAME}</Text>
          {!(mobileNav&&tab==="Reading")&&<Text style={s.small}>Human Design</Text>}
        </View>
        <View style={s.local}>
          <Feather name="hard-drive" size={13} color={theme.accent} />
          <Text style={s.localText}>Local first</Text>
        </View>
      </View>
      {!mobileNav && !rail && navigation}
      {loaded && !edit && person && (
        <ChartWorkspace
          key={`${person.birth.id}-${person.birth.updatedAt}`}
          person={person}
          preferences={readerPreferences||undefined}
          onPreferences={readerPreferences?updateReaderPreferences:undefined}
          navigation={navigation}
          railWidth={64}
          externalRecord={highlight}
          active={workspace}
          state={validWorkspace}
          dispatch={dispatchUI01}
          onEdit={() => openBirth(person.birth)}
          onAsk={() => goTab("Ask")}
          onKnowledge={() => goTab("Knowledge")}
          onOpenLocalReading={localReadingEnabled()?()=>openLocalPerson(person.birth.id):undefined}
          onTrace={current?.context.chartRevision === person.facts.birthUpdatedAt ? () => { setTraceClaim(null); setTrace(true); } : undefined}
        />
      )}
      {tab === "Compare" && !!error && <View accessibilityRole="alert" style={s.error}><Text style={{color:theme.dangerText}}>{error}</Text></View>}
      {loaded && !edit && (tab === "Compare"||compareVisited) && <View style={{flex:1,display:tab==="Compare"?"flex":"none"}} accessibilityElementsHidden={tab!=="Compare"} importantForAccessibility={tab==="Compare"?"auto":"no-hide-descendants"}>{readerPreferences||preferencesError?<>{!!preferencesError&&<Text accessibilityRole="alert" style={s.muted}>{preferencesError} Showing legacy display preferences for this session. The stored preference record is untouched; changes to it are disabled.</Text>}<CompositeWorkspace onLocalReadingTarget={setLocalPairTarget} onOpenLocalReading={localReadingEnabled()?target=>{setLocalTarget(target);setTab("Reading");}:undefined} state={state} preferences={readerPreferences||migrateReaderPreferences(state.profile)} compareTarget={compareTarget} onPreferences={updateReaderPreferences} onSave={saveComposite} onSaveReading={saveReadingRequest} onUpdateRelationship={updateRelationship} onDeleteRelationship={deleteRelationship} onExport={exportRelationship} /></>:<Text style={s.muted}>Loading reading preferences…</Text>}</View>}
      {loaded&&!edit&&localReadingEnabled()&&(readerPreferences||preferencesError)&&<LocalReadingPreview people={state.people} target={localTarget} activePersonId={state.activeId} preferences={readerPreferences||migrateReaderPreferences(state.profile)} onPreferences={updateReaderPreferences} onReturn={()=>setTab(localTarget?.origin||"Chart")} onPerson={openLocalPerson} onCompare={()=>goTab("Compare")} active={tab==="Reading"}/> }
      {!workspace && tab !== "Compare" && tab!=="Reading" && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.scroll}
        >
          {error ? (
            <View accessibilityRole="alert" style={s.error}>
              <Text style={{ color: theme.dangerText, lineHeight: 21 }}>
                {error}
              </Text>
            </View>
          ) : null}
          {!loaded && !error ? (
            <ActivityIndicator color={theme.accent} />
          ) : null}
          {person && !edit && (tab === "Knowledge" || tab === "Ask") && <View style={s.section}>
            <Text style={s.muted}>Reading context: {readingContext}</Text>
            <Button title="Return to selected reading" onPress={() => goTab("Chart")} />
          </View>}
          {tab === "Knowledge" && <Knowledge onRecord={setRecordId} person={person} preferences={readerPreferences||undefined} onPreferences={readerPreferences?updateReaderPreferences:undefined} />}
          {loaded && (edit || (!person && tab === "Chart")) ? birthForm : null}
          {loaded && !edit && tab === "Ask" && (
            <View style={s.section}>
              <Text style={s.eyebrow}>FACTS / EVIDENCE / INTERPRETATION</Text>
              <Text style={s.h1}>Ask your chart</Text>
              {person ? (
                <>
                  <Text style={s.muted}>
                    {person.birth.name} / {person.facts.type} /{" "}
                    {person.facts.profile}
                  </Text>
                  {person.facts.timeWindowAnalysis && <Text style={s.small}>Time-window chart: this is one illustrative sample. Personal evidence and AI readings are withheld until multi-variant interpretation is supported. Open Birth-time stability in Chart to compare results.</Text>}
                  <Field
                    label="Your question"
                    placeholder="What mechanics might relate to how I communicate?"
                    value={question}
                    onChange={setQuestion}
                    multiline
                  />
                  <View style={s.wrap}>
                    <Button
                      title="Find chart evidence"
                      onPress={() => ask(false)}
                      disabled={busy || !question.trim() || !!person.facts.timeWindowAnalysis}
                      secondary
                    />
                    <Button
                      title={busy ? "Working..." : "Ask AI"}
                      icon="arrow-up-right"
                      onPress={() => ask(true)}
                      disabled={busy || !question.trim() || !relayToken || !!person.facts.timeWindowAnalysis}
                    />
                  </View>
                  {busy && <Button title="Cancel request" secondary onPress={() => aiRequest.current?.abort()} />}
                  {!person.facts.timeWindowAnalysis && <SuggestedQuestions
                    key={person.birth.id}
                    chart={person.facts}
                    question={question}
                    disabled={busy}
                    onSelect={(text) => {
                      setQuestion(text);
                      setError("");
                      scrollRef.current?.scrollTo({ y: 0, animated: true });
                    }}
                  />}
                  {!relayToken&&<Text style={s.small}>AI chat is not connected. Offline chart evidence lookup is available; it is not a conversational reading.</Text>}
                  <Detail title="Developer settings">
                    <Text style={s.small}>
                      Private development relay only. OpenAI keys stay on the
                      server. Connection credentials are kept in memory, not
                      saved.
                    </Text>
                    <Field
                      label="Relay URL"
                      value={relayUrl}
                      onChange={setRelayUrl}
                    />
                    <Field
                      label="Relay access token"
                      secret
                      value={relayToken}
                      onChange={setRelayToken}
                    />
                    <Text style={s.small}>
                      No relay configured? Chart evidence and the reference
                      reader still work offline. This is not Sign in with
                      ChatGPT.
                    </Text>
                  </Detail>
                  {current && (
                    <View style={s.answer}>
                      <Text style={s.eyebrow}>
                        {current.response
                          ? "AI SYNTHESIS / NOT CHART FACT"
                          : "CHART EVIDENCE / NOT AN AI ANSWER"}
                      </Text>
                      <Text style={s.h2}>{current.context.question}</Text>
                      {current.context.exclusions?.map((e) => <Text key={e.recordId} style={s.small}>Evidence withheld: {e.reason}</Text>)}
                      {current.context.chartRevision !== person.facts.birthUpdatedAt && <Text style={s.small}>Historical reading / original chart revision retained. This is not an interpretation of the current recalculated chart.</Text>}
                      {current.response && !current.response.validationVersion && <Text style={s.small}>Legacy AI reading / mechanical claims were not validated by the current claim policy.</Text>}
                      {current.response ? (
                        <>
                          <Text selectable style={s.body}>
                            {current.response.answer}
                          </Text>
                          {current.response.claims.map((c, i) => (
                            <View key={i} style={s.claim}>
                              <Text style={s.small}>{c.validation || "Legacy / not claim-validated"}</Text>
                              <Text style={s.body}>{c.text}</Text>
                              <Button
                                title={`Why this claim? ${i + 1}`}
                                secondary
                                onPress={() => {
                                  setTraceClaim(i);
                                  setTrace(true);
                                }}
                              />
                            </View>
                          ))}
                          <Choices
                            label="Does this interpretation fit?"
                            values={[
                              "resonates",
                              "partially",
                              "does-not-resonate",
                            ]}
                            value={current.feedback || ""}
                            onChange={(v) => feedback(v as Feedback)}
                          />
                        </>
                      ) : (
                        <>
                          <Text style={s.small}>
                            {current.context.selection === "not-in-chart"
                              ? "This mechanic is not active in this natal chart."
                              : "These records are selected from your actual activations. They do not prove a premise or explain your life by themselves."}
                          </Text>
                          {current.context.evidence.map((e) => (
                            <Pressable
                              accessibilityRole="button"
                              key={e.id}
                              style={s.claim}
                              onPress={() => setRecordId(e.recordId)}
                            >
                              <Text style={s.rowTitle}>{e.title}</Text>
                              <Text style={s.body}>{e.mechanic}</Text>
                            </Pressable>
                          ))}
                        </>
                      )}
                      <Button
                        title="Why?"
                        icon="layers"
                        secondary
                        onPress={() => {
                          setTraceClaim(null);
                          setTrace(true);
                        }}
                      />
                    </View>
                  )}
                  <Text style={s.h2}>Question history</Text>
                  {[...person.history].reverse().map((h) => (
                    <Pressable
                      accessibilityRole="button"
                      key={h.id}
                      onPress={() => setCurrent(h)}
                      style={s.recordRow}
                    >
                      <View style={s.flex}>
                        <Text style={s.rowTitle}>{h.context.question}</Text>
                        <Text style={s.small}>
                          {h.response ? "AI synthesis" : "Evidence lookup"} /{" "}
                          {h.context.chartRevision === person.facts.birthUpdatedAt ? "current chart / " : "historical chart / "}
                          {new Date(h.createdAt).toLocaleDateString(undefined, {
                            timeZone: displayZone,
                          })}
                        </Text>
                      </View>
                      <Feather
                        name="chevron-right"
                        size={16}
                        color={theme.muted}
                      />
                    </Pressable>
                  ))}
                  {!person.history.length && (
                    <Text style={s.muted}>No saved questions yet.</Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={s.muted}>
                    Create a chart before selecting personal evidence.
                  </Text>
                  <Button
                    title="Create chart"
                    onPress={() => setTab("Chart")}
                  />
                </>
              )}
            </View>
          )}
          {loaded && !edit && tab === "People" && (
            <View style={s.section}>
              <Text style={s.h1}>People</Text>
              {!state.people.length&&<Text style={s.body}>No saved people yet. Add a birth chart to open a reading or compare two people.</Text>}
              {state.people.map((p) => (
                <View key={p.birth.id} style={[s.recordRow,{flexWrap:"wrap"}]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${p.birth.name}`}
                    onPress={() => switchPerson(p.birth.id)}
                    style={s.flex}
                  >
                    <Text style={s.rowTitle}>{p.birth.name}</Text>
                    {p.facts.timeWindowAnalysis && <Text style={s.small}>Time window / illustrative sample, not exact</Text>}
                    <Text style={s.small}>
                      {p.facts.type} / {p.facts.profile}
                      {p.birth.id === state.activeId ? " / active" : ""}
                    </Text>
                  </Pressable>
                  <View style={s.wrap}>
                    <Button title={`View reading · ${p.birth.name}`} secondary onPress={()=>{switchPerson(p.birth.id);requestAnimationFrame(()=>dispatchUI01({type:"level",level:"expanded"}));}}/>
                    <Button title={`Chart · ${p.birth.name}`} secondary onPress={()=>switchPerson(p.birth.id)}/>
                    <Button title={`Compare · ${p.birth.name}`} secondary disabled={state.people.length<2} onPress={()=>{setCompareTarget(prev=>({id:p.birth.id,revision:(prev?.revision||0)+1}));goTab("Compare");}}/>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${p.birth.name}`}
                    disabled={busy}
                    onPress={() => setPendingPersonDeletion(p.birth.id)}
                    style={s.iconButton}
                  >
                    <Feather
                      name="trash-2"
                      size={17}
                      color={theme.dangerText}
                    />
                  </Pressable>
                </View>
              ))}
              {pendingPersonDeletion&&<View style={s.section}>
                <Text style={s.body}>Delete {state.people.find(p=>p.birth.id===pendingPersonDeletion)?.birth.name}, all their chart revisions, saved readings and observations, plus {state.relationships.filter(r=>r.personIds.includes(pendingPersonDeletion)).length} dependent relationships and {state.relationships.filter(r=>r.personIds.includes(pendingPersonDeletion)).reduce((n,r)=>n+r.revisions.length,0)} relationship calculation revisions? External exports cannot be revoked.</Text>
                <Button title="Confirm person and dependent relationship deletion" disabled={busy} onPress={()=>void deletePerson(pendingPersonDeletion)} />
                <Button title="Cancel deletion" secondary disabled={busy} onPress={()=>setPendingPersonDeletion(null)} />
              </View>}
              <Button
                title="Add person"
                icon="plus"
                onPress={() => openBirth()}
                disabled={state.people.length >= 30}
              />
              <Button title="Compare two people" icon="git-merge" onPress={() => goTab("Compare")} disabled={state.people.length < 2} />
              <Text style={s.small}>
                Birth-record edits create a new chart revision. Historical readings
                retain their original evidence and calculation versions. Personal observations remain separate.
              </Text>
            </View>
          )}
          {loaded && !edit && tab === "Profile" && (
            <View style={s.section}>
              <Text style={s.h1}>Your reading preferences</Text>
              <Detail title="Display time zone">
                <DisplayTimezone
                  zone={displayZone}
                  override={displayZoneOverride}
                  onSelect={(id) => {
                    setDisplayZone(id);
                    setDisplayZoneOverride(true);
                    AsyncStorage.setItem(DISPLAY_ZONE_STORAGE, id).catch(() =>
                      setError("Could not save display time zone."),
                    );
                  }}
                  onDevice={() => {
                    setDisplayZone(deviceTimeZone());
                    setDisplayZoneOverride(false);
                    AsyncStorage.removeItem(DISPLAY_ZONE_STORAGE).catch(() =>
                      setError("Could not clear display time-zone override."),
                    );
                  }}
                />
              </Detail>
              <Text style={s.muted}>
                Presentation and interpretation context only. These never alter
                chart facts.
              </Text>
              {readerPreferences?<ReaderPreferences value={readerPreferences} onSave={updateReaderPreferences}/>:<Text style={s.muted}>{preferencesError||"Loading reading preferences…"}</Text>}
              {person && (
                <>
                  <Text style={s.h2}>
                    Personal observations / {person.birth.name}
                  </Text>
                  <Field
                    label="What fits, or does not fit?"
                    multiline
                    value={observation}
                    onChange={(v) => setObservation(v.slice(0, 600))}
                  />
                  <Button
                    title="Add observation"
                    secondary
                    onPress={() => {
                      if (!observation.trim()) return;
                      updatePerson((p) => ({
                        ...p,
                        observations: [
                          ...p.observations,
                          {
                            id: makeId("observation"),
                            text: observation.trim(),
                            createdAt: new Date().toISOString(),
                            kind: "USER_SUPPLIED" as const,
                          },
                        ].slice(-20),
                      }));
                      setObservation("");
                    }}
                  />
                  {person.observations.map((o) => (
                    <View key={o.id} style={s.recordRow}>
                      <View style={s.flex}>
                        <Text style={s.eyebrow}>USER SUPPLIED / NOT CANON</Text>
                        <Text style={s.body}>{o.text}</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Delete observation"
                        onPress={() =>
                          updatePerson((p) => ({
                            ...p,
                            observations: p.observations.filter(
                              (x) => x.id !== o.id,
                            ),
                          }))
                        }
                        style={s.iconButton}
                      >
                        <Feather name="x" size={16} color={theme.muted} />
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
              <Detail title="Dataset and feature boundaries">
                <Copy
                  label="PINNED CANDIDATE"
                  text={`${datasetPin.runtimeVersion} / ${datasetPin.releaseStatus}\n64 Gates, 384 exact Lines, 36 Channels.\n${datasetPin.sourceAuthentication}`}
                />
                <Text style={s.small}>
                  Western astrology, relationship charts, transits, billing and
                  advertising are not implemented. The native Android
                  build/device gate is still pending.
                </Text>
              </Detail>
            </View>
          )}
          <View style={s.footer}>
            <Text style={s.small}>
              Interpretations are possibilities, not diagnoses, guarantees or
              decision authority.
            </Text>
            <Text style={s.small}>
              Dataset {datasetPin.runtimeVersion} / canonical{" "}
              {datasetPin.canonical.sha256.slice(0, 12)}
            </Text>
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      )}
      {mobileNav && navigation}
      <Modal
        visible={!!recordId}
        onRequestClose={() => setRecordId(null)}
        animationType="slide"
      >
        <SafeAreaView style={s.safe}>
          <View style={s.modalHeader}>
            <Text style={[s.h2, s.flex]}>
              {reading?.type === "channel"
                ? "Channel Mechanics"
                : "Gate Mechanics"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close reading"
              onPress={() => setRecordId(null)}
              style={s.iconButton}
            >
              <Feather name="x" size={22} color={theme.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.scroll}>
            {reading && expanded && (
              <>
                <EvidenceBadge kind="canonical" />
                <Text style={s.h1}>{reading.title}</Text>
                {recordId && !inferenceDisposition(recordId).allowed && <Text style={s.small}>Preserved reference / excluded from personalized inference: {inferenceDisposition(recordId).reason}</Text>}
                <Text style={s.small}>{expanded.structure}</Text>
                {person && (
                  <Text style={s.small}>
                    {reading.type === "channel"
                      ? person.facts.channels.some((c) => c.id === reading.id)
                        ? "Completed in the selected natal chart."
                        : "Reference only: not completed in the selected natal chart."
                      : reading.type === "line"
                        ? person.facts.activations.some(
                            (a) =>
                              a.gate === reading.gate_number &&
                              a.line === reading.line_number,
                          )
                          ? "Exact Line activated in the selected natal chart."
                          : "Reference only: this exact Line is not activated in the selected natal chart."
                        : person.facts.gates.includes(reading.gate_number!)
                          ? "Gate activated in the selected natal chart."
                          : "Reference only: not activated in the selected natal chart."}
                  </Text>
                )}
                <Copy
                  label="MECHANIC"
                  text={reading.fields.mechanical_kernel}
                />
                <Copy
                  label="COHERENT POSSIBILITY"
                  text={reading.fields.coherent_expression}
                />
                <Copy
                  label="DISTORTED POSSIBILITY"
                  text={reading.fields.distorted_expression}
                />
                <View style={s.boundary}>
                  <Copy
                    label="IMPORTANT BOUNDARY"
                    text={reading.fields.boundary_nonclaim}
                  />
                </View>
                <Detail title="Rich explanation and deeper mechanics">
                  <Copy label="CANONICAL SYNTHESIS" text={expanded.rich} />
                  {expanded.app && <EvidenceBadge kind="exploratory" />}
                  {expanded.app &&
                    Object.entries(expanded.app.sections)
                      .filter(([k]) => k !== "interaction_context")
                      .map(([k, blocks]) => (
                        <View key={k}>
                          <Text style={s.eyebrow}>
                            APP INTERPRETATION / {k.replaceAll("_", " ")}
                          </Text>
                          {blocks.map((b) => (
                            <Text selectable key={b.block_id} style={s.body}>
                              {b.text}
                            </Text>
                          ))}
                        </View>
                      ))}
                  {expanded.app && (
                    <Text style={s.small}>
                      {expanded.app.canonical_boundary}
                    </Text>
                  )}
                  {expanded.app && (
                    <Text style={s.small}>
                      {expanded.app.interpretive_boundary}
                    </Text>
                  )}
                </Detail>
                {!!expanded.additional.length && (
                  <Detail title="Additional canonical mechanics">
                    <EvidenceBadge kind="canonical" />
                    {expanded.additional.map((note) => (
                      <Copy
                        key={note.label}
                        label={note.label}
                        text={note.text}
                      />
                    ))}
                  </Detail>
                )}
                <Detail title="Related Gates, Lines and Channels">
                  {reading.type !== "channel" && (
                    <>
                      <Button
                        title={`Gate ${reading.gate_number}`}
                        secondary
                        onPress={() =>
                          setRecordId(gateId(reading.gate_number!))
                        }
                      />
                      <View style={s.wrap}>
                        {gates.get(reading.gate_number!)?.lines.map((line) => (
                          <Button
                            key={line.id}
                            title={line.gate_line}
                            secondary
                            onPress={() => setRecordId(line.id)}
                          />
                        ))}
                      </View>
                    </>
                  )}
                  {reading.type === "channel" &&
                    reading.gate_numbers?.map((g) => (
                      <Button
                        key={g}
                        title={`Gate ${g}`}
                        secondary
                        onPress={() => setRecordId(gateId(g))}
                      />
                    ))}
                  {reading.type !== "channel" &&
                    runtime.channels
                      .filter((c) => c.gates.includes(reading.gate_number!))
                      .map((c) => (
                        <Button
                          key={c.id}
                          title={`${c.pair} / ${c.name}`}
                          secondary
                          onPress={() => setRecordId(c.id)}
                        />
                      ))}
                </Detail>
                <Detail title="Channel interaction">
                  <Copy label="INTERACTION" text={expanded.interaction} />
                  {expanded.app?.sections.interaction_context?.map((b) => (
                    <Copy
                      key={b.block_id}
                      label="APP INTERPRETATION"
                      text={b.text}
                    />
                  ))}
                </Detail>
                <Detail title="Source comparison and provider disagreements">
                  <Copy label="SOURCE AGREEMENT" text={expanded.agreement} />
                  <Copy label="COMPARISON" text={expanded.comparison} />
                  <Copy
                    label="SOURCE RELATIONSHIP"
                    text={expanded.relationship}
                  />
                  <Copy
                    label="PUBLISHED FIXING METADATA / NOT CALCULATED"
                    text={expanded.labels}
                  />
                  {expanded.anomaly && (
                    <Copy label="ANOMALY" text={expanded.anomaly} />
                  )}
                </Detail>
                <Detail title="Provenance and evidence limits">
                  <Text selectable style={s.mono}>
                    {JSON.stringify(expanded.provenance, null, 2)}
                  </Text>
                  <Text style={s.small}>{datasetPin.sourceAuthentication}</Text>
                  <Text selectable style={s.mono}>
                    APP1 SHA-256:{" "}
                    {datasetPin.files["app1_runtime.min.json"].sha256}
                  </Text>
                </Detail>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={trace && !!current}
        onRequestClose={() => setTrace(false)}
        animationType="slide"
      >
        <SafeAreaView style={s.safe}>
          <View style={s.modalHeader}>
            <Text style={[s.h2, s.flex]}>Mechanics Trace</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close trace"
              onPress={() => setTrace(false)}
              style={s.iconButton}
            >
              <Feather name="x" size={22} color={theme.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.scroll}>
            {current && (
              <MechanicsTrace
                key={`${current.id}-${traceClaim}`}
                question={current}
                claimIndex={traceClaim}
                allowChart={current.context.chartRevision === person?.facts.birthUpdatedAt}
                onRecord={(id) => {
                  setTrace(false);
                  setRecordId(id);
                }}
                onShowChart={(id) => {
                  setHighlight(null);
                  setTrace(false);
                  setTab("Chart");
                  setTimeout(() => {
                    setHighlight(id);
                    scrollRef.current?.scrollTo({
                      y: width <= 760 ? 300 : 150,
                      animated: false,
                    });
                  }, 0);
                }}
              />
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.background },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  brand: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.text,
    letterSpacing: 0,
  },
  local: { flexDirection: "row", alignItems: "center", gap: 7, maxWidth:"100%", flexShrink:1 },
  localText: { fontSize: 12, color: theme.accent, flexShrink:1 },
  nav: {
    flexDirection: "row",
    backgroundColor: theme.background,
    borderBottomWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 6,
  },
  navItem: {
    flex: 1,
    flexDirection: "row",
    gap: 7,
    paddingVertical: 16,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  navActive: { borderBottomColor: theme.accent },
  navText: { fontSize: 13, color: theme.muted },
  navTooltip: { position: "absolute", left: 60, top: 8, minWidth: 96, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border, borderRadius: 4, zIndex: 100 },
  scroll: {
    padding: 18,
    gap: 16,
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",
    paddingBottom: 50,
  },
  section: { gap: 10, width: "100%" },
  h1: {
    fontSize: 27,
    lineHeight: 35,
    fontWeight: "600",
    color: theme.text,
    marginBottom: 5,
  },
  h2: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600",
    color: theme.text,
    marginBottom: 8,
  },
  body: { fontSize: 15, lineHeight: 24, color: theme.text, marginBottom: 6 },
  muted: { fontSize: 14, lineHeight: 22, color: theme.muted, marginBottom: 12 },
  small: {
    fontSize: 12,
    lineHeight: 19,
    color: theme.muted,
    marginVertical: 3,
  },
  eyebrow: {
    fontSize: 10,
    lineHeight: 17,
    fontWeight: "700",
    color: theme.accent,
    marginBottom: 8,
  },
  field: { flexGrow: 1, gap: 7, marginVertical: 8 },
  label: { fontSize: 13, lineHeight: 19, fontWeight: "500", color: theme.text },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 5,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.text,
    minHeight: 46,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    alignItems: "center",
  },
  flex: { flex: 1, minWidth: 0 },
  choice: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 5,
    backgroundColor: theme.surface,
  },
  chosen: { backgroundColor: theme.surfaceRaised, borderColor: theme.accent },
  button: {
    minHeight: 44,
    borderRadius: 5,
    backgroundColor: theme.accent,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginVertical: 7,
  },
  secondary: { backgroundColor: theme.surfaceRaised },
  buttonText: {
    color: theme.surface,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  detail: { borderBottomWidth: 1, borderColor: theme.border, width: "100%" },
  detailHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 16,
  },
  detailTitle: { fontSize: 14, fontWeight: "500", color: theme.text, flex: 1 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  iconButton: {
    padding: 13,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.border,
    paddingVertical: 12,
  },
  stat: { minWidth: 100, flex: 1, padding: 8 },
  statValue: {
    fontSize: 17,
    lineHeight: 25,
    color: theme.text,
    fontWeight: "500",
  },
  chartLayout: { gap: 24 },
  graphSide: { minWidth: 0 },
  chartSide: { minWidth: 0, paddingTop: 20 },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  rowTitle: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
    color: theme.text,
    flexShrink: 1,
  },
  gate: {
    width: 46,
    height: 46,
    borderRadius: 5,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  hanging: { backgroundColor: theme.surface, borderColor: theme.border },
  gateNumber: { fontSize: 14, fontWeight: "600", color: theme.text },
  activation: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingVertical: 8,
  },
  answer: {
    borderTopWidth: 2,
    borderTopColor: theme.accent,
    paddingTop: 22,
    marginTop: 18,
  },
  claim: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  traceRecord: {
    borderTopWidth: 1,
    borderColor: theme.border,
    paddingTop: 20,
    marginBottom: 15,
  },
  error: { padding: 14, backgroundColor: theme.dangerSurface, borderRadius: 5 },
  warning: { color: theme.dangerText, fontSize: 13, lineHeight: 21 },
  footer: {
    borderTopWidth: 1,
    borderColor: theme.border,
    paddingTop: 20,
    marginTop: 24,
  },
  modalHeader: {
    padding: 20,
    flexDirection: "row",
    gap: 15,
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  boundary: {
    borderLeftWidth: 3,
    borderLeftColor: theme.accentMuted,
    paddingLeft: 16,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 18,
    color: theme.muted,
    marginVertical: 12,
  },
});
