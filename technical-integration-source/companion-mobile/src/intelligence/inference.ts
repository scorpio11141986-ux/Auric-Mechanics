import type {
  AIContextV1,
  InterpretationResponseV1,
} from "../domain/contracts";
import { validateClaims } from "./claims";
import { requestSignal } from "./request-signal";
import { assertChartAskContext, type ChartAskRequestV1 } from "./ask-contract";

export const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "claims", "uncertainty", "followUps"],
  properties: {
    answer: { type: "string" },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "subjectId", "text", "evidenceIds", "factIds"],
        properties: {
          kind: { type: "string", enum: ["mechanical", "source-supported", "exploratory"] },
          subjectId: { type: "string" },
          text: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
          factIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    uncertainty: { type: "array", items: { type: "string" } },
    followUps: { type: "array", items: { type: "string" } },
  },
};
function strings(
  value: unknown,
  max: number,
  length: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every(
      (x) => typeof x === "string" && x.trim().length > 0 && x.length <= length,
    )
  );
}
export function validateInterpretation(
  raw: unknown,
  context: AIContextV1,
  model: string,
): InterpretationResponseV1 {
  const obj = raw as Record<string, unknown>;
  if (
    !obj ||
    typeof obj !== "object" ||
    Array.isArray(obj) ||
    Object.keys(obj).some(
      (k) => !["answer", "claims", "uncertainty", "followUps"].includes(k),
    )
  )
    throw Error("Invalid interpretation response");
  if (
    typeof obj.answer !== "string" ||
    !obj.answer.trim() ||
    obj.answer.length > 8000 ||
    !Array.isArray(obj.claims) ||
    !obj.claims.length ||
    obj.claims.length > 8 ||
    !strings(obj.uncertainty, 12, 1000) ||
    !strings(obj.followUps, 4, 600)
  )
    throw Error("Invalid interpretation response");
  const claims = validateClaims(obj.claims, context);
  return {
    schema: "InterpretationResponseV1",
    kind: "AI_SYNTHESIS",
    answer: claims.map((c) => c.text).join("\n\n"),
    claims,
    uncertainty: [...new Set([...context.uncertainty, ...obj.uncertainty,
      "Mechanical text is rendered from deterministic facts; source excerpts are verified only against the recovered packet. Exploratory synthesis is not semantically proven."])],
    followUps: [],
    confidence: "interpretive-not-established",
    model: { provider: "OpenAI", id: model },
    contextVersion: "AIContextV1",
    validationVersion: "ClaimValidationV1",
  };
}

// The URL parser validates/canonicalizes IP literals before this check. Keep
// the development exception limited to localhost, IPv4 loopback/RFC1918 and
// IPv6 loopback. Other IPv6 (including mapped IPv4) still requires HTTPS.
function isLocalDevelopmentHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const octets = hostname.split(".").map(Number);
  if (octets.some(octet => octet > 255)) return false;
  const [first, second] = octets;
  return first === 127 || first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

export async function askRelay(
  url: string,
  token: string,
  payload: unknown,
  context: AIContextV1,
  request?: { id: string; signal?: AbortSignal },
) {
  const endpoint = new URL(url);
  const local = isLocalDevelopmentHost(endpoint.hostname);
  if (
    endpoint.protocol !== "https:" &&
    !(endpoint.protocol === "http:" && local)
  )
    throw Error("Use HTTPS, or a private local development relay.");
  if (!token.trim()) throw Error("Enter the private relay access token.");
  const scoped = payload as Partial<ChartAskRequestV1> | null;
  if (context.ask || scoped?.schema === "ChartAskRequestV1") {
    assertChartAskContext(payload as ChartAskRequestV1, context);
    if (request?.id && request.id !== scoped?.requestId) throw Error("Invalid request: Ask identity differs from idempotency key");
  }
  const pending = requestSignal(65000, request?.signal);
  try {
  const response = await fetch(new URL("/interpret", endpoint), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": request?.id || scoped?.requestId || `question-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    body: JSON.stringify(payload),
    signal: pending.signal,
  });
  const body = await response.json();
  if (!response.ok)
    throw Error(body.error || "The interpretation service is unavailable.");
  if (
    JSON.stringify(body.context) !== JSON.stringify(context)
  )
    throw Error(
      "Relay evidence differs from this chart or dataset; answer rejected.",
    );
  return {
    context: body.context as AIContextV1,
    response: validateInterpretation(
      {
        answer: body.response.answer,
        claims: body.response.claims.map((c: InterpretationResponseV1["claims"][number]) => ({
          kind: c.kind, subjectId: c.subjectId, text: c.kind === "source-supported" ? c.text.replace(/^Source description, not a proven personal trait: /, "") : c.text,
          evidenceIds: c.evidenceIds, factIds: c.factIds,
        })),
        uncertainty: body.response.uncertainty.slice(0, 12),
        followUps: body.response.followUps,
      },
      body.context,
      body.response.model.id,
    ),
  };
  } finally { pending.dispose(); }
}
