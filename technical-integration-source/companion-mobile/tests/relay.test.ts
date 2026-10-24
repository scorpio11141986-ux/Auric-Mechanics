import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createRelay } from "../server/index";
import { openAIInference, SYSTEM_PROMPT } from "../server/provider";
import { contextFor } from "../src/intelligence/context";
import { calculateChart } from "../src/domain/calculator";
import { DEFAULT_PROFILE, type BirthRecordV1 } from "../src/domain/contracts";
import { validateInterpretation } from "../src/intelligence/inference";

const birth: BirthRecordV1 = {
  schema: "BirthRecordV1",
  id: "synthetic-relay",
  name: "Synthetic",
  date: "2024-01-01",
  localTime: "00:00",
  timezone: "UTC",
  latitude: 0,
  longitude: 0,
  place: "Synthetic",
  confidence: "exact",
  source: "user-entered",
  updatedAt: "2026-10-06T00:00:00Z",
};
const context = contextFor("38.1", calculateChart(birth), DEFAULT_PROFILE);
const answer = {
  answer: "Test fixture, not a live interpretation.",
  claims: [
    {
      text: "Test-only possible expression.",
      kind: "exploratory",
      subjectId: context.subject.id,
      factIds: [],
      evidenceIds: [context.evidence[0].id],
    },
  ],
  uncertainty: ["Test fixture only."],
  followUps: [],
};
const token = "synthetic-test-token-at-least-24-characters";

