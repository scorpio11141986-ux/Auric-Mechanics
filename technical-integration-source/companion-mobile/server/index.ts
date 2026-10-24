import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { calculateChart } from "../src/domain/calculator";
import { contextFor } from "../src/intelligence/context";
import { resolveChartAsk } from "../src/intelligence/ask-contract";
import { openAIInference } from "./provider";
import { createSpendGuard, SpendError, type SpendPolicy } from "./spend-guard";
import { validateInterpretation } from "../src/intelligence/inference";
import { CONTENT_RIGHTS } from "../src/content/inference-policy";
import type {
  BirthRecordV1,
  Observation,
  SavedQuestion,
  UserInterpretationProfileV1,
} from "../src/domain/contracts";

const dir = fileURLToPath(new URL("../telemetry/", import.meta.url));
export function createRelay(config: {
  token: string;
  key?: string;
  model?: string;
  origins: string[];
  infer?: typeof openAIInference;
  telemetry?: (event: unknown) => Promise<void>;
  budget?: SpendPolicy;
  accountId?: string;
}) {
  if (config.token.length < 24)
    throw Error("RELAY_TOKEN must be at least 24 characters.");
  if (process.env.NODE_ENV === "production" && !CONTENT_RIGHTS.commercialRedistribution)
    throw Error("Production inference is blocked: canonical content rights are unresolved");
  const limits = new Map<string, number[]>();
  const accountId = config.accountId || "private-development-account";
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(accountId)) throw Error("Invalid relay account identity");
  const spend = config.budget ? createSpendGuard(config.budget) : null;
  const running = new Map<string, { hash: string; promise: Promise<unknown> }>();
  const completed = new Map<string, { hash: string; body: unknown; at: number }>();
  const emit =
    config.telemetry ||
    (async (event: unknown) => {
      await mkdir(dir, { recursive: true });
      await appendFile(`${dir}usage.jsonl`, JSON.stringify(event) + "\n");
    });
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(body));
    };
    if (origin && !config.origins.includes(origin)) {
      send(403, { error: "Origin not allowed" });
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Idempotency-Key",
    );
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url !== "/interpret" || req.method !== "POST") {
      send(404, { error: "Not found" });
      return;
    }
    const supplied = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${config.token}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      send(401, { error: "Relay authentication required" });
      return;
    }
    const ip = accountId,
      now = Date.now();
    if (limits.size > 1000)
      for (const [address, times] of limits)
        if (!times.some((t) => now - t < 60000)) limits.delete(address);
    const recent = (limits.get(ip) || []).filter((t) => now - t < 60000);
    if (recent.length >= 6) {
      send(429, { error: "Please wait before another question." });
      return;
    }
    limits.set(ip, [...recent, now]);
    if (!config.key || !config.model) {
      send(503, {
        error:
          "AI is not configured. Offline chart evidence is still available.",
      });
      return;
    }
    if (!spend) {
      send(503, { error: "AI spending ceilings and durable accounting are not configured. No provider call was made." });
      return;
    }
    const started = Date.now();
    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });
    let reservation: ReturnType<NonNullable<typeof spend>["reserve"]> | undefined;
    let input: {
      birth: BirthRecordV1;
      profile: UserInterpretationProfileV1;
      question: string;
      observations?: Observation[];
      history?: SavedQuestion[];
      schema?: string;
    };
    try {
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        send(415, { error: "JSON is required" });
        return;
      }
      let size = 0,
        bytes = "";
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32768) {
          send(413, { error: "Request too large" });
          return;
        }
        bytes += chunk;
      }
      try {
        input = JSON.parse(bytes);
      } catch {
        throw Error("Invalid request JSON");
      }
      const id = req.headers["idempotency-key"];
      if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{8,120}$/.test(id)) throw Error("Invalid request idempotency key");
      const payloadHash = createHash("sha256").update(bytes).digest("hex");
      const requestKey = `${accountId}:${id}`;
      for (const [key, item] of completed) if (Date.now() - item.at > 15 * 60000) completed.delete(key);
      const previous = completed.get(requestKey) || running.get(requestKey);
      if (previous) {
        if (previous.hash !== payloadHash) throw new SpendError("Idempotency key reused with different content", 409);
        send(200, "body" in previous ? previous.body : await previous.promise);
        return;
      }
      if (running.size >= 1 || completed.size >= 200) throw new SpendError("Private relay capacity reached; wait before another request");
      if (
        !input ||
        typeof input.question !== "string" ||
        (input.observations !== undefined &&
          (!Array.isArray(input.observations) ||
            input.observations.length > 20 ||
            input.observations.some(
              (o) => !o || typeof o.text !== "string" || o.text.length > 600,
            ))) ||
        (input.history !== undefined &&
          (!Array.isArray(input.history) ||
            input.history.length > 2 ||
            input.history.some(
              (h) =>
                !h ||
                !h.context ||
                typeof h.context.question !== "string" ||
                (h.response && typeof h.response.answer !== "string"),
            )))
      )
        throw Error("Invalid request");
      if (input.schema !== undefined && input.schema !== "ChartAskRequestV1") throw Error("Invalid request: unsupported Ask contract");
      if (!input.schema && ["scope", "selection", "expectedContextHash", "sourcePolicy", "preferences", "requestId"].some(k => k in input)) throw Error("Invalid request: scoped Ask requires ChartAskRequestV1");
      // Bare legacy questions remain a whole-chart adapter. New scoped requests
      // must pass issuance, target, source-policy and context-digest checks first.
      const context = input.schema === "ChartAskRequestV1"
        ? resolveChartAsk(input, id)
        : contextFor(input.question, calculateChart(input.birth), input.profile, input.observations || [], input.history || []);
      if (input.history?.some((h) => h.context.subject?.id !== input.birth.id))
        throw Error("Invalid request: history subject differs from selected birth record");
      if (!context.evidence.length) {
        send(422, {
          error:
            "That mechanic is not active in this chart. Explore it in the reference reader instead.",
        });
        return;
      }
      reservation = spend.reserve(accountId, id, payloadHash, Buffer.byteLength(JSON.stringify(context)));
      const operation = (async () => {
        const result = await (config.infer || openAIInference)(context, {
          key: config.key!, model: config.model!, signal: controller.signal,
        });
        if (controller.signal.aborted) throw Error("Request cancelled; provider usage may still have occurred");
        // Validate at the service boundary even when an injected provider bypasses its own validator.
        const response = validateInterpretation({
          answer: result.response.answer,
          claims: result.response.claims.map((c) => ({ kind: c.kind, subjectId: c.subjectId,
            text: c.kind === "source-supported" ? c.text.replace(/^Source description, not a proven personal trait: /, "") : c.text,
            evidenceIds: c.evidenceIds, factIds: c.factIds })),
          uncertainty: result.response.uncertainty.slice(0, 12), followUps: [],
        }, context, config.model!);
        return { ...result, response };
      })();
      const bodyPromise = operation.then((result) => ({ context, response: result.response }));
      running.set(requestKey, { hash: payloadHash, promise: bodyPromise });
      // Attach a rejection handler immediately; duplicate callers still observe the rejection.
      void bodyPromise.catch(() => undefined);
      let result: Awaited<ReturnType<typeof openAIInference>>;
      try { result = await operation; } finally { running.delete(requestKey); }
      const inputPrice = config.budget!.prices.input,
        cachedPrice = config.budget!.prices.cached,
        outputPrice = config.budget!.prices.output;
      const u = result.usage;
      const estimatedCostUsd = [
        inputPrice,
        cachedPrice,
        outputPrice,
        u.inputTokens,
        u.cachedInputTokens,
        u.outputTokens,
      ].every((v) => v !== null)
        ? ((u.inputTokens! - u.cachedInputTokens!) * inputPrice! +
            u.cachedInputTokens! * cachedPrice! +
            u.outputTokens! * outputPrice!) /
          1e6
        : null;
      await emit({
        at: new Date().toISOString(),
        category: "chart-question",
        accountId,
        model: result.response.model.id,
        contextVersion: context.schema,
        contextBytes: Buffer.byteLength(JSON.stringify(context)),
        ...u,
        estimatedCostUsd,
        actualCostUsd: null,
        retryCount: 0,
        ...reservation,
        pricingSource:
          estimatedCostUsd === null ? "not-configured" : "operator-configured",
        state: "completed",
      });
      const responseBody = { context, response: result.response };
      completed.set(requestKey, { hash: payloadHash, body: responseBody, at: Date.now() });
      send(200, responseBody);
    } catch (error) {
      const failedUsage =
        (error as { usage?: Record<string, unknown> })?.usage || {};
      await emit({
        at: new Date().toISOString(),
        category: "chart-question",
        accountId,
        model: config.model,
        latencyMs: Date.now() - started,
        ...failedUsage,
        state: "failed",
        estimatedCostUsd: null,
        actualCostUsd: null,
        retryCount: 0,
        ...reservation,
      }).catch(() => undefined);
      const message = error instanceof Error ? error.message : "Request failed";
      const validation =
        /birth|date|time|timezone|Latitude|name|profile|question|record identity|Invalid request/i.test(
          message,
        );
      send(error instanceof SpendError ? error.status : validation ? 400 : 502, {
        error: validation
          ? message
          : error instanceof SpendError ? error.message : "AI request failed or failed evidence validation. No answer was saved.",
      });
    }
  });
  server.on("close", () => spend?.close());
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const host = process.env.RELAY_HOST || "127.0.0.1",
    port = Number(process.env.RELAY_PORT || 8787);
  const server = createRelay({
    token: process.env.RELAY_TOKEN || "",
    key: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
    budget: ["ACCOUNT_DAILY_USD", "GLOBAL_DAILY_USD", "MAX_REQUEST_USD", "INPUT_USD_PER_MILLION", "CACHED_INPUT_USD_PER_MILLION", "OUTPUT_USD_PER_MILLION"].every((key) => process.env[key]?.trim()) ? {
      accountDailyUsd: Number(process.env.ACCOUNT_DAILY_USD), globalDailyUsd: Number(process.env.GLOBAL_DAILY_USD),
      perRequestUsd: Number(process.env.MAX_REQUEST_USD), ledgerPath: `${dir}spend-ledger.json`,
      prices: { input: Number(process.env.INPUT_USD_PER_MILLION), cached: Number(process.env.CACHED_INPUT_USD_PER_MILLION), output: Number(process.env.OUTPUT_USD_PER_MILLION) },
    } : undefined,
    origins: (
      process.env.ALLOWED_ORIGINS ||
      "http://localhost:4178,http://127.0.0.1:4178,http://localhost:8081"
    ).split(","),
  });
  server.listen(port, host, () =>
    console.log(
      `Private development relay: http://${host}:${port}; AI ${process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? "configured" : "unconfigured"}. Not a public production service.`,
    ),
  );
}
