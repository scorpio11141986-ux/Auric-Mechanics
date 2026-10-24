import assert from "node:assert/strict";
import test from "node:test";
import { birthTimeZoneInfo, deviceTimeZone, findBirthPlaces, searchTimeZones, timeZoneOptions, validTimeZone } from "../src/domain/timezones";
import { resolveBirthUtc } from "../src/domain/birth";
import { calculateChart } from "../src/domain/calculator";
import { replacePerson, emptyState, restoreState } from "../src/persistence/state";
import type { BirthRecordV1 } from "../src/domain/contracts";

const birth: BirthRecordV1 = { schema: "BirthRecordV1", id: "timezone-synthetic", name: "Synthetic time-zone check", date: "2007-03-15", localTime: "12:00", timezone: "America/Denver", latitude: 39.7392, longitude: -104.9847, place: "Denver, Colorado, United States", confidence: "exact", source: "user-entered", updatedAt: "2026-10-07T00:00:00Z" };

test("smart selector searches city, region, country, common name and standard UTC offset", () => {
  for (const query of ["Denver", "Colorado", "United States", "Mountain Time", "UTC-7", "GMT-07:00"]) {
    assert.ok(searchTimeZones(query).some(zone => zone.id === "America/Denver"), query);
  }
  assert.ok(searchTimeZones("California").some(zone => zone.id === "America/Los_Angeles"));
  assert.ok(searchTimeZones("Ontario").some(zone => zone.id === "America/Toronto"));
  assert.ok(timeZoneOptions.every(zone => validTimeZone(zone.id)));
  assert.equal(validTimeZone("+07:00"), false);
  assert.equal(validTimeZone("Invented/Zone"), false);
  // Do not collapse zones grouped by present-day offset into one historical identifier.
  for (const id of ["America/Boise", "America/Denver", "Asia/Kathmandu", "UTC"]) assert.ok(timeZoneOptions.some(zone => zone.id === id), id);
});
test("birth-date DST rules, not present-day offsets, determine UTC", () => {
  assert.equal(resolveBirthUtc({ ...birth, date: "2006-03-15" }), "2006-03-15T19:00:00.000Z");
  assert.equal(resolveBirthUtc(birth), "2007-03-15T18:00:00.000Z");
  assert.equal(resolveBirthUtc({ ...birth, timezone: "America/Phoenix" }), "2007-03-15T19:00:00.000Z");
  assert.equal(resolveBirthUtc({ ...birth, timezone: "Asia/Kathmandu", date: "1985-01-01" }), "1985-01-01T06:30:00.000Z");
  assert.equal(resolveBirthUtc({ ...birth, timezone: "Asia/Kathmandu", date: "1990-01-01" }), "1990-01-01T06:15:00.000Z");
});
test("smart birth-zone preview exposes gaps and folds rather than choosing silently", () => {
  const gap = { ...birth, date: "2024-03-10", localTime: "02:30" };
  assert.match(birthTimeZoneInfo(gap)!.error, /does not exist/);
  const fold = { ...birth, date: "2024-11-03", localTime: "01:30" };
  assert.match(birthTimeZoneInfo(fold)!.error, /occurs twice/);
  assert.equal(birthTimeZoneInfo({ ...fold, utcDisambiguation: "earlier" })!.utc, "2024-11-03T07:30:00.000Z");
  assert.equal(birthTimeZoneInfo({ ...fold, utcDisambiguation: "later" })!.utc, "2024-11-03T08:30:00.000Z");
  assert.match(birthTimeZoneInfo(birth)!.offset, /06:00/);
  assert.equal(birthTimeZoneInfo({ ...birth, timezone: "" }), null);
});
test("location lookup sends only place text and preserves ambiguous candidates", async () => {
  let called = "";
  const results = await findBirthPlaces("Denver, Colorado", undefined, (async (url) => {
    called = String(url);
    return new Response(JSON.stringify({ results: [
      { id: 1, name: "Denver", admin1: "Colorado", country: "United States", latitude: 39.7392, longitude: -104.9847, timezone: "America/Denver" },
      { id: 2, name: "Denver", admin1: "Indiana", country: "United States", latitude: 40.8639, longitude: -86.0772, timezone: "America/Indiana/Indianapolis" },
    ] }));
  }) as typeof fetch);
  const url = new URL(called);
  assert.deepEqual([...url.searchParams.keys()].sort(), ["count", "format", "language", "name"]);
  assert.equal(url.searchParams.get("name"), "Denver, Colorado");
  assert.equal(results.length, 2);
  assert.equal(results[0].timezone, "America/Denver");
  assert.equal(results[1].timezone, "America/Indiana/Indianapolis");
  assert.equal(results[0].label, "Denver, Colorado, United States");
});
test("unavailable/invalid location results fail safely and unknown zones require a selector", async () => {
  await assert.rejects(() => findBirthPlaces("D"), /2-120/);
  await assert.rejects(() => findBirthPlaces("Denver", undefined, (async () => new Response("", { status: 503 })) as typeof fetch), /unavailable/);
  await assert.rejects(() => findBirthPlaces("Denver", undefined, (async () => new Response(JSON.stringify({ results: "broken" }))) as typeof fetch), /invalid/);
  const unknown = await findBirthPlaces("Somewhere", undefined, (async () => new Response(JSON.stringify({ results: [{ id: 1, name: "Somewhere", latitude: 0, longitude: 0, timezone: "Fake/Zone" }] }))) as typeof fetch);
  assert.equal(unknown[0].timezone, "");
});
test("existing saved birth zones, facts, and observations remain unchanged by selector helpers", () => {
  const state = replacePerson(emptyState(), birth);
  state.people[0].observations.push({ id: "o", text: "Keep this separate context", kind: "USER_SUPPLIED", createdAt: birth.updatedAt });
  const original = JSON.stringify(state.people[0].birth);
  const facts = calculateChart(birth);
  deviceTimeZone(); searchTimeZones("Tokyo"); birthTimeZoneInfo(birth);
  const restored = restoreState(JSON.stringify(state));
  assert.equal(JSON.stringify(restored.people[0].birth), original);
  assert.deepEqual(restored.people[0].facts, facts);
  assert.equal(restored.people[0].observations[0].text, "Keep this separate context");
});
