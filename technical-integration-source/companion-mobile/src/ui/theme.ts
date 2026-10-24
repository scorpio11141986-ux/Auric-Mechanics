// Provisional dark foundation and semantic roles, not a frozen brand palette.
export const theme = {
  background: "#121517",
  surface: "#1c2225",
  surfaceRaised: "#26332f",
  text: "#f0f2ef",
  muted: "#b4c1bc",
  border: "#46544e",
  accent: "#adddca",
  accentMuted: "#7fae9b",
  dangerText: "#f1a7ad",
  dangerSurface: "#3b252b",
  calculated: "#9dcced",
  derived: "#e0c693",
  canonical: "#adddca",
  ai: "#cfb9e8",
  user: "#c4cfdb",
  exploratory: "#ddcda9",
  uncertain: "#f2b994",
};
export type EvidenceKind =
  | "calculated"
  | "derived"
  | "canonical"
  | "ai"
  | "user"
  | "exploratory"
  | "uncertain";
export const evidenceLabels: Record<EvidenceKind, string> = {
  calculated: "Calculated from your chart",
  derived: "Derived chart mechanic",
  canonical: "Canonical interpretation",
  ai: "AI synthesis",
  user: "Context you supplied",
  exploratory: "Interpretive possibility",
  uncertain: "Time-sensitive / uncertain",
};
