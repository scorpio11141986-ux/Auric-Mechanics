import type { UserInterpretationProfileV1 } from "../domain/contracts";
import { validateProfile } from "./context";
import type { StoragePort } from "../persistence/composite-state";

export const READER_PREFERENCES_KEY = "auric-mechanics:relationship-reader:v1";
export const FAMILIARITY = ["new", "type", "profile-authority", "centers", "gates-channels", "advanced", "practitioner"] as const;
export const PRESETS = ["beginner", "some", "intermediate", "advanced", "practitioner"] as const;
export const CONCEPTS = {
  typeStrategy: "Type / Strategy", authority: "Authority", profile: "Profile",
  centers: "Centers: defined, undefined and open", definition: "Definition: Single, Split, Triple and Quadruple",
  gates: "Gates", channels: "Channels and connection categories", lines: "Gate.Line",
  planets: "Planet symbols and columns", sides: "Design / Personality (red / black)",
} as const;
export type KnownConcepts = Partial<Record<keyof typeof CONCEPTS, boolean>>;
export type ReaderPreferencesV1 = {
  schema: "RelationshipReaderPreferencesV1";
  onboarding: "pending" | "skipped" | "completed";
  familiarity: typeof FAMILIARITY[number];
  preset?: typeof PRESETS[number];
  concepts?: KnownConcepts;
  astrology: "none" | "some" | "advanced";
  astrologyBridge: boolean;
  depth: "quick" | "standard" | "deep";
  style: "practical" | "spiritual" | "integrated" | "technical";
  terminology: "modern" | "traditional" | "both";
  teaching: "example" | "explanation" | "questions";
  interests: string[];
  researchMode?: boolean;
  [extension: string]: unknown;
};
export function migrateReaderPreferences(profile: UserInterpretationProfileV1): ReaderPreferencesV1 {
  validateProfile(profile);
  return {schema:"RelationshipReaderPreferencesV1",onboarding:"pending",familiarity:profile.familiarity === "basics" ? "profile-authority" : profile.familiarity,
    astrology:"none",astrologyBridge:false,depth:profile.depth === "concise" ? "quick" : profile.depth,style:profile.style,terminology:profile.terminology,teaching:"explanation",interests:[...profile.interests]};
}
export function expertise(p:ReaderPreferencesV1):"Beginner"|"Some knowledge"|"Intermediate"|"Advanced"|"Practitioner" {
  if(p.preset)return p.preset==="practitioner"?"Practitioner":p.preset==="advanced"?"Advanced":p.preset==="intermediate"?"Intermediate":p.preset==="some"?"Some knowledge":"Beginner";
  return p.familiarity === "practitioner" ? "Practitioner" : ["advanced","gates-channels"].includes(p.familiarity) ? "Advanced" : ["centers","profile-authority"].includes(p.familiarity) ? "Intermediate" : "Beginner";
}
export function normalizedPreferences(p:ReaderPreferencesV1):ReaderPreferencesV1 {
  return {...p,preset:p.preset??(p.familiarity==="practitioner"?"practitioner":p.familiarity==="advanced"||p.familiarity==="gates-channels"?"advanced":p.familiarity==="centers"||p.familiarity==="profile-authority"?"intermediate":p.familiarity==="type"?"some":"beginner"),concepts:{...p.concepts}};
}
export function conceptGloss(p:ReaderPreferencesV1,key:keyof typeof CONCEPTS):string|null {
  if(p.concepts?.[key]===true)return null;
  return {typeStrategy:"Type and Strategy describe the natal chart's operating classification; the pair does not acquire a new personal Type.",authority:"Authority names each person's natal decision process; a combined chart does not replace it.",profile:"Profile is a pair of natal Line numbers, not a compatibility score.",centers:"A Center is defined when a complete Channel reaches it; an active Gate alone is not enough.",definition:"Definition describes how complete Channels form connected networks. Separate networks are called islands.",gates:"A Gate is one numbered endpoint of a Channel.",channels:"A complete Channel connects two matching Gate endpoints; connection categories describe who supplies them.",lines:"Gate.Line records the exact subdivision of an activation. No personal meaning is inferred from that number here.",planets:"The planetary columns identify the exact activations that supply each Gate, not astrological aspects.",sides:"Design and Personality identify the two activation sets within each natal chart, not the two people."}[key];
}
export function readingGlosses(p:ReaderPreferencesV1,selectionKind:string):{key:keyof typeof CONCEPTS;text:string}[]{
  const keys:readonly (keyof typeof CONCEPTS)[]=selectionKind==="gate"||selectionKind==="activation"?["gates","lines","planets","sides"]:selectionKind==="center"?["centers","definition","channels"]:selectionKind==="channel"?["channels","gates","centers","definition"]:selectionKind==="witness"||selectionKind==="component"?["definition","channels","centers"]:["typeStrategy","authority","profile","centers","definition","channels"];
  return keys.flatMap(key=>{const text=conceptGloss(p,key);return text?[{key,text}]:[];});
}
// Read-only projection for older natal/Ask consumers. Saved profiles and requests are not migrated in place.
export function legacyProfile(p:ReaderPreferencesV1):UserInterpretationProfileV1 {
  const level=expertise(p);
  return {schema:"UserInterpretationProfileV1",familiarity:level==="Beginner"?"new":level==="Intermediate"||level==="Some knowledge"?"basics":"advanced",depth:p.depth==="quick"?"concise":p.depth,style:p.style==="spiritual"?"integrated":p.style,terminology:p.terminology,interests:p.interests.slice(0,8)};
}
export function validateReaderPreferences(value:unknown):ReaderPreferencesV1 {
  const p=value as ReaderPreferencesV1;
  if(!p || p.schema!=="RelationshipReaderPreferencesV1" || !FAMILIARITY.includes(p.familiarity) ||
    !["pending","skipped","completed"].includes(p.onboarding) || !["none","some","advanced"].includes(p.astrology) || typeof p.astrologyBridge!=="boolean" ||
    !["quick","standard","deep"].includes(p.depth) || !["practical","spiritual","integrated","technical"].includes(p.style) ||
    !["modern","traditional","both"].includes(p.terminology) || !["example","explanation","questions"].includes(p.teaching) ||
    (p.preset!==undefined&&!PRESETS.includes(p.preset)) || (p.concepts!==undefined&&(!p.concepts||typeof p.concepts!=="object"||Array.isArray(p.concepts)||Object.entries(p.concepts).some(([k,v])=>!(k in CONCEPTS)||typeof v!=="boolean"))) ||
    (p.researchMode!==undefined&&typeof p.researchMode!=="boolean") || !Array.isArray(p.interests) || p.interests.length>32 || p.interests.some(x=>typeof x!=="string" || x.length>80)) throw Error("Reader preferences are unsupported. Stored data was not changed.");
  return p;
}
export function restoreReaderPreferences(raw:string|null, legacy:UserInterpretationProfileV1):ReaderPreferencesV1 {
  return raw===null ? migrateReaderPreferences(legacy) : validateReaderPreferences(JSON.parse(raw));
}
export async function saveReaderPreferences(storage:StoragePort,p:ReaderPreferencesV1) {
  validateReaderPreferences(p);
  const raw=JSON.stringify(p);
  await storage.setItem(READER_PREFERENCES_KEY,raw);
  if(await storage.getItem(READER_PREFERENCES_KEY)!==raw) throw Error("Reader preferences could not be verified. Retry before closing.");
}
export function replacePrimaryInterest(interests:string[],interest:string):string[] {
  return [interest,...interests.filter(x=>x!==interest)];
}
// Explicitly allowlist request content. Local observations and unknown extensions never ride along with a profile.
export function readerAIContext(p:ReaderPreferencesV1,consent:{preferences:boolean;observation:boolean},observation?:string) {
  validateReaderPreferences(p);
  return {schema:"RelationshipReaderConsentContextV1",...(consent.preferences?{preferences:{expertise:expertise(p),depth:p.depth,style:p.style,terminology:p.terminology,teaching:p.teaching}}:{}),
    ...(consent.observation&&observation?.trim()?{observation:{kind:"USER_SUPPLIED",text:observation.trim().slice(0,600)}}:{})};
}
