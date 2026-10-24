import {
  documents,
  queryConfig,
  byId,
  channelId,
  gateId,
  type SearchDoc,
} from "./records";

export type Filters = {
  type?: string;
  center?: string;
  gate_number?: number;
  line_number?: number;
  channel_pair?: string;
};
const allowed = new Set([
  "type",
  "center",
  "gate_number",
  "line_number",
  "channel_pair",
]);
export function pairKey(pair: unknown) {
  const m = String(pair).match(/^\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*$/);
  if (
    !m ||
    +m[1] === +m[2] ||
    Math.min(+m[1], +m[2]) < 1 ||
    Math.max(+m[1], +m[2]) > 64
  )
    return null;
  return [+m[1], +m[2]].sort((a, b) => a - b).join("-");
}
export function exactLookup(text: string): SearchDoc[] | null {
  const q = text.trim().toLowerCase();
  if (byId.has(q)) return [byId.get(q)!];
  let m = q.match(/^(?:gate\s*)?(\d{1,2})\.(\d)$/);
  if (m) {
    const doc = byId.get(`${gateId(+m[1])}-line-${+m[2]}`);
    return doc ? [doc] : [];
  }
  m = q.match(/^gate\s*(\d{1,2})$/);
  if (m) {
    const doc = byId.get(gateId(+m[1]));
    return doc ? [doc] : [];
  }
  m = q.match(/^(?:channel\s*)?(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
  if (m) {
    const doc = byId.get(channelId(+m[1], +m[2]));
    return doc ? [doc] : [];
  }
  if (/^(?:gate|channel)-/.test(q)) return [];
  return null;
}
function matches(doc: SearchDoc, filters: Filters) {
  return Object.entries(filters).every(([key, value]) => {
    if (value == null) return true;
    if (key === "center")
      return (doc.centers || [doc.center]).includes(value as string);
    if (key === "gate_number")
      return (doc.gate_numbers || [doc.gate_number]).includes(value as number);
    if (key === "channel_pair")
      return (
        pairKey(value) !== null && pairKey(value) === pairKey(doc.channel_pair)
      );
    return doc[key as keyof SearchDoc] === value;
  });
}
const tokens = (s: string) =>
  s.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [];
export function query(
  text: string,
  filters: Filters = {},
  limit = queryConfig.default_limit,
) {
  if (Object.keys(filters).some((k) => !allowed.has(k)))
    throw Error("Unknown hard filter");
  if (!Number.isInteger(limit) || limit < 0)
    throw Error("limit must be a nonnegative integer");
  limit = Math.min(limit, queryConfig.maximum_limit);
  const exact = exactLookup(text);
  const qset = new Set(tokens(text));
  const ranked = (exact ?? documents)
    .filter((d) => matches(d, filters))
    .map((doc) => {
      if (exact !== null)
        return {
          id: doc.id,
          type: doc.type,
          title: doc.title,
          score: 9999,
          match_reasons: ["exact lookup"],
        };
      let score = 0;
      const reasons: string[] = [];
      for (const [field, weight] of Object.entries(queryConfig.weights)) {
        const value =
          field === "title"
            ? doc.title
            : field === "aliases" || field === "tags"
              ? doc[field].join(" ")
              : doc.fields[field] || "";
        const terms = tokens(value);
        const termSet = new Set(terms);
        const overlap = [...qset].filter((t) => termSet.has(t));
        if (overlap.length) {
          score +=
            weight *
            (overlap.length / qset.size +
              0.08 * terms.filter((t) => qset.has(t)).length);
          reasons.push(`${field}:${overlap.sort().join(",")}`);
        }
      }
      if (
        qset.size &&
        doc.title.toLowerCase().includes(text.trim().toLowerCase())
      )
        score += 10;
      return {
        id: doc.id,
        type: doc.type,
        title: doc.title,
        score: Math.round(score * 1e6) / 1e6,
        match_reasons: reasons,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    query: {
      text: text.trim(),
      mode: exact === null ? "search" : "lookup",
      filters,
      limit,
    },
    total_matches: ranked.length,
    results: ranked.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r })),
  };
}
