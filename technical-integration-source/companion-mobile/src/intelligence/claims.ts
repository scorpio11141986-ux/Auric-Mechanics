import type { AIContextV1, InterpretationResponseV1 } from "../domain/contracts";
import { channelId } from "../content/records";

type Claim = InterpretationResponseV1["claims"][number];
const normal = (value: string) => value.trim().replace(/\s+/g, " ");

export function validateClaims(raw: unknown[], context: AIContextV1): Claim[] {
  const facts = new Map(context.facts.map((f) => [f.id, f]));
  const evidence = new Map(context.evidence.map((e) => [e.id, e]));
  return raw.map((value) => {
    const c = value as Claim;
    if (!c || typeof c !== "object" || Array.isArray(c) ||
      Object.keys(c).some((k) => !["kind", "subjectId", "text", "evidenceIds", "factIds"].includes(k)) ||
      !["mechanical", "source-supported", "exploratory"].includes(c.kind || "") ||
      c.subjectId !== context.subject.id || typeof c.text !== "string" || !c.text.trim() || c.text.length > 2000 ||
      !Array.isArray(c.evidenceIds) || c.evidenceIds.length > 6 ||
      c.evidenceIds.some((id) => typeof id !== "string" || !evidence.has(id)) ||
      !Array.isArray(c.factIds) || c.factIds.length > 6 ||
      c.factIds.some((id) => typeof id !== "string" || !facts.has(id)))
      throw Error("Interpretation cited unavailable evidence or a different subject; answer rejected");

    const cited = c.evidenceIds.map((id) => evidence.get(id)!);
    if (c.kind === "mechanical") {
      if (!c.factIds.length) throw Error("Mechanical claim has no deterministic facts");
      if (cited.some((e) => !e.supportingFactIds.some((id) => c.factIds!.includes(id))))
        throw Error("Mechanical claim cites unrelated evidence");
      // Never display model-authored mechanical prose, even with real citation IDs.
      return { ...c, text: c.factIds.map((id) => facts.get(id)!.value).join("\n"), validation: "structurally-verified" };
    }
    if (!cited.length) throw Error("Interpretation requires selected canonical support");
    if (c.kind === "source-supported") {
      if (!cited.every((e) => [e.mechanic, e.coherent, e.distorted, e.boundary].some((text) => text && normal(text) === normal(c.text))))
        throw Error("Source-supported claim is not an exact selected source excerpt");
      return { ...c, text: `Source description, not a proven personal trait: ${c.text}`, validation: "source-excerpt-verified" };
    }

    const text = c.text;
    if (/\b(guaranteed|definitely|scientifically proven|independently authenticated|authenticated original|certainly|always|never)\b/i.test(text))
      throw Error("Unsupported certainty or source-status escalation; answer withheld");
    // Deterministically check explicit mechanic mentions; this is not a semantic truth certificate.
    for (const match of text.matchAll(/\bgate\s+(\d{1,2})(?:[.](\d))?\b/gi)) {
      const gate = `gate-${match[1].padStart(2, "0")}`;
      const exact = match[2] ? `${gate}-line-${match[2]}` : gate;
      if (!cited.some((e) => match[2] ? e.recordId === exact :
        e.recordId === gate || e.recordId.startsWith(`${gate}-line-`) ||
        (e.recordId.startsWith("channel-") && e.recordId.split("-").slice(1).includes(match[1].padStart(2, "0")))))
        throw Error("Claim mentions an unsupported Gate/Line");
    }
    for (const match of text.matchAll(/\bchannel\s+(\d{1,2})\s*[-\u2013]\s*(\d{1,2})\b/gi)) {
      const id = channelId(+match[1], +match[2]);
      if (!facts.has(`f:${id}`) || !cited.some((e) => e.recordId === id))
        throw Error("Claim mentions an absent or unrelated Channel");
    }
    // All assertions about deterministic chart classification belong in typed mechanical claims.
    if (/\b(authority|profile|definition|defined|undefined|manifestor|generator|projector|reflector|channels?|centers?|personality|design|sun|moon|mercury|venus|mars|jupiter|saturn|uranus|neptune|pluto|incarnation|birth time)\b/i.test(text))
      throw Error("Chart classification must use a structured mechanical claim");
    return { ...c, validation: "exploratory-not-proven" };
  });
}