test("OpenAI request sends selected context, structured output, no storage and no client keys", async () => {
  let request: Record<string, any> = {};
  const fetcher = (async (_url: unknown, init: RequestInit) => {
    request = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({
        status: "completed",
        model: "test-model",
        usage: {
          input_tokens: 120,
          input_tokens_details: { cached_tokens: 20 },
          output_tokens: 40,
        },
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(answer) }] },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const result = await openAIInference(context, {
    key: "fake-test-key",
    model: "test-model",
    fetcher,
  });
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(JSON.parse(request.input).evidence.length, 1);
  assert.equal(result.usage.inputTokens, 120);
  assert.equal(result.usage.cachedInputTokens, 20);
  assert.ok(SYSTEM_PROMPT.includes("untrusted data"));
  assert.equal(result.response.kind, "AI_SYNTHESIS");
});

test("relay fails closed without budgets and deduplicates concurrent retries before charging/inference", async () => {
  let calls = 0;
  const relay = createRelay({ token, key: "fake-test-key", model: "test-model", origins: [],
    budget: { accountDailyUsd: 0.1, globalDailyUsd: 0.1, perRequestUsd: 0.1, prices: { input: 1, cached: 0.1, output: 1 }, memoryOnly: true },
    telemetry: async () => undefined,
    infer: async (c) => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { response: validateInterpretation(answer, c, "test-model"), usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 10, latencyMs: 60 } };
    },
  });
  await new Promise<void>((resolve) => relay.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(relay.address() as AddressInfo).port}/interpret`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": "duplicate-request-01" };
  const body = JSON.stringify({ birth, profile: DEFAULT_PROFILE, question: "38.1" });
  try {
    const replies = await Promise.all([fetch(url, { method: "POST", headers, body }), fetch(url, { method: "POST", headers, body })]);
    assert.deepEqual(replies.map((r) => r.status), [200, 200]);
    assert.equal(calls, 1);
    assert.equal((await fetch(url, { method: "POST", headers, body })).status, 200);
    assert.equal(calls, 1);
    assert.equal((await fetch(url, { method: "POST", headers, body: body.replace("38.1", "Gate 38") })).status, 409);
    assert.equal((await fetch(url, { method: "POST", headers: { ...headers, "Idempotency-Key": "new-request-0002" }, body })).status, 429);
    assert.equal(calls, 1);
  } finally { await new Promise<void>((resolve) => relay.close(() => resolve())); }
  const unbounded = createRelay({ token, key: "fake-test-key", model: "test-model", origins: [], telemetry: async () => undefined });
  await new Promise<void>((resolve) => unbounded.listen(0, "127.0.0.1", resolve));
  try {
    const denied = await fetch(`http://127.0.0.1:${(unbounded.address() as AddressInfo).port}/interpret`, { method: "POST", headers, body });
    assert.equal(denied.status, 503);
    assert.match((await denied.json()).error, /spending ceilings/);
  } finally { await new Promise<void>((resolve) => unbounded.close(() => resolve())); }
});
test("relay enforces authentication/CORS, recomputes evidence and records metadata-only usage", async () => {
  const events: unknown[] = [];
  let seen = "";
  const relay = createRelay({
    token,
    key: "fake-test-key",
    model: "test-model",
    origins: ["http://localhost:4178"],
    budget: { accountDailyUsd: 1, globalDailyUsd: 2, perRequestUsd: 0.1, prices: { input: 1, cached: 0.1, output: 1 }, memoryOnly: true },
    telemetry: async (e) => {
      events.push(e);
    },
    infer: async (c, opts) => {
      seen = JSON.stringify(c);
      return openAIInference(c, {
        ...opts,
        fetcher: (async () =>
          new Response(
            JSON.stringify({
              status: "completed",
              model: "test-model",
              usage: {
                input_tokens: 100,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens: 20,
              },
              output: [
                {
                  content: [
                    { type: "output_text", text: JSON.stringify(answer) },
                  ],
                },
              ],
            }),
          )) as typeof fetch,
      });
    },
  });
  await new Promise<void>((resolve) => relay.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(relay.address() as AddressInfo).port}/interpret`;
  const payload = {
    birth,
    profile: DEFAULT_PROFILE,
    question: "38.1",
    facts: { type: "FORGED" },
    evidence: [{ id: "invented" }],
  };
  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "synthetic-request-0001",
    };
    assert.equal(
      (await fetch(url, { method: "POST", body: JSON.stringify(payload) }))
        .status,
      401,
    );
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers, Origin: "https://hostile.invalid" },
          body: JSON.stringify(payload),
        })
      ).status,
      403,
    );
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.context.evidence, context.evidence);
    assert.ok(!seen.includes("FORGED"));
    assert.ok(!seen.includes("invented"));
    assert.equal(events.length, 1);
    assert.ok(!JSON.stringify(events).includes("Synthetic"));
    assert.ok(!JSON.stringify(events).includes("38.1"));
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers, "Idempotency-Key": "synthetic-invalid-0001" },
          body: JSON.stringify({
            ...payload,
            birth: { ...birth, date: "2024-02-30" },
          }),
        })
      ).status,
      400,
    );
    for (let i = 0; i < 4; i++)
      await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        })
      ).status,
      429,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      relay.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
test("unconfigured AI fails honestly; provider refusal and unsupported evidence are not rendered", async () => {
  const relay = createRelay({
    token,
    origins: [],
    telemetry: async () => undefined,
  });
  await new Promise<void>((resolve) => relay.listen(0, "127.0.0.1", resolve));
  try {
    const r = await fetch(
      `http://127.0.0.1:${(relay.address() as AddressInfo).port}/interpret`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /not configured/);
  } finally {
    await new Promise<void>((resolve) => relay.close(() => resolve()));
  }
  await assert.rejects(
    openAIInference(context, {
      key: "fake-test-key",
      model: "test-model",
      fetcher: (async () =>
        new Response(JSON.stringify({ status: "incomplete" }))) as typeof fetch,
    }),
    /did not complete/,
  );
  const fabricated = {
    ...answer,
    claims: [{ text: "Invented", evidenceIds: ["e:channel-01-08"] }],
  };
  await assert.rejects(
    openAIInference(context, {
      key: "fake-test-key",
      model: "test-model",
      fetcher: (async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                content: [
                  { type: "output_text", text: JSON.stringify(fabricated) },
                ],
              },
            ],
          }),
        )) as typeof fetch,
    }),
    /unavailable evidence/,
  );
});
