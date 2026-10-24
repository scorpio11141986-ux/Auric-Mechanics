import assert from "node:assert/strict";
import test from "node:test";
import { askRelay } from "../src/intelligence/inference";
import { contextFor } from "../src/intelligence/context";
import { calculateChart } from "../src/domain/calculator";
import { DEFAULT_PROFILE } from "../src/domain/contracts";
import { inventedBirth } from "./fixtures/cm04b-pairs";

const context = contextFor("chart", calculateChart(inventedBirth("relay-test", "1981-12-24")), DEFAULT_PROFILE);
const transportReached = new Error("mock transport reached; no network request");

test("A06 only HTTPS or complete permitted local hostnames reach relay transport", async (t) => {
  const fetcher = t.mock.method(globalThis, "fetch", async () => { throw transportReached; });
  const allowed = [
    "http://localhost:4178", "http://LOCALHOST:4178", "http://127.0.0.1:4178",
    "http://127.255.255.254:4178", "http://10.0.0.0:4178", "http://10.255.255.255",
    "http://172.16.0.0", "http://172.31.255.255", "http://192.168.0.0", "http://192.168.255.255",
    "http://[::1]:4178", "http://[0:0:0:0:0:0:0:1]:4178",
    "https://relay.example", "https://10.public.example", "https://[2001:db8::1]",
  ];
  for (const url of allowed) {
    const before = fetcher.mock.callCount();
    await assert.rejects(askRelay(url, "private-token", {}, context), error => error === transportReached, url);
    assert.equal(fetcher.mock.callCount(), before + 1, url);
    const call = fetcher.mock.calls.at(-1)!;
    assert.equal(String(call.arguments[0]), new URL("/interpret", url).href);
    assert.equal((call.arguments[1]?.headers as Record<string, string>).Authorization, "Bearer private-token");
  }
});

test("A06 insecure remote hosts and malformed literals never reach transport", async (t) => {
  const fetcher = t.mock.method(globalThis, "fetch", async () => { throw transportReached; });
  const denied = [
    "http://10.public.example", "http://192.168.public.example", "http://172.16.public.example",
    "http://172.31.public.example", "http://10.0.0.1.evil.example", "http://127.0.0.1.evil.example",
    "http://localhost.evil.example", "http://localhost@evil.example", "http://relay.example",
    "http://8.8.8.8", "http://172.15.255.255", "http://172.32.0.0", "http://192.169.0.1",
    "http://0.0.0.0", "http://169.254.1.2", "http://100.64.0.1",
    "http://[::]", "http://[2001:db8::1]", "http://[fc00::1]", "http://[fd12::1]",
    "http://[fe80::1]", "http://[::ffff:127.0.0.1]", "http://[::ffff:10.0.0.1]",
    "ftp://localhost", "http://10.256.0.1", "http://[::1::]",
  ];
  for (const url of denied) {
    const before = fetcher.mock.callCount();
    await assert.rejects(askRelay(url, "private-token", {}, context), url);
    assert.equal(fetcher.mock.callCount(), before, `insecure/invalid endpoint reached fetch: ${url}`);
  }
});

test("A06 local and HTTPS endpoints still require authorization and matching evidence", async (t) => {
  const fetcher = t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ context: {} }), { status: 200 }));
  for (const url of ["http://127.0.0.1:4178", "http://[::1]:4178", "https://relay.example"]) {
    const before = fetcher.mock.callCount();
    await assert.rejects(askRelay(url, " ", {}, context), /private relay access token/);
    assert.equal(fetcher.mock.callCount(), before);
    await assert.rejects(askRelay(url, "private-token", {}, context), /Relay evidence differs/);
  }
});
