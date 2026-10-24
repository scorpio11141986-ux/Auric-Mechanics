import { rawTimeZones, timeZonesNames } from "@vvo/tzdb";
import type { BirthRecordV1 } from "./contracts";
import { resolveBirthUtc } from "./birth";

export function validTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone || /^[+-]/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}
const regions: Record<string, string> = {
  "America/Denver": "Colorado Wyoming Montana Utah New Mexico mountain",
  "America/Boise": "Idaho mountain",
  "America/Phoenix": "Arizona mountain no daylight saving",
  "America/Los_Angeles": "California Washington Oregon Nevada pacific",
  "America/New_York": "New York Massachusetts eastern Florida Boston",
  "America/Chicago": "Illinois Texas central western Florida",
  "America/Detroit": "Michigan eastern",
  "America/Anchorage": "Alaska",
  "Pacific/Honolulu": "Hawaii",
  "America/Toronto": "Ontario eastern",
  "America/Vancouver": "British Columbia pacific",
  "America/Edmonton": "Alberta mountain",
  "Australia/Sydney": "New South Wales",
  "Australia/Brisbane": "Queensland",
  "Australia/Melbourne": "Victoria",
  "Australia/Perth": "Western Australia",
  "Australia/Adelaide": "South Australia",
  "Australia/Hobart": "Tasmania",
};
export type TimeZoneOption = {
  id: string;
  label: string;
  country: string;
  search: string;
};
// Expand every identifier, not only grouped representatives: historical rules can differ.
export const timeZoneOptions: TimeZoneOption[] = [
  ...new Set(["UTC", ...timeZonesNames]),
]
  .filter(validTimeZone)
  .map((id) => {
    const meta = rawTimeZones.find((zone) => zone.group.includes(id));
    const city =
      id === "UTC"
        ? "Coordinated Universal Time"
        : id.split("/").slice(1).join(" / ").replaceAll("_", " ");
    const label =
      id === "UTC"
        ? city
        : `${meta?.alternativeName || id.split("/")[0]} - ${city}`;
    return {
      id,
      label,
      country: meta?.countryName || "",
      search: [
        id,
        label,
        meta?.countryName,
        meta?.countryCode,
        meta?.abbreviation,
        meta?.rawFormat,
        ...(meta?.mainCities || []),
        regions[id] || "",
      ]
        .join(" ")
        .toLowerCase(),
    };
  });
export function timeZoneLabel(id: string) {
  return (
    timeZoneOptions.find((zone) => zone.id === id)?.label ||
    id.replaceAll("_", " ")
  );
}
export function searchTimeZones(text: string) {
  const normalized = text.trim().toLowerCase().replace(/[−–]/g, "-");
  const offset = normalized.match(
    /^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/,
  );
  const terms = normalized.split(/[\s,]+/).filter(Boolean);
  return timeZoneOptions
    .filter((zone) => {
      if (offset) {
        const minutes =
          (+offset[2] * 60 + +(offset[3] || 0)) * (offset[1] === "-" ? -1 : 1);
        const meta = rawTimeZones.find((row) => row.group.includes(zone.id));
        return (zone.id === "UTC" ? 0 : meta?.rawOffsetInMinutes) === minutes;
      }
      return terms.every((term) => zone.search.includes(term));
    })
    .sort((a, b) => {
      const exact = (zone: TimeZoneOption) =>
        zone.id.toLowerCase().split("/").at(-1)?.replaceAll("_", " ") ===
        normalized
          ? 0
          : 1;
      return exact(a) - exact(b) || a.label.localeCompare(b.label);
    });
}
export function deviceTimeZone() {
  try {
    const id = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validTimeZone(id) ? id : "UTC";
  } catch {
    return "UTC";
  }
}
export function birthTimeZoneInfo(birth: BirthRecordV1) {
  if (
    birth.confidence === "range" || birth.confidence === "unknown" ||
    !birth.timezone ||
    !/^\d{4}-\d{2}-\d{2}$/.test(birth.date) ||
    !/^\d{2}:\d{2}$/.test(birth.localTime)
  )
    return null;
  try {
    const utc = resolveBirthUtc({
      ...birth,
      name: birth.name || "Time zone preview",
    });
    const formatter = new Intl.DateTimeFormat("en", {
      timeZone: birth.timezone,
      timeZoneName: "longOffset",
    });
    const offset =
      formatter
        .formatToParts(new Date(utc))
        .find((part) => part.type === "timeZoneName")?.value || "";
    return { utc, offset, error: "" };
  } catch (error) {
    return { utc: "", offset: "", error: (error as Error).message };
  }
}
export type BirthPlace = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
};
export async function findBirthPlaces(
  text: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<BirthPlace[]> {
  const query = text.trim();
  if (query.length < 2 || query.length > 120)
    throw Error("Enter a city or postal code (2-120 characters).");
  const response = await fetcher(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=12&language=en&format=json`,
    { signal },
  );
  if (!response.ok)
    throw Error(
      "Location search is unavailable. Try again or select a time zone manually.",
    );
  const body = await response.json();
  if (!body || (body.results !== undefined && !Array.isArray(body.results)))
    throw Error("Location service returned an invalid response.");
  return (body.results || [])
    .filter(
      (place: Record<string, unknown>) =>
        place &&
        typeof place.name === "string" &&
        Number.isFinite(place.latitude) &&
        Number.isFinite(place.longitude) &&
        Math.abs(Number(place.latitude)) <= 90 &&
        Math.abs(Number(place.longitude)) <= 180,
    )
    .map((place: Record<string, unknown>) => ({
      id: String(place.id),
      label: [
        ...new Set(
          [place.name, place.admin1, place.country].filter(
            (value) => typeof value === "string" && value,
          ),
        ),
      ]
        .join(", ")
        .slice(0, 160),
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      timezone: validTimeZone(place.timezone) ? place.timezone : "",
    }));
}
